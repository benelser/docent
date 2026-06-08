// indexDirectory — walk a directory of mixed engineering artifacts (wiki
// pages, architecture diagrams, screen-recording demos, runbook configs,
// code snippets) and produce a typed manifest the FDE/SRE survey agent
// consumes when authoring a lunch-and-learn film via docent's explainer
// mode.
//
// Classification is extension-first; for ambiguous extensions (.json,
// .yml, .yaml) the first ~4KB is sniffed for runbook-shaped keys to
// route between `runbook-config` and `code`. For media (images, videos)
// the file is shelled out to ffprobe to extract width/height and (for
// video) duration + audio presence. ffprobe is OPTIONAL — if it isn't
// on PATH or fails, the entry's `media` is left absent and the index's
// run-level warning list surfaces the miss; we never throw.
//
// This file is Node-only at runtime (it touches `node:fs` and
// `node:child_process`), but the `@bjelser/kit` package's public surface
// is bundled into the browser by Remotion. So we use the webpack-opaque
// indirect-require pattern (`new Function('id', 'return require(id)')`)
// to hide the imports from static analysis — the same trick
// `packages/core/src/features/audio-bed/index.tsx` and
// `packages/core/src/scenes/figure/validate.ts` use.

// ---------- types -----------------------------------------------------------

export type AssetKind =
  | 'wiki'              // .md, .mdx, .rst, .txt
  | 'diagram'           // .png, .jpg, .jpeg, .svg, .webp
  | 'screen-recording'  // .mp4, .mov, .webm, .mkv
  | 'runbook-config'    // .yml, .yaml, .json (heuristic: runbook-shaped keys)
  | 'code'              // .ts, .tsx, .js, .py, .go, .rs, .sh, .tf, .hcl
  | 'unknown';

export interface MediaProbe {
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;  // recordings only
  readonly hasAudio?: boolean;        // recordings only
}

export interface AssetEntry {
  readonly path: string;        // absolute path
  readonly relPath: string;     // relative to the indexed directory root
  readonly kind: AssetKind;
  readonly sizeBytes: number;
  readonly media?: MediaProbe;  // present iff kind is 'diagram' or 'screen-recording'
}

export interface AssetIndex {
  readonly rootDir: string;
  readonly entries: ReadonlyArray<AssetEntry>;
  readonly byKind: Readonly<Record<AssetKind, ReadonlyArray<AssetEntry>>>;
  readonly indexedAt: string;   // ISO timestamp
  readonly warnings: ReadonlyArray<string>;
}

export interface IndexDirectoryOptions {
  readonly probeMedia?: boolean;            // default true
  readonly maxDepth?: number;               // default 10
  readonly skip?: ReadonlyArray<string>;    // default ['.git', 'node_modules', '.docent', 'out']
}

// ---------- Node-only indirect requires ------------------------------------
//
// Webpack's static analyzer can't see through `new Function('return require')()`.
// The browser bundle never executes these paths, but the module is reachable
// from the public surface; we have to keep the static analyzer happy.

interface NodeFsBits {
  readonly readdirSync: (
    p: string,
    opts: {withFileTypes: true},
  ) => ReadonlyArray<{
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }>;
  readonly statSync: (p: string) => {size: number; isDirectory(): boolean};
  readonly readFileSync: (p: string, opts?: {encoding?: string}) => Buffer | string;
  readonly openSync: (p: string, flags: string) => number;
  readonly readSync: (
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: number | null,
  ) => number;
  readonly closeSync: (fd: number) => void;
  readonly existsSync: (p: string) => boolean;
}

interface NodePathBits {
  readonly join: (...parts: string[]) => string;
  readonly resolve: (...parts: string[]) => string;
  readonly relative: (from: string, to: string) => string;
  readonly extname: (p: string) => string;
  readonly basename: (p: string) => string;
  readonly sep: string;
}

interface NodeChildProcessBits {
  readonly spawnSync: (
    cmd: string,
    args: ReadonlyArray<string>,
    opts?: {encoding?: 'utf8' | 'buffer'; timeout?: number},
  ) => {
    status: number | null;
    stdout: string | Buffer;
    stderr: string | Buffer;
    error?: Error;
  };
}

