// R16.2 — live observability-data fetch stage.
//
// Runs AFTER validate, BEFORE TTS. Walks the in-memory spec for `dataSource`
// fields on `query` and `waterfall` scenes; for each, hits the named live
// endpoint (Prometheus / Loki / Jaeger) and replaces the authored fixture
// (`scene.result.value` for `query`, `scene.spans` for `waterfall`) with
// the fresh result.
//
// The stage is **failure-tolerant by design** — every other cascade stage
// (validate, TTS, render) raises on contract failure. This stage is the
// opposite: a network timeout, a refused connection, a 5xx, an empty
// trace, a Prom expr that returns no series — every one of these is
// LOGGED and the authored fixture is left in place. The film always
// renders. That is the point of the live fetch: an enhancement, never a
// precondition.
//
// **Caching.** Per-film manifest at `<publicDir>/data/<filmId>/manifest.json`
// records what was fetched (URL + body hash + timestamp + summary). A
// second build within the TTL (default 300s, configurable via
// `meta.featureOptions.liveData.ttl`) short-circuits the network call and
// reuses the cached value — useful for tight iteration loops where the
// agentops stack might be churning under load.
//
// **Node-only.** Even though the file lives in the kit (Node + browser),
// the stage only ever runs from the orchestrator (server-side). The
// fetch / fs imports here are safe because the browser bundle never
// imports this module — the orchestrator is itself Node-only by virtue
// of running ffmpeg.

import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

import type {FilmSpec, Scene} from '../types/spec';

/** Default HTTP timeout — 5s. Big enough for a healthy local docker stack
 * (Prom + Jaeger both respond in <100ms locally); short enough that a
 * silently-broken cluster doesn't block the build for minutes. */
const DEFAULT_HTTP_TIMEOUT_MS = 5000;

/** Default cache TTL — 300s. Configurable via meta.featureOptions.liveData.ttl. */
const DEFAULT_CACHE_TTL_S = 300;

/** Default maxSpans for the waterfall — matches the schema default. */
const DEFAULT_MAX_SPANS = 12;

/** Tag-key whitelist for Jaeger -> WaterfallSpan.attributes mapping.
 * The agentops fleet emits ~25 tags per llm_call span (llm.* + otel.* +
 * span.* + internal.*). Surfacing all of them blows up the focus panel.
 * This whitelist keeps the ones the AgentOps demo film actually annotates
 * + the OpenTelemetry status/kind keys every span carries. */
const ATTRIBUTE_TAG_WHITELIST = new Set<string>([
  'agentops.kind',
  'agentops.flow_id',
  'agentops.step',
  'llm.model',
  'llm.prompt_tokens',
  'llm.completion_tokens',
  'llm.latency_ms',
  'llm.finish_reason',
  'tool.name',
  'tool.success',
  'tool.latency_ms',
  'http.method',
  'http.status_code',
  'http.url',
  'db.system',
  'db.statement',
  'error',
  'span.kind',
]);

/** Per-beat log lines the stage emits. The orchestrator surfaces them in
 * the stage summary; the caller (CLI) prints them. */
export interface DataFetchLog {
  readonly level: 'info' | 'warn';
  readonly message: string;
}

/** Manifest entry — one per dataSource processed. */
export interface DataFetchManifestEntry {
  /** `<sceneIndex>` keyed. */
  readonly sceneIndex: number;
  /** `query` or `waterfall`. */
  readonly sceneType: 'query' | 'waterfall';
  /** Endpoint URL hit. */
  readonly url: string;
  /** SHA256(url|kind|expr|service|traceId|operation|range) — the cache key. */
  readonly hash: string;
  /** Unix seconds when the fetch ran. */
  readonly fetchedAt: number;
  /** Short summary line ("0.583 req/s" or "13 spans · ba36bf0…"). */
  readonly summary: string;
  /** Whether the fetch succeeded (false = fallback rendered). */
  readonly ok: boolean;
  /** When ok=true: the value to inject. JSON-serializable. */
  readonly value?: unknown;
}

/** On-disk manifest shape — what the stage writes / reads. */
export interface DataFetchPersistedManifest {
  readonly filmId: string;
  readonly version: 1;
  /** Indexed by the per-source cache hash. */
  readonly entries: Record<string, DataFetchManifestEntry>;
}

