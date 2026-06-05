// FCPXML parser — the round-trip ingest stage's read side (R11.4).
//
// Reads a Final Cut Pro XML file an editor produced (typically by exporting
// from a docent-rendered MP4 and tweaking the timeline in FCP / Resolve /
// Premiere) and returns an internal, parser-agnostic representation: a flat
// list of clips on the primary spine, each tagged with the source-of-truth
// scene id when one is embedded, otherwise unannotated.
//
// What this file does:
//   - Parse the FCPXML XML text with a zero-dep regex extractor (the FCPXML
//     fragments we care about are small and well-shaped; a full DOM is
//     overkill and pulls a heavy library dependency).
//   - Walk every clip on the primary `<spine>` of the first
//     `<project>`/`<sequence>`.
//   - Read the frame-rate from the sequence header.
//   - Resolve every clip's `[startFrame, endFrame)` window in the spine's
//     timeline.
//   - Read the docent scene id from each clip, looked up in this order:
//       1. A direct `docent:sceneId="…"` attribute on the clip.
//       2. The first `<note>docent:sceneId=…</note>` child whose body
//          starts with the `docent:sceneId=` token.
//       3. (fallback) `undefined` — the caller decides whether to
//          fall back to position-based matching.
//   - Capture any chapter markers the editor added so the diff caller can
//     surface them (per the friction note "Marker survival").
//
// What this file does NOT do:
//   - Touch the filesystem. The CLI shell reads the FCPXML bytes; this
//     module parses them. Stays browser-safe (kit invariant).
//   - Build the diff. That's `frameworks/ingest-diff.ts`.
//
// Why a tiny regex parser:
//   - FCPXML has many element types; we read four (`<sequence>`, `<spine>`,
//     `<asset-clip>`, `<clip>`, plus `<note>`, `<chapter-marker>`).
//   - A small extractor is auditable in one screen and fits inside the
//     kit's browser-safe boundary without needing linkedom or sax.
//   - Tradeoff documented as "Friction" #3 (frame quantization) and
//     "Friction" #1 (scene-id annotation contract).

/**
 * One clip on the primary spine of the parsed FCPXML. Frames are timeline-
 * absolute (start at 0 = the head of the spine). `sceneId` is the docent
 * annotation when present.
 */
export interface ParsedFcpxmlClip {
  /** Position in the spine (0-indexed). */
  readonly spineIndex: number;
  /** Scene id read from the docent annotation; `undefined` when absent. */
  readonly sceneId?: string;
  /** Absolute start frame in the spine timeline. */
  readonly startFrame: number;
  /** Absolute end frame in the spine timeline (exclusive). */
  readonly endFrame: number;
  /** `endFrame - startFrame`. */
  readonly frames: number;
  /**
   * The `ref="…"` attribute on the clip — typically the FCPXML asset id, but
   * surfaced verbatim for the diff caller. Useful when the editor inserts a
   * foreign clip whose ref points at a b-roll file.
   */
  readonly refUri?: string;
  /** Chapter markers the editor authored inside this clip. */
  readonly markers: ReadonlyArray<ParsedFcpxmlMarker>;
}

/** A chapter marker inside a clip, in timeline-absolute frames. */
export interface ParsedFcpxmlMarker {
  /** Marker label. */
  readonly label: string;
  /** Timeline-absolute frame of the marker. */
  readonly frame: number;
}

/** The fully parsed FCPXML — what the diff caller consumes. */
export interface ParsedFcpxml {
  /** Frames per second resolved from the sequence's `<sequence frameDuration="…">`. */
  readonly fps: number;
  /** Total length of the spine in frames. */
  readonly totalFrames: number;
  /** The clips on the spine, in spine order. */
  readonly clips: ReadonlyArray<ParsedFcpxmlClip>;
}

// ----- internal helpers -----------------------------------------------------

/**
 * Read all attributes from an XML opening tag fragment (e.g.
 * `<clip name="x" start="0/30s" duration="180/30s">`). Returns a map of
 * lower-case attribute names to their raw string values (entities decoded).
 *
 * We deliberately do NOT use the DOMParser: this is browser-safe by being
 * pure-JS-regex, and the FCPXML fragments we care about never carry the
 * pathological cases (CDATA inside attribute values, multi-line attributes).
 */
const readAttrs = (openTag: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(openTag)) !== null) {
    attrs[m[1]!.toLowerCase()] = decodeEntities(m[2]!);
  }
  return attrs;
};

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

/**
 * Parse an FCPXML rational-time string (e.g. `"180/30s"`, `"0s"`, `"5s"`)
 * to seconds. The form is `<numer>/<denom>s` or `<num>s`.
 *
 * **Friction #3 (frame quantization)**: FCPXML carries time as rationals so
 * a 23.976-fps frame is exactly representable. The parser returns seconds;
 * frame quantization happens at the call site by `Math.round(seconds * fps)`.
 * Rounding (not floor / ceiling) keeps drift below half a frame per clip;
 * for the round-trip case (we emit and re-read our own rationals), the
 * round-trip is exact.
 */
