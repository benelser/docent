// Per-scene structural validation for the `waterfall` scene.
//
// The JSON Schema fragment carries the per-field type shape (kind enum,
// number bounds, additionalProperties: false). This validator carries
// the cross-field invariants the schema can't express:
//
//   - id uniqueness across the spans array,
//   - parentId references — every non-null parentId must resolve to a
//     known span id (and a span may not parent itself),
//   - cycle detection — the parent chain must terminate at a root,
//   - exactly one or more root spans — at least one span must have no
//     parentId (the trace's entry point).
//
// The hard failure is an empty `spans` array (the schema also catches
// this with minItems: 1, but we emit a code'd issue with a friendlier
// message). Everything else is a per-span error.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

export type WaterfallSpanKind =
  | 'plan-step'
  | 'llm-call'
  | 'tool-call'
  | 'agent-decision'
  | 'flow-checkpoint'
  | 'hallucination-flag'
  | 'http'
  | 'db'
  | 'generic';

export interface WaterfallSpan {
  id: string;
  parentId?: string;
  label: string;
  kind: WaterfallSpanKind;
  startMs: number;
  durationMs: number;
  statusOk?: boolean;
  attributes?: Record<string, string | number>;
}

export interface WaterfallScene extends Scene {
  type: 'waterfall';
  spans: WaterfallSpan[];
  kicker?: string;
  heading?: string;
}

const KNOWN_KINDS = new Set<WaterfallSpanKind>([
  'plan-step',
  'llm-call',
  'tool-call',
  'agent-decision',
  'flow-checkpoint',
  'hallucination-flag',
  'http',
  'db',
  'generic',
]);

export const validate = (
  scene: WaterfallScene,
  _ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;

  if (!Array.isArray(scene.spans) || scene.spans.length === 0) {
    issues.push({
      path: `${at}.spans`,
      message: 'waterfall requires at least one span',
      severity: 'error',
      code: 'waterfall/missing-spans',
    });
    // Without spans we can't continue — every downstream check would
    // dereference an empty array.
    return issues;
  }

  // Per-span structural shape: id uniqueness, kind enum, durationMs/startMs
  // sane, parentId is a known id, no self-parenting.
  const spanIds = new Set<string>();
  scene.spans.forEach((s, k) => {
    const sAt = `${at}.spans[${k}]`;
    if (!s || typeof s !== 'object') {
      issues.push({
        path: sAt,
        message: 'span must be an object {id, label, kind, startMs, durationMs, ...}',
        severity: 'error',
        code: 'waterfall/span-shape',
      });
      return;
    }

    // id
    if (typeof s.id !== 'string' || !s.id.trim()) {
      issues.push({
        path: `${sAt}.id`,
        message: 'missing or empty string',
        severity: 'error',
        code: 'waterfall/span-id-missing',
      });
    } else if (spanIds.has(s.id)) {
      issues.push({
        path: `${sAt}.id`,
        message: `duplicate span id "${s.id}"`,
        severity: 'error',
        code: 'waterfall/span-id-duplicate',
      });
    } else {
      spanIds.add(s.id);
    }

    // label
    if (typeof s.label !== 'string' || !s.label.trim()) {
      issues.push({
        path: `${sAt}.label`,
        message: 'missing or empty string',
        severity: 'error',
        code: 'waterfall/span-label-missing',
      });
    }

    // kind
    if (typeof s.kind !== 'string' || !KNOWN_KINDS.has(s.kind as WaterfallSpanKind)) {
      issues.push({
        path: `${sAt}.kind`,
        message: `kind must be one of: ${Array.from(KNOWN_KINDS).join(', ')}`,
        severity: 'error',
        code: 'waterfall/span-kind-unknown',
      });
    }

    // startMs / durationMs — schema already requires number ≥ 0, but a
    // missing field is worth a friendlier message.
    if (typeof s.startMs !== 'number' || !Number.isFinite(s.startMs) || s.startMs < 0) {
      issues.push({
        path: `${sAt}.startMs`,
        message: 'startMs must be a non-negative number (ms from trace start)',
        severity: 'error',
        code: 'waterfall/span-start-shape',
      });
    }
    if (
      typeof s.durationMs !== 'number' ||
      !Number.isFinite(s.durationMs) ||
      s.durationMs < 0
    ) {
      issues.push({
        path: `${sAt}.durationMs`,
        message: 'durationMs must be a non-negative number (0 for events/checkpoints)',
        severity: 'error',
        code: 'waterfall/span-duration-shape',
      });
    }

    // self-parent — cheaper to check now than in cycle detection
    if (typeof s.parentId === 'string' && s.parentId === s.id) {
      issues.push({
        path: `${sAt}.parentId`,
        message: `span "${s.id}" parents itself`,
        severity: 'error',
        code: 'waterfall/span-self-parent',
      });
    }
  });

  // parentId resolution — every non-null parentId must point at a known
  // span id. Defer this pass so we have the full id set.
  scene.spans.forEach((s, k) => {
    if (typeof s.parentId !== 'string') return;
    if (!s.parentId.trim()) return; // empty string caught by trim-check below
    if (!spanIds.has(s.parentId)) {
      issues.push({
        path: `${at}.spans[${k}].parentId`,
        message: `parentId "${s.parentId}" does not match any span id in this scene`,
        severity: 'error',
        code: 'waterfall/parent-not-found',
      });
    }
  });

  // Cycle detection — walk the parent chain from each span and ensure it
  // terminates at a root. A cycle is when a span reappears in the chain.
  // O(n²) worst case but the n is tiny (a trace with >100 spans is the
  // friction-flag territory — see the friction notes).
  const parentOf: Record<string, string | undefined> = {};
  scene.spans.forEach((s) => {
    if (typeof s.id !== 'string') return;
    parentOf[s.id] = typeof s.parentId === 'string' ? s.parentId : undefined;
  });
  let rootCount = 0;
  scene.spans.forEach((s, k) => {
    if (typeof s.id !== 'string') return;
    if (parentOf[s.id] === undefined) {
      rootCount += 1;
      return;
    }
    const seen = new Set<string>([s.id]);
    let cur: string | undefined = parentOf[s.id];
    while (cur !== undefined) {
      if (seen.has(cur)) {
        issues.push({
          path: `${at}.spans[${k}].parentId`,
          message: `cycle detected starting at span "${s.id}"`,
          severity: 'error',
          code: 'waterfall/cycle',
        });
        return;
      }
      seen.add(cur);
      cur = parentOf[cur];
    }
  });

  if (rootCount === 0) {
    issues.push({
      path: `${at}.spans`,
      message:
        'no root span — at least one span must omit parentId (the trace entry point)',
      severity: 'error',
      code: 'waterfall/no-root',
    });
  }

  return issues;
};

export default validate;