/** What the stage returns to the orchestrator. */
export interface DataFetchStageResult {
  /** The mutated spec — same reference as the input (in-place mutation). */
  readonly spec: FilmSpec;
  /** Per-source results, for the orchestrator's stage summary. */
  readonly entries: ReadonlyArray<DataFetchManifestEntry>;
  /** Diagnostic messages, surfaced via the cascade summary. */
  readonly logs: ReadonlyArray<DataFetchLog>;
  /** Absolute path of the persisted manifest, if persistence was enabled. */
  readonly manifestPath?: string;
}

export interface DataFetchStageOptions {
  /** Absolute path of the Remotion `public/` dir; manifest writes to
   * `<publicDir>/data/<filmId>/manifest.json`. When omitted, the stage
   * runs in memory only. */
  readonly publicDir?: string;
  /** Film id, used to scope the manifest dir. Required for persistence. */
  readonly filmId?: string;
  /** HTTP timeout override (ms). Default 5000. */
  readonly timeoutMs?: number;
  /** Cache TTL override (s). Default 300. */
  readonly ttlSeconds?: number;
  /** Force re-fetch — skip the cache lookup. Default false. */
  readonly noCache?: boolean;
}

/** Stable JSON.stringify (sorts object keys) — same shape used by tts-stage
 * for hash stability. The function is duplicated here rather than imported
 * because tts-stage doesn't export it; copying the 14 lines is cheaper than
 * a public API surface bump. */
const stableJsonStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableJsonStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    parts.push(JSON.stringify(k) + ':' + stableJsonStringify(v));
  }
  return '{' + parts.join(',') + '}';
};

/** SHA256(stableJson(descriptor)) — the cache key. URL + every parameter
 * that materially changes the response. */
const hashSource = (descriptor: Record<string, unknown>): string =>
  createHash('sha256').update(stableJsonStringify(descriptor)).digest('hex');

/** Wrap fetch with an AbortController-driven timeout. Returns the Response
 * on success; throws (with the body of the AbortError) on timeout. */
const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {...init, signal: ctrl.signal});
  } finally {
    clearTimeout(t);
  }
};

// ─── Prometheus / Loki ─────────────────────────────────────────────────────

interface PromQueryResponse {
  status: string;
  data?: {
    resultType: 'scalar' | 'vector' | 'matrix' | 'string';
    result: unknown;
  };
  error?: string;
}

/** Run a PromQL instant query — extract a numeric value when the result is
 * scalar/vector. Returns `null` when the response is malformed or empty. */