// Two-tier resolution: try the bundler-CJS pattern (`new Function('id',
// 'return require(id)')`) first — this is what Remotion/webpack pulls in
// when the kit's public surface is bundled into the browser entry, and
// it correctly fails fast in the browser context where `require` is not
// defined. When that fails, fall back to the ESM-native dynamic import
// (`new Function('p', 'return import(p)')`) so a direct `bun
// path/to/script.ts` consumer still resolves the Node builtins. Both
// patterns are webpack-opaque — the bundler's static analyser cannot
// follow the string-concatenated specifier — so the browser bundle
// never tries to resolve `node:*`.
const loadFs = async (): Promise<NodeFsBits | null> => {
  try {
    const req = new Function('id', 'return require(id)') as (id: string) => NodeFsBits;
    return req('node:fs');
  } catch {
    try {
      const dyn = new Function('p', 'return import(p)') as (p: string) => Promise<NodeFsBits>;
      return await dyn('node:fs');
    } catch {
      return null;
    }
  }
};

const loadPath = async (): Promise<NodePathBits | null> => {
  try {
    const req = new Function('id', 'return require(id)') as (id: string) => NodePathBits;
    return req('node:path');
  } catch {
    try {
      const dyn = new Function('p', 'return import(p)') as (p: string) => Promise<NodePathBits>;
      return await dyn('node:path');
    } catch {
      return null;
    }
  }
};

const loadChildProcess = async (): Promise<NodeChildProcessBits | null> => {
  try {
    const req = new Function('id', 'return require(id)') as (id: string) => NodeChildProcessBits;
    return req('node:child_process');
  } catch {
    try {
      const dyn = new Function('p', 'return import(p)') as (p: string) => Promise<NodeChildProcessBits>;
      return await dyn('node:child_process');
    } catch {
      return null;
    }
  }
};

// ---------- classification --------------------------------------------------

const WIKI_EXTS = new Set(['.md', '.mdx', '.rst', '.txt']);
const DIAGRAM_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp']);
const RECORDING_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv']);
const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.sh', '.bash', '.zsh',
  '.tf', '.hcl',
]);
const AMBIGUOUS_EXTS = new Set(['.json', '.yml', '.yaml']);

// Runbook-shaped keys we sniff for. The match is intentionally loose
// (case-insensitive substring on the leading ~4KB) — we are routing
// between two buckets, not validating a schema. False positives go to
// `runbook-config`; the friction note in the report calls this out.
const RUNBOOK_KEY_REGEX =
  /(^|[\s"'\n])(alerts?|runbook|on[-_]?call|severity|escalation|pager(duty)?|incident|playbook)["']?\s*:/i;

const sniffRunbookContent = (text: string): boolean =>
  RUNBOOK_KEY_REGEX.test(text);

const classifyByExt = (ext: string): AssetKind | null => {
  const e = ext.toLowerCase();
  if (WIKI_EXTS.has(e)) return 'wiki';
  if (DIAGRAM_EXTS.has(e)) return 'diagram';
  if (RECORDING_EXTS.has(e)) return 'screen-recording';
  if (CODE_EXTS.has(e)) return 'code';
  return null;
};

// Read the first ~4KB of a file as utf-8 text. Used for content sniffing
// the ambiguous extensions (.json, .yml, .yaml). We deliberately read a
// fixed prefix, not the whole file — a runbook YAML almost always names
// its top-level keys in the first kilobyte; reading more is wasted I/O
// on a 50MB JSON dump.
const readHead = (
  fs: NodeFsBits,
  filePath: string,
  bytes: number,
): string => {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, read).toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
  }
};

const classifyAmbiguous = (
  fs: NodeFsBits,
  filePath: string,
): AssetKind => {
  const head = readHead(fs, filePath, 4096);
  return sniffRunbookContent(head) ? 'runbook-config' : 'code';
};

// ---------- ffprobe ---------------------------------------------------------

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
}

interface FfprobeFormat {
  duration?: string;
}

interface FfprobeOutput {
  streams?: ReadonlyArray<FfprobeStream>;
  format?: FfprobeFormat;
}

/**
 * Run ffprobe against a media file and return a normalized MediaProbe.
 * Returns null on any failure — caller threads the miss into the
 * AssetIndex's run-level warning list rather than the per-entry data.
 *
 * Timeout: 10s. ffprobe on a corrupt file occasionally wedges; the
 * timeout is the safety. The smoke test confirms a missing-from-PATH
 * ffprobe surfaces a warning and the index still completes.
 */