const parseFcpTime = (raw: string): number => {
  const s = raw.trim();
  if (s === '' || s === '0s') return 0;
  // Accept "<n>/<d>s" or "<n>s".
  const m = s.match(/^(-?\d+)(?:\/(\d+))?s$/);
  if (!m) {
    // Unrecognised — treat as 0 rather than throw; the caller will surface a
    // length-mismatch warning if it matters.
    return 0;
  }
  const numer = Number(m[1]!);
  const denom = m[2] !== undefined ? Number(m[2]!) : 1;
  if (denom === 0) return 0;
  return numer / denom;
};

/**
 * Read the sequence's frame rate from `<sequence frameDuration="1/30s">`.
 * Defaults to 30 when the attribute is missing or unparseable.
 */
const readFpsFromFrameDuration = (frameDuration: string): number => {
  const m = frameDuration.match(/^(\d+)\/(\d+)s$/);
  if (!m) return 30;
  const numer = Number(m[1]!);
  const denom = Number(m[2]!);
  if (numer === 0) return 30;
  // `1/30s` per frame → 30 fps; `1001/30000s` per frame → ~29.97 fps.
  return denom / numer;
};

/**
 * Look up the docent scene id annotation on a clip. The two recognised forms
 * are documented at the top of this file. Returning `undefined` lets the
 * caller fall back to position-based matching.
 *
 * **Friction #1 (annotation contract)**: the convention is
 * `docent:sceneId=<id>`, surfaced either as a top-level XML attribute
 * (`docent:sceneId="frame"`) or as the body of a `<note>` child
 * (`<note>docent:sceneId=frame</note>`). R11.1's emitter must agree.
 */
const readSceneId = (
  attrs: Record<string, string>,
  innerXml: string,
): string | undefined => {
  // Form 1: a direct attribute.
  const direct = attrs['docent:sceneid'] ?? attrs['data-docent-scene-id'];
  if (direct !== undefined && direct.length > 0) return direct;

  // Form 2: a <note>docent:sceneId=…</note> child.
  const noteRe = /<note(?:\s[^>]*)?>([^<]*)<\/note>/g;
  let m: RegExpExecArray | null;
  while ((m = noteRe.exec(innerXml)) !== null) {
    const body = decodeEntities(m[1]!).trim();
    const sceneEq = body.match(/^docent:sceneId=(.+)$/);
    if (sceneEq) return sceneEq[1]!.trim();
  }
  return undefined;
};

/**
 * Find every `<chapter-marker …/>` inside a clip's inner XML. Self-closing
 * or open-close forms both work.
 */
const readMarkers = (
  innerXml: string,
  clipStartSec: number,
  fps: number,
): ParsedFcpxmlMarker[] => {
  const markers: ParsedFcpxmlMarker[] = [];
  // Both `<chapter-marker …/>` and `<chapter-marker …></chapter-marker>` forms.
  const re = /<chapter-marker(\s[^>]*?)(\/>|>[\s\S]*?<\/chapter-marker>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(innerXml)) !== null) {
    const a = readAttrs(`<chapter-marker${m[1]!}>`);
    const startSec = parseFcpTime(a['start'] ?? '0s');
    const label = a['value'] ?? '';
    // Quantize via Math.round so a marker authored at frame N comes back as
    // frame N exactly when emitter + parser share the same fps (round-trip).
    markers.push({
      label,
      frame: Math.round((clipStartSec + startSec) * fps),
    });
  }
  return markers;
};

/**
 * Cut the inner XML of a tag at position `tagOpenStart` whose opening tag's
 * end is at `tagOpenEnd`. Walks the string scanning for the matching close
 * tag of the same name, respecting nesting.
 *
 * Returns `{innerXml, closeEnd}` — closeEnd is the index after the matching
 * `</name>`, used to advance the spine cursor.
 *
 * If the tag is self-closing (`<asset-clip …/>`), returns
 * `{innerXml: '', closeEnd: tagOpenEnd}`.
 */
const cutInner = (
  src: string,
  tagOpenStart: number,
  tagOpenEnd: number,
  tagName: string,
): {innerXml: string; closeEnd: number} => {
  // Detect self-closing.
  if (src[tagOpenEnd - 2] === '/') {
    return {innerXml: '', closeEnd: tagOpenEnd};
  }
  // Walk forward, counting nested opens of the same tag name.
  const openRe = new RegExp(`<${tagName}(?=[\\s/>])`, 'g');
  const closeRe = new RegExp(`</${tagName}>`, 'g');
  openRe.lastIndex = tagOpenEnd;
  closeRe.lastIndex = tagOpenEnd;
  let depth = 1;
  let cursor = tagOpenEnd;
  // Iteratively walk tag-by-tag to handle nesting correctly.
  while (depth > 0) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const nextOpen = openRe.exec(src);
    const nextClose = closeRe.exec(src);
    if (!nextClose) {
      // Malformed — unmatched open. Cap at end of string.
      return {innerXml: src.slice(tagOpenEnd), closeEnd: src.length};
    }
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
      continue;
    }
    depth -= 1;
    cursor = nextClose.index + nextClose[0].length;
  }
  // closeEnd is `cursor`; innerXml is between tagOpenEnd and the index of
  // the matching close tag (cursor - "</name>".length).
  const closeTagLen = tagName.length + 3;
  const innerEnd = cursor - closeTagLen;
  return {innerXml: src.slice(tagOpenEnd, innerEnd), closeEnd: cursor};
};