const fetchPrometheusScalar = async (
  url: string,
  expr: string,
  timeoutMs: number,
): Promise<number | null> => {
  const endpoint = url.replace(/\/+$/, '') + '/api/v1/query';
  const body = new URLSearchParams({query: expr}).toString();
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body,
    },
    timeoutMs,
  );
  if (!res.ok) {
    throw new Error(`prometheus query returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as PromQueryResponse;
  if (json.status !== 'success' || !json.data) {
    throw new Error(`prometheus query status=${json.status}: ${json.error ?? 'no data'}`);
  }
  const {resultType, result} = json.data;
  // scalar: [<ts>, "<value>"]
  if (resultType === 'scalar' && Array.isArray(result) && result.length >= 2) {
    const n = parseFloat(String(result[1]));
    return Number.isFinite(n) ? n : null;
  }
  // vector: [{ metric, value: [ts, "<value>"] }, ...]
  if (resultType === 'vector' && Array.isArray(result) && result.length > 0) {
    const first = result[0] as {value?: [number, string]};
    if (Array.isArray(first.value) && first.value.length >= 2) {
      const n = parseFloat(String(first.value[1]));
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
};

interface LokiQueryResponse {
  status: string;
  data?: {
    resultType: string;
    result: Array<{stream?: Record<string, string>; values?: Array<[string, string]>}>;
  };
}

/** Run a LogQL instant query — return up to 10 (timestamp, line) rows for
 * the `table` result kind. Returns `null` when no rows are returned. */
const fetchLokiRows = async (
  url: string,
  expr: string,
  timeoutMs: number,
): Promise<ReadonlyArray<ReadonlyArray<string>> | null> => {
  const params = new URLSearchParams({query: expr, limit: '10'});
  const endpoint =
    url.replace(/\/+$/, '') + '/loki/api/v1/query?' + params.toString();
  const res = await fetchWithTimeout(endpoint, {method: 'GET'}, timeoutMs);
  if (!res.ok) {
    throw new Error(`loki query returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as LokiQueryResponse;
  if (json.status !== 'success' || !json.data) {
    throw new Error(`loki query status=${json.status}`);
  }
  const rows: string[][] = [['time', 'line']];
  for (const series of json.data.result) {
    if (!Array.isArray(series.values)) continue;
    for (const [ts, line] of series.values) {
      rows.push([ts, line]);
      if (rows.length > 11) break; // header + 10 lines
    }
    if (rows.length > 11) break;
  }
  return rows.length > 1 ? rows : null;
};

// ─── Jaeger ────────────────────────────────────────────────────────────────

interface JaegerTag {
  key: string;
  type: string;
  value: string | number | boolean;
}

interface JaegerSpan {
  traceID: string;
  spanID: string;
  operationName: string;
  references?: Array<{refType: string; spanID: string}>;
  startTime: number; // microseconds
  duration: number; // microseconds
  tags?: JaegerTag[];
  processID: string;
}

interface JaegerTrace {
  traceID: string;
  spans: JaegerSpan[];
  processes: Record<string, {serviceName: string; tags?: JaegerTag[]}>;
}

interface JaegerResponse {
  data: JaegerTrace[];
}

/** Map agentops.kind tag value -> WaterfallSpan.kind enum. Unknown -> generic. */
const mapAgentOpsKind = (raw: unknown): string => {
  switch (raw) {
    case 'plan_step':
      return 'plan-step';
    case 'llm_call':
      return 'llm-call';
    case 'tool_call':
      return 'tool-call';
    case 'agent_decision':
      return 'agent-decision';
    case 'flow_checkpoint':
      return 'flow-checkpoint';
    case 'hallucination_flag':
      return 'hallucination-flag';
    default:
      return 'generic';
  }
};

/** Heuristic fallback: use span.kind tag + operation name. */
const inferSpanKind = (tags: ReadonlyArray<JaegerTag>, operation: string): string => {
  for (const t of tags) {
    if (t.key === 'agentops.kind') return mapAgentOpsKind(t.value);
    if (t.key === 'http.method') return 'http';
    if (t.key === 'db.system') return 'db';
  }
  // Operation-name fallback — the agentops emitter sometimes names spans
  // `tool_call.summarize` without an explicit agentops.kind tag.
  const op = operation.toLowerCase();
  if (op.startsWith('plan_step')) return 'plan-step';
  if (op.startsWith('llm_call')) return 'llm-call';
  if (op.startsWith('tool_call')) return 'tool-call';
  if (op.startsWith('agent_decision')) return 'agent-decision';
  if (op.startsWith('flow_checkpoint')) return 'flow-checkpoint';
  if (op.startsWith('hallucination')) return 'hallucination-flag';
  return 'generic';
};

/** Build a WaterfallSpan.attributes record from a span's tags, filtered to
 * the whitelist + lowercased keys for the focus-panel render. */
const projectAttributes = (tags: ReadonlyArray<JaegerTag>): Record<string, string | number> => {
  const out: Record<string, string | number> = {};
  for (const t of tags) {
    if (!ATTRIBUTE_TAG_WHITELIST.has(t.key)) continue;
    const v = t.value;
    if (typeof v === 'string') out[t.key] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) {
      // Round latency-like floats to 1dp so the focus panel doesn't show
      // `0.35829097032546997` ms.
      out[t.key] = t.key.endsWith('_ms') ? Number(v.toFixed(1)) : v;
    } else if (typeof v === 'boolean') {
      out[t.key] = String(v);
    }
  }
  return out;
};

/** Convert a Jaeger trace -> docent WaterfallSpan[]. The transformation:
 *
 *   1. Sort spans by startTime ascending (Jaeger returns them unsorted).
 *   2. The root is the earliest-starting span (its startTime is the trace
 *      origin; every other span's startMs is relative to it).
 *   3. Walk in order; map each span; trim to maxSpans.
 */