const probeMedia = (
  cp: NodeChildProcessBits,
  filePath: string,
  kind: 'diagram' | 'screen-recording',
): MediaProbe | null => {
  let result;
  try {
    result = cp.spawnSync(
      'ffprobe',
      [
        '-v', 'error',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        filePath,
      ],
      {encoding: 'utf8', timeout: 10_000},
    );
  } catch {
    return null;
  }
  if (result.error || result.status !== 0) return null;
  const stdout = typeof result.stdout === 'string' ? result.stdout : result.stdout.toString('utf8');
  if (!stdout.trim()) return null;
  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    return null;
  }
  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  if (!videoStream) return null;
  const probe: {
    width?: number;
    height?: number;
    durationSeconds?: number;
    hasAudio?: boolean;
  } = {};
  if (typeof videoStream.width === 'number') probe.width = videoStream.width;
  if (typeof videoStream.height === 'number') probe.height = videoStream.height;
  if (kind === 'screen-recording') {
    const durStr =
      parsed.format?.duration ?? videoStream.duration ?? undefined;
    if (typeof durStr === 'string') {
      const d = Number(durStr);
      if (Number.isFinite(d)) probe.durationSeconds = d;
    }
    probe.hasAudio = streams.some((s) => s.codec_type === 'audio');
  }
  return probe;
};

// ---------- SVG: parse width/height from the XML attributes ----------------
//
// Trade-off: we COULD shell out to ffprobe for SVGs too, but ffprobe's
// SVG handling is patchy (it rasterizes via librsvg if present, fails
// silently otherwise). Parsing the XML attributes is reliable, browser-
// bundle-safe, and doesn't depend on an external tool. We pick up width
// and height when both are integer-pixel literals OR when the viewBox
// is present and we can read a `<svg ... viewBox="0 0 W H">`. We do NOT
// try to follow units (`em`, `cm`) or solve the responsive case — those
// are not load-bearing for an architecture-diagram index.
const SVG_HEAD_BYTES = 2048;
const SVG_TAG_REGEX = /<svg\b([^>]*)>/i;
const SVG_WIDTH_ATTR = /\bwidth\s*=\s*"(\d+(?:\.\d+)?)(?:px)?"/i;
const SVG_HEIGHT_ATTR = /\bheight\s*=\s*"(\d+(?:\.\d+)?)(?:px)?"/i;
const SVG_VIEWBOX_ATTR = /\bviewBox\s*=\s*"\s*[-\d.]+\s+[-\d.]+\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*"/i;

const probeSvg = (fs: NodeFsBits, filePath: string): MediaProbe | null => {
  const head = readHead(fs, filePath, SVG_HEAD_BYTES);
  if (!head) return null;
  const tagMatch = SVG_TAG_REGEX.exec(head);
  if (!tagMatch) return null;
  const attrs = tagMatch[1] ?? '';
  const widthMatch = SVG_WIDTH_ATTR.exec(attrs);
  const heightMatch = SVG_HEIGHT_ATTR.exec(attrs);
  const viewBoxMatch = SVG_VIEWBOX_ATTR.exec(attrs);
  const probe: {width?: number; height?: number} = {};
  if (widthMatch?.[1]) {
    const w = Number(widthMatch[1]);
    if (Number.isFinite(w)) probe.width = Math.round(w);
  }
  if (heightMatch?.[1]) {
    const h = Number(heightMatch[1]);
    if (Number.isFinite(h)) probe.height = Math.round(h);
  }
  // viewBox fallback for SVGs that only declare a viewBox (responsive layout)
  if (probe.width === undefined && viewBoxMatch?.[1]) {
    const w = Number(viewBoxMatch[1]);
    if (Number.isFinite(w)) probe.width = Math.round(w);
  }
  if (probe.height === undefined && viewBoxMatch?.[2]) {
    const h = Number(viewBoxMatch[2]);
    if (Number.isFinite(h)) probe.height = Math.round(h);
  }
  return probe.width !== undefined || probe.height !== undefined ? probe : null;
};

// ---------- the walker ------------------------------------------------------

const DEFAULT_SKIP = ['.git', 'node_modules', '.docent', 'out'] as const;
const DEFAULT_MAX_DEPTH = 10;

interface WalkContext {
  readonly fs: NodeFsBits;
  readonly path: NodePathBits;
  readonly rootDir: string;
  readonly skip: ReadonlySet<string>;
  readonly maxDepth: number;
  readonly visited: Set<string>;       // for symlink cycle detection
  readonly warnings: string[];
}

const walk = (ctx: WalkContext, dirPath: string, depth: number): string[] => {
  if (depth > ctx.maxDepth) {
    ctx.warnings.push(
      `max-depth (${ctx.maxDepth}) reached at ${ctx.path.relative(ctx.rootDir, dirPath) || '.'}`,
    );
    return [];
  }
  let entries;
  try {
    entries = ctx.fs.readdirSync(dirPath, {withFileTypes: true});
  } catch (e) {
    ctx.warnings.push(`readdir failed at ${dirPath}: ${(e as Error).message}`);
    return [];
  }
  const out: string[] = [];
  for (const dirent of entries) {
    if (ctx.skip.has(dirent.name)) continue;
    const full = ctx.path.join(dirPath, dirent.name);
    // Symbolic links: we DO NOT follow them. Following symlinks risks
    // cycles (a -> b -> a) and inflates the index with the linked tree.
    // The asset-index is meant to describe what the user explicitly
    // dropped in the directory; an aliased reference is not that.
    if (dirent.isSymbolicLink()) {
      ctx.warnings.push(
        `symlink skipped: ${ctx.path.relative(ctx.rootDir, full)}`,
      );
      continue;
    }
    if (dirent.isDirectory()) {
      out.push(...walk(ctx, full, depth + 1));
    } else if (dirent.isFile()) {
      out.push(full);
    }
    // Block devices, fifos, sockets — silently skip.
  }
  return out;
};