// ----- public parser --------------------------------------------------------

/**
 * Parse an FCPXML document. Pure: no fs, no DOM, no global state. Returns a
 * normalised internal representation the diff stage walks.
 *
 * The shape we recognise:
 * ```
 * <fcpxml version="1.10">
 *   <resources>… (ignored — we don't need asset metadata for the diff)</resources>
 *   <library>
 *     <event>
 *       <project>
 *         <sequence format="…" frameDuration="1/30s">
 *           <spine>
 *             <asset-clip name="…" offset="0s" duration="180/30s" ref="…">
 *               <note>docent:sceneId=frame</note>
 *               <chapter-marker start="60/30s" value="b1"/>
 *             </asset-clip>
 *             <asset-clip …/>
 *             …
 *           </spine>
 *         </sequence>
 *       </project>
 *     </event>
 *   </library>
 * </fcpxml>
 * ```
 *
 * Both `<asset-clip>` and `<clip>` (with embedded `<video>`/`<audio>`) on the
 * spine are recognised — R11.1's emitter may pick either; ingest accepts both.
 */
export const parseFcpxml = (xml: string): ParsedFcpxml => {
  // 1. Find the first <sequence> tag and read its frame rate.
  const seqOpenRe = /<sequence(\s[^>]*)?>/;
  const seqOpen = seqOpenRe.exec(xml);
  const fps = seqOpen
    ? readFpsFromFrameDuration(
        readAttrs(`<sequence${seqOpen[1] ?? ''}>`)['frameduration'] ?? '1/30s',
      )
    : 30;

  // 2. Find the first <spine>…</spine> block (the primary timeline).
  const spineOpenRe = /<spine(\s[^>]*)?>/;
  const spineOpen = spineOpenRe.exec(xml);
  if (!spineOpen) {
    return {fps, totalFrames: 0, clips: []};
  }
  const spineOpenEnd = spineOpen.index + spineOpen[0].length;
  const {innerXml: spineInner} = cutInner(
    xml,
    spineOpen.index,
    spineOpenEnd,
    'spine',
  );

  // 3. Walk every direct-child clip on the spine, in order. We accept three
  //    container tags: <asset-clip>, <clip>, and <ref-clip>. Each carries
  //    an `offset` and `duration` in FCPXML rational-time.
  const clips: ParsedFcpxmlClip[] = [];
  const childTags = ['asset-clip', 'clip', 'ref-clip'] as const;
  let spineCursor = 0;
  let spineIndex = 0;

  // Build a combined regex that matches any of the recognised clip openings
  // at any position in the spine inner XML.
  const combined = new RegExp(
    `<(${childTags.join('|')})(\\s[^>]*?)(/>|>)`,
    'g',
  );
  let m: RegExpExecArray | null;
  while ((m = combined.exec(spineInner)) !== null) {
    const tagName = m[1]!;
    const attrTail = m[2] ?? '';
    const openEnd = m.index + m[0].length;
    const attrs = readAttrs(`<${tagName}${attrTail}>`);
    const cut = cutInner(spineInner, m.index, openEnd, tagName);
    // FCPXML clips on a spine carry `offset` (where they sit) and `duration`
    // (how long they play). When `offset` is absent, clips abut sequentially;
    // we honour the spine cursor.
    const offsetSec =
      attrs['offset'] !== undefined ? parseFcpTime(attrs['offset']!) : null;
    const durationSec = parseFcpTime(attrs['duration'] ?? '0s');
    const startSec = offsetSec ?? spineCursor;
    const startFrame = Math.round(startSec * fps);
    const endFrame = Math.round((startSec + durationSec) * fps);
    const sceneId = readSceneId(attrs, cut.innerXml);
    const markers = readMarkers(cut.innerXml, startSec, fps);
    clips.push({
      spineIndex,
      ...(sceneId !== undefined ? {sceneId} : {}),
      startFrame,
      endFrame,
      frames: Math.max(0, endFrame - startFrame),
      ...(attrs['ref'] !== undefined ? {refUri: attrs['ref']!} : {}),
      markers,
    });
    spineCursor = startSec + durationSec;
    spineIndex += 1;
    // Advance past this clip's full body so the next iteration doesn't match
    // any nested clip-like opens.
    combined.lastIndex = cut.closeEnd;
  }

  const totalFrames = clips.length === 0 ? 0 : clips[clips.length - 1]!.endFrame;
  return {fps, totalFrames, clips};
};