const convertJaegerTrace = (
  trace: JaegerTrace,
  maxSpans: number,
): Array<{
  id: string;
  parentId?: string;
  label: string;
  kind: string;
  startMs: number;
  durationMs: number;
  statusOk?: boolean;
  attributes?: Record<string, string | number>;
}> => {
  if (!Array.isArray(trace.spans) || trace.spans.length === 0) return [];
  // Sort by startTime ASC — Jaeger does not guarantee any order.
  const sorted = [...trace.spans].sort((a, b) => a.startTime - b.startTime);
  const rootStart = sorted[0]!.startTime;
  const kept = sorted.slice(0, maxSpans);
  const keptIds = new Set(kept.map((s) => s.spanID));

  const out: Array<{
    id: string;
    parentId?: string;
    label: string;
    kind: string;
    startMs: number;
    durationMs: number;
    statusOk?: boolean;
    attributes?: Record<string, string | number>;
  }> = [];

  for (const span of kept) {
    const proc = trace.processes[span.processID];
    const service = proc?.serviceName ?? 'unknown';
    const tags = span.tags ?? [];
    const kind = inferSpanKind(tags, span.operationName);
    const attributes = projectAttributes(tags);

    // Find a parentId from the CHILD_OF / FOLLOWS_FROM ref — but ONLY
    // if it survives the maxSpans trim. A trimmed-out parent becomes a
    // root in the rendered tree (forwarding the orphan to the root row
    // is the friction-flag I'd raise on a >>maxSpans trace).
    let parentId: string | undefined;
    for (const ref of span.references ?? []) {
      if (ref.refType === 'CHILD_OF' || ref.refType === 'FOLLOWS_FROM') {
        if (keptIds.has(ref.spanID)) {
          parentId = ref.spanID;
        }
        break;
      }
    }

    // Detect error status — agentops sets `error: true` or `tool.success: false`.
    let statusOk = true;
    for (const t of tags) {
      if (t.key === 'error' && t.value === true) statusOk = false;
      if (t.key === 'tool.success' && t.value === false) statusOk = false;
    }

    const startMs = (span.startTime - rootStart) / 1000;
    const durationMs = span.duration / 1000;

    // Compose label as `<service>.<op>` — but de-duplicate when the
    // agentops emitter has already suffixed the op with the service name
    // (e.g. operationName="plan_step.orchestrator", service="orchestrator"
    // -> "orchestrator.plan_step", not "orchestrator.plan_step.orchestrator").
    const op = span.operationName;
    const dedupedOp = op.endsWith(`.${service}`)
      ? op.slice(0, -(service.length + 1))
      : op;
    const label = `${service}.${dedupedOp}`;

    const row: {
      id: string;
      parentId?: string;
      label: string;
      kind: string;
      startMs: number;
      durationMs: number;
      statusOk?: boolean;
      attributes?: Record<string, string | number>;
    } = {
      id: span.spanID,
      label,
      kind,
      startMs: Number(startMs.toFixed(1)),
      durationMs: Number(durationMs.toFixed(1)),
    };
    if (parentId !== undefined) row.parentId = parentId;
    if (!statusOk) row.statusOk = false;
    if (Object.keys(attributes).length > 0) row.attributes = attributes;
    out.push(row);
  }

  return out;
};