// ---------- the public entrypoint ------------------------------------------

const KIND_LIST: ReadonlyArray<AssetKind> = [
  'wiki',
  'diagram',
  'screen-recording',
  'runbook-config',
  'code',
  'unknown',
];

const emptyByKind = (): Record<AssetKind, AssetEntry[]> => ({
  wiki: [],
  diagram: [],
  'screen-recording': [],
  'runbook-config': [],
  code: [],
  unknown: [],
});

export const indexDirectory = async (
  rootDir: string,
  opts?: IndexDirectoryOptions,
): Promise<AssetIndex> => {
  const fs = await loadFs();
  const path = await loadPath();
  const cp = await loadChildProcess();
  if (!fs || !path) {
    throw new Error(
      'indexDirectory: node:fs / node:path not available — this API is Node-only',
    );
  }
  const probeMediaFlag = opts?.probeMedia ?? true;
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const skip = new Set<string>(opts?.skip ?? DEFAULT_SKIP);
  const warnings: string[] = [];

  const absRoot = path.resolve(rootDir);
  if (!fs.existsSync(absRoot)) {
    throw new Error(`indexDirectory: rootDir does not exist: ${absRoot}`);
  }

  // Verify ffprobe is reachable IFF media probing is requested. Surface a
  // single run-level warning rather than once per file — a noisy log is
  // worse UX than a single advisory.
  let ffprobeAvailable = false;
  if (probeMediaFlag && cp) {
    try {
      const check = cp.spawnSync('ffprobe', ['-version'], {
        encoding: 'utf8',
        timeout: 5_000,
      });
      ffprobeAvailable = check.status === 0;
    } catch {
      ffprobeAvailable = false;
    }
    if (!ffprobeAvailable) {
      warnings.push(
        'ffprobe not on PATH (or failed to start) — media entries will lack width/height/duration',
      );
    }
  }

  const ctx: WalkContext = {
    fs,
    path,
    rootDir: absRoot,
    skip,
    maxDepth,
    visited: new Set<string>(),
    warnings,
  };
  const files = walk(ctx, absRoot, 0);

  const entries: AssetEntry[] = [];
  for (const file of files) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch (e) {
      warnings.push(`stat failed for ${file}: ${(e as Error).message}`);
      continue;
    }
    const ext = path.extname(file);
    let kind: AssetKind;
    if (AMBIGUOUS_EXTS.has(ext.toLowerCase())) {
      kind = classifyAmbiguous(fs, file);
    } else {
      kind = classifyByExt(ext) ?? 'unknown';
    }
    let media: MediaProbe | undefined;
    if (probeMediaFlag && (kind === 'diagram' || kind === 'screen-recording')) {
      if (ext.toLowerCase() === '.svg') {
        const svgProbe = probeSvg(fs, file);
        if (svgProbe) media = svgProbe;
      } else if (ffprobeAvailable && cp) {
        const p = probeMedia(cp, file, kind);
        if (p) media = p;
        else warnings.push(`ffprobe failed for ${path.relative(absRoot, file)}`);
      }
    }
    const entry: AssetEntry = {
      path: file,
      relPath: path.relative(absRoot, file),
      kind,
      sizeBytes: stat.size,
      ...(media ? {media} : {}),
    };
    entries.push(entry);
  }

  // Deterministic order: sort by relPath.
  entries.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));

  const byKindMut = emptyByKind();
  for (const entry of entries) {
    byKindMut[entry.kind].push(entry);
  }
  // Freeze each bucket so the public contract `ReadonlyArray<AssetEntry>` is
  // not just a type-level lie.
  const byKind = {} as Record<AssetKind, ReadonlyArray<AssetEntry>>;
  for (const k of KIND_LIST) {
    byKind[k] = Object.freeze(byKindMut[k].slice());
  }

  return {
    rootDir: absRoot,
    entries: Object.freeze(entries.slice()),
    byKind: Object.freeze(byKind),
    indexedAt: new Date().toISOString(),
    warnings: Object.freeze(warnings.slice()),
  };
};