const fetchJaegerTrace = async (
  url: string,
  service: string,
  opts: {
    traceId?: string;
    recent?: boolean;
    operation?: string;
    maxSpans: number;
  },
  timeoutMs: number,
): Promise<ReturnType<typeof convertJaegerTrace> | null> => {
  let endpoint: string;
  if (opts.traceId) {
    endpoint = `${url.replace(/\/+$/, '')}/api/traces/${encodeURIComponent(opts.traceId)}`;
  } else {
    const params = new URLSearchParams({
      service,
      lookback: '1h',
      limit: '20',
    });
    if (opts.operation) params.set('operation', opts.operation);
    endpoint = `${url.replace(/\/+$/, '')}/api/traces?${params.toString()}`;
  }
  const res = await fetchWithTimeout(endpoint, {method: 'GET'}, timeoutMs);
  if (!res.ok) {
    throw new Error(`jaeger query returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as JaegerResponse;
  if (!Array.isArray(json.data) || json.data.length === 0) return null;
  // For service-scoped fetches, take the most-recent (Jaeger returns
  // newest-first but we sort defensively by max startTime across spans).
  const traces = [...json.data].sort((a, b) => {
    const aMax = Math.max(...a.spans.map((s) => s.startTime));
    const bMax = Math.max(...b.spans.map((s) => s.startTime));
    return bMax - aMax;
  });
  const trace = opts.traceId ? json.data[0]! : traces[0]!;
  return convertJaegerTrace(trace, opts.maxSpans);
};

// ─── Manifest IO ───────────────────────────────────────────────────────────

const manifestPathFor = (publicDir: string, filmId: string): string =>
  join(publicDir, 'data', filmId, 'manifest.json');

const readManifest = (path: string): DataFetchPersistedManifest | null => {
  try {
    if (!existsSync(path)) return null;
    const text = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(text) as DataFetchPersistedManifest;
    if (parsed && parsed.version === 1 && parsed.entries) return parsed;
  } catch {
    /* corrupt manifest = cold cache; ignored */
  }
  return null;
};

const writeManifest = (path: string, manifest: DataFetchPersistedManifest): void => {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, JSON.stringify(manifest, null, 2));
};

// ─── The stage ─────────────────────────────────────────────────────────────

/**
 * Run the data-fetch stage. **Always returns** — every failure is logged
 * and the authored fixture is left in place.
 */
export const runDataFetchStage = async (
  spec: FilmSpec,
  opts: DataFetchStageOptions = {},
): Promise<DataFetchStageResult> => {
  const logs: DataFetchLog[] = [];
  const entries: DataFetchManifestEntry[] = [];

  const scenes: Scene[] = Array.isArray(spec.scenes) ? spec.scenes : [];
  // Read TTL from meta.featureOptions.liveData.ttl when set; default 300s.
  // Use `as` reads — meta is intentionally open-shape.
  const metaFO = (spec.meta as unknown as {featureOptions?: {liveData?: {ttl?: number}}})
    ?.featureOptions?.liveData;
  const ttlSeconds = opts.ttlSeconds ?? metaFO?.ttl ?? DEFAULT_CACHE_TTL_S;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;

  const filmId = opts.filmId ?? spec.meta?.id;
  const canPersist =
    typeof opts.publicDir === 'string' &&
    opts.publicDir.length > 0 &&
    typeof filmId === 'string' &&
    filmId.length > 0;
  const mfPath = canPersist
    ? manifestPathFor(opts.publicDir as string, filmId as string)
    : undefined;
  const prior = mfPath ? readManifest(mfPath) : null;
  const now = Math.floor(Date.now() / 1000);

  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si];
    if (!scene || typeof scene !== 'object') continue;
    const ds = (scene as unknown as {dataSource?: unknown}).dataSource;
    if (!ds || typeof ds !== 'object') continue;

    if (scene.type === 'query') {
      const entry = await processQueryDataSource(
        si,
        scene as Scene & {
          dialect?: string;
          query?: ReadonlyArray<{text?: string}>;
          result?: {kind?: string; value?: unknown};
          dataSource?: {
            kind: 'prometheus' | 'loki';
            url: string;
            expr?: string;
            range?: string;
          };
        },
        {prior, ttlSeconds, noCache: opts.noCache === true, timeoutMs, now, logs},
      );
      entries.push(entry);
    } else if (scene.type === 'waterfall') {
      const entry = await processWaterfallDataSource(
        si,
        scene as Scene & {
          spans?: unknown;
          dataSource?: {
            kind: 'jaeger';
            url: string;
            service: string;
            traceId?: string;
            recent?: boolean;
            operation?: string;
            maxSpans?: number;
          };
        },
        {prior, ttlSeconds, noCache: opts.noCache === true, timeoutMs, now, logs},
      );
      entries.push(entry);
    }
  }

  // Persist when persistence is enabled — accumulate every entry (even
  // failed ones, so a cold cache after a failed run doesn't re-hammer
  // the endpoint without telling the user).
  if (mfPath && entries.length > 0) {
    const next: DataFetchPersistedManifest = {
      filmId: filmId as string,
      version: 1,
      entries: {...(prior?.entries ?? {})},
    };
    for (const e of entries) {
      next.entries[e.hash] = e;
    }
    try {
      writeManifest(mfPath, next);
    } catch (e) {
      logs.push({
        level: 'warn',
        message: `[data-fetch] could not persist manifest at ${mfPath}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
    }
  }

  const result: DataFetchStageResult = {
    spec,
    entries,
    logs,
  };
  if (mfPath) {
    return {...result, manifestPath: mfPath};
  }
  return result;
};

// ─── Per-scene-type processors ─────────────────────────────────────────────

interface ProcessCtx {
  readonly prior: DataFetchPersistedManifest | null;
  readonly ttlSeconds: number;
  readonly noCache: boolean;
  readonly timeoutMs: number;
  readonly now: number;
  readonly logs: DataFetchLog[];
}

const processQueryDataSource = async (
  sceneIndex: number,
  scene: Scene & {
    dialect?: string;
    query?: ReadonlyArray<{text?: string}>;
    result?: {kind?: string; value?: unknown};
    dataSource?: {
      kind: 'prometheus' | 'loki';
      url: string;
      expr?: string;
      range?: string;
    };
  },
  ctx: ProcessCtx,
): Promise<DataFetchManifestEntry> => {
  const ds = scene.dataSource!;
  // expr fallback: join authored query lines (the "displayed query == executed
  // query" pattern). For PromQL / LogQL this gives a sensible default.
  const expr =
    ds.expr ??
    (Array.isArray(scene.query)
      ? scene.query.map((l) => (typeof l?.text === 'string' ? l.text : '')).join('\n').trim()
      : '');
  const hashInput = {
    kind: ds.kind,
    url: ds.url,
    expr,
    range: ds.range ?? '5m',
    resultKind: scene.result?.kind ?? 'gauge',
  };
  const hash = hashSource(hashInput);

  // Cache hit? Reuse the prior value when fresh.
  const priorEntry = ctx.prior?.entries[hash];
  if (
    !ctx.noCache &&
    priorEntry &&
    priorEntry.ok &&
    priorEntry.value !== undefined &&
    ctx.now - priorEntry.fetchedAt < ctx.ttlSeconds
  ) {
    if (scene.result) {
      (scene.result as {value: unknown}).value = priorEntry.value;
    }
    ctx.logs.push({
      level: 'info',
      message: `[data-fetch] cache hit (scene[${sceneIndex}] query → ${ds.kind}): ${priorEntry.summary} (${ctx.now - priorEntry.fetchedAt}s old)`,
    });
    return {
      ...priorEntry,
      fetchedAt: priorEntry.fetchedAt,
    };
  }

  // Live fetch — kind-dispatched.
  try {
    if (ds.kind === 'prometheus') {
      const v = await fetchPrometheusScalar(ds.url, expr, ctx.timeoutMs);
      if (v === null) {
        ctx.logs.push({
          level: 'warn',
          message: `[data-fetch] prometheus returned no data for scene[${sceneIndex}] (expr: ${expr.replace(/\s+/g, ' ').slice(0, 80)}); keeping authored value`,
        });
        return {
          sceneIndex,
          sceneType: 'query',
          url: ds.url,
          hash,
          fetchedAt: ctx.now,
          summary: 'no data',
          ok: false,
        };
      }
      // Replace result.value in place.
      if (scene.result) {
        (scene.result as {value: unknown}).value = v;
      }
      const summary = `${v.toFixed(3)} (prometheus)`;
      ctx.logs.push({
        level: 'info',
        message: `[data-fetch] live fetch ok scene[${sceneIndex}] query → prometheus: ${summary}`,
      });
      return {
        sceneIndex,
        sceneType: 'query',
        url: ds.url,
        hash,
        fetchedAt: ctx.now,
        summary,
        ok: true,
        value: v,
      };
    }
    // Loki — rows-of-strings for the table result kind.
    const rows = await fetchLokiRows(ds.url, expr, ctx.timeoutMs);
    if (!rows) {
      ctx.logs.push({
        level: 'warn',
        message: `[data-fetch] loki returned no rows for scene[${sceneIndex}]; keeping authored value`,
      });
      return {
        sceneIndex,
        sceneType: 'query',
        url: ds.url,
        hash,
        fetchedAt: ctx.now,
        summary: 'no rows',
        ok: false,
      };
    }
    if (scene.result) {
      (scene.result as {value: unknown}).value = rows;
    }
    const summary = `${rows.length - 1} rows (loki)`;
    ctx.logs.push({
      level: 'info',
      message: `[data-fetch] live fetch ok scene[${sceneIndex}] query → loki: ${summary}`,
    });
    return {
      sceneIndex,
      sceneType: 'query',
      url: ds.url,
      hash,
      fetchedAt: ctx.now,
      summary,
      ok: true,
      value: rows,
    };
  } catch (e) {
    ctx.logs.push({
      level: 'warn',
      message: `[data-fetch] ${ds.kind} fetch FAILED for scene[${sceneIndex}]: ${e instanceof Error ? e.message : String(e)}; keeping authored value`,
    });
    return {
      sceneIndex,
      sceneType: 'query',
      url: ds.url,
      hash,
      fetchedAt: ctx.now,
      summary: 'fetch failed',
      ok: false,
    };
  }
};

const processWaterfallDataSource = async (
  sceneIndex: number,
  scene: Scene & {
    spans?: unknown;
    dataSource?: {
      kind: 'jaeger';
      url: string;
      service: string;
      traceId?: string;
      recent?: boolean;
      operation?: string;
      maxSpans?: number;
    };
  },
  ctx: ProcessCtx,
): Promise<DataFetchManifestEntry> => {
  const ds = scene.dataSource!;
  const maxSpans = ds.maxSpans ?? DEFAULT_MAX_SPANS;
  const hashInput = {
    kind: ds.kind,
    url: ds.url,
    service: ds.service,
    traceId: ds.traceId ?? '',
    operation: ds.operation ?? '',
    recent: ds.recent ?? !ds.traceId,
    maxSpans,
  };
  const hash = hashSource(hashInput);

  const priorEntry = ctx.prior?.entries[hash];
  if (
    !ctx.noCache &&
    priorEntry &&
    priorEntry.ok &&
    Array.isArray(priorEntry.value) &&
    ctx.now - priorEntry.fetchedAt < ctx.ttlSeconds
  ) {
    (scene as {spans: unknown}).spans = priorEntry.value;
    ctx.logs.push({
      level: 'info',
      message: `[data-fetch] cache hit (scene[${sceneIndex}] waterfall → jaeger): ${priorEntry.summary} (${ctx.now - priorEntry.fetchedAt}s old)`,
    });
    return {...priorEntry, fetchedAt: priorEntry.fetchedAt};
  }

  try {
    const spans = await fetchJaegerTrace(
      ds.url,
      ds.service,
      {
        ...(ds.traceId ? {traceId: ds.traceId} : {}),
        ...(ds.recent !== undefined ? {recent: ds.recent} : {}),
        ...(ds.operation ? {operation: ds.operation} : {}),
        maxSpans,
      },
      ctx.timeoutMs,
    );
    if (!spans || spans.length === 0) {
      ctx.logs.push({
        level: 'warn',
        message: `[data-fetch] jaeger has no recent traces for service="${ds.service}" (scene[${sceneIndex}]); keeping authored spans`,
      });
      return {
        sceneIndex,
        sceneType: 'waterfall',
        url: ds.url,
        hash,
        fetchedAt: ctx.now,
        summary: 'no traces',
        ok: false,
      };
    }
    (scene as {spans: unknown}).spans = spans;
    const summary = `${spans.length} spans (${ds.service})`;
    ctx.logs.push({
      level: 'info',
      message: `[data-fetch] live fetch ok scene[${sceneIndex}] waterfall → jaeger: ${summary}`,
    });
    return {
      sceneIndex,
      sceneType: 'waterfall',
      url: ds.url,
      hash,
      fetchedAt: ctx.now,
      summary,
      ok: true,
      value: spans,
    };
  } catch (e) {
    ctx.logs.push({
      level: 'warn',
      message: `[data-fetch] jaeger fetch FAILED for scene[${sceneIndex}]: ${e instanceof Error ? e.message : String(e)}; keeping authored spans`,
    });
    return {
      sceneIndex,
      sceneType: 'waterfall',
      url: ds.url,
      hash,
      fetchedAt: ctx.now,
      summary: 'fetch failed',
      ok: false,
    };
  }
};

// ─── Exported helpers for tests / external callers ─────────────────────────

export const __testing = {
  convertJaegerTrace,
  inferSpanKind,
  projectAttributes,
  hashSource,
  ATTRIBUTE_TAG_WHITELIST,
  DEFAULT_CACHE_TTL_S,
  DEFAULT_HTTP_TIMEOUT_MS,
};
