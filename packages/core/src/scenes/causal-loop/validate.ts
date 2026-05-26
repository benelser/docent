// Per-scene structural validator for `causal-loop`.
//
// Ported behaviorally from the `if (sc.type === 'causal-loop')` block in
// packages/engine/cli/validate.ts (around lines 1875-2053) plus the
// required-body floor in the `requiredBody` table (lines 2570-2577).
//
// HARD-FAIL contracts:
//  - variables: 3-8 entries; unique string ids; label non-empty; sub
//    optional non-empty.
//  - causalEdges: optional array; each {id, from, to, polarity, label?};
//    unique ids; from/to reference real variable ids; polarity ∈ {'+', '-'}.
//  - loops: required, at least 1 (the floor in `requiredBody`); each
//    {id, label?, path, kind}; unique ids; path is an array of ≥ 2 real
//    variable ids; every consecutive pair (and the wrap last→first) must
//    have a matching causal edge; `kind` matches the parity of '-' edges
//    along the path (even → reinforcing, odd → balancing). The label
//    cannot lie — the math IS the argument.
//
// The plugin-mode validator does NOT police the "causal-loop-only fields
// appear on a non-causal-loop scene" cross-checks — those live cross-scene
// and the kit's central validate framework handles them (other scenes'
// validators flag THEIR own intrusions on causal-loop's fields, not vice
// versa).

import type {Scene, SceneIssue, SceneValidationContext} from '@docent/kit';

export interface CausalVariable {
  id: string;
  label: string;
  sub?: string;
}

export interface CausalEdge {
  id: string;
  from: string;
  to: string;
  polarity: '+' | '-';
  label?: string;
}

export interface CausalLoop {
  id: string;
  label?: string;
  path: string[];
  kind: 'reinforcing' | 'balancing';
}

export interface CausalLoopScene extends Scene {
  type: 'causal-loop';
  variables?: CausalVariable[];
  causalEdges?: CausalEdge[];
  loops?: CausalLoop[];
  kicker?: string;
  heading?: string;
}

export const validate = (
  scene: CausalLoopScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  // ----- variables — 3-8 entries with unique ids ----------------------------
  const variableIds = new Set<string>();
  const variablesRaw = (scene as Record<string, unknown>).variables;
  const variables = Array.isArray(variablesRaw) ? variablesRaw : null;
  if (!variables || variables.length < 3 || variables.length > 8) {
    issues.push({
      path: `${at}.variables`,
      severity: 'error',
      message:
        'causal-loop requires 3-8 variables (the nouns of the feedback diagram)',
    });
  } else {
    variables.forEach((v: unknown, k: number) => {
      const vAt = `${at}.variables[${k}]`;
      if (!v || typeof v !== 'object') {
        issues.push({
          path: vAt,
          severity: 'error',
          message: 'variable must be an object {id, label, sub?}',
        });
        return;
      }
      const variable = v as Record<string, unknown>;
      if (typeof variable.id !== 'string' || !variable.id.trim()) {
        issues.push({
          path: `${vAt}.id`,
          severity: 'error',
          message: 'missing or empty string',
        });
      } else if (variableIds.has(variable.id)) {
        issues.push({
          path: `${vAt}.id`,
          severity: 'error',
          message: `duplicate variable id "${variable.id}"`,
        });
      } else {
        variableIds.add(variable.id);
      }
      if (typeof variable.label !== 'string' || !variable.label.trim()) {
        issues.push({
          path: `${vAt}.label`,
          severity: 'error',
          message: 'missing or empty string',
        });
      }
      if (
        variable.sub !== undefined &&
        (typeof variable.sub !== 'string' || !(variable.sub as string).trim())
      ) {
        issues.push({
          path: `${vAt}.sub`,
          severity: 'error',
          message: 'sub must be a non-empty string when present',
        });
      }
    });
  }

  // ----- causalEdges — unique ids; from/to resolve; polarity ∈ {'+', '-'} --
  const edgePolarity = new Map<string, '+' | '-'>();
  const causalEdgeIds = new Set<string>();
  const causalEdgesRaw = (scene as Record<string, unknown>).causalEdges;
  if (causalEdgesRaw !== undefined && !Array.isArray(causalEdgesRaw)) {
    issues.push({
      path: `${at}.causalEdges`,
      severity: 'error',
      message: 'causalEdges must be an array',
    });
  } else if (Array.isArray(causalEdgesRaw)) {
    causalEdgesRaw.forEach((e: unknown, k: number) => {
      const eAt = `${at}.causalEdges[${k}]`;
      if (!e || typeof e !== 'object') {
        issues.push({
          path: eAt,
          severity: 'error',
          message: 'edge must be an object {id, from, to, polarity}',
        });
        return;
      }
      const edge = e as Record<string, unknown>;
      if (typeof edge.id !== 'string' || !edge.id.trim()) {
        issues.push({
          path: `${eAt}.id`,
          severity: 'error',
          message: 'missing or empty string',
        });
      } else if (causalEdgeIds.has(edge.id)) {
        issues.push({
          path: `${eAt}.id`,
          severity: 'error',
          message: `duplicate edge id "${edge.id}"`,
        });
      } else {
        causalEdgeIds.add(edge.id);
      }
      let fromOk = false;
      let toOk = false;
      if (typeof edge.from !== 'string' || !edge.from.trim()) {
        issues.push({
          path: `${eAt}.from`,
          severity: 'error',
          message: 'missing variable id',
        });
      } else if (!variableIds.has(edge.from)) {
        issues.push({
          path: `${eAt}.from`,
          severity: 'error',
          message: `edge references variable "${edge.from}", which is not a variable in this scene`,
        });
      } else {
        fromOk = true;
      }
      if (typeof edge.to !== 'string' || !edge.to.trim()) {
        issues.push({
          path: `${eAt}.to`,
          severity: 'error',
          message: 'missing variable id',
        });
      } else if (!variableIds.has(edge.to)) {
        issues.push({
          path: `${eAt}.to`,
          severity: 'error',
          message: `edge references variable "${edge.to}", which is not a variable in this scene`,
        });
      } else {
        toOk = true;
      }
      if (edge.polarity !== '+' && edge.polarity !== '-') {
        issues.push({
          path: `${eAt}.polarity`,
          severity: 'error',
          message: 'polarity must be "+" (reinforcing) or "-" (opposing)',
        });
      } else if (fromOk && toOk) {
        edgePolarity.set(
          `${edge.from as string}->${edge.to as string}`,
          edge.polarity as '+' | '-',
        );
      }
      if (
        edge.label !== undefined &&
        (typeof edge.label !== 'string' || !(edge.label as string).trim())
      ) {
        issues.push({
          path: `${eAt}.label`,
          severity: 'error',
          message: 'label must be a non-empty string when present',
        });
      }
    });
  }

  // ----- loops — required (≥ 1); path resolves; parity matches kind ---------
  const loopIds = new Set<string>();
  const loopsRaw = (scene as Record<string, unknown>).loops;
  if (loopsRaw === undefined) {
    issues.push({
      path: `${at}.loops`,
      severity: 'error',
      message:
        'causal-loop requires at least 1 loop (the cycle is the argument)',
    });
  } else if (!Array.isArray(loopsRaw)) {
    issues.push({
      path: `${at}.loops`,
      severity: 'error',
      message: 'loops must be an array',
    });
  } else {
    if (loopsRaw.length < 1) {
      issues.push({
        path: `${at}.loops`,
        severity: 'error',
        message:
          'causal-loop requires at least 1 loop (the cycle is the argument)',
      });
    }
    loopsRaw.forEach((loopRaw: unknown, k: number) => {
      const lAt = `${at}.loops[${k}]`;
      if (!loopRaw || typeof loopRaw !== 'object') {
        issues.push({
          path: lAt,
          severity: 'error',
          message: 'loop must be an object {id, path, kind, label?}',
        });
        return;
      }
      const loop = loopRaw as Record<string, unknown>;
      if (typeof loop.id !== 'string' || !loop.id.trim()) {
        issues.push({
          path: `${lAt}.id`,
          severity: 'error',
          message: 'missing or empty string',
        });
      } else if (loopIds.has(loop.id)) {
        issues.push({
          path: `${lAt}.id`,
          severity: 'error',
          message: `duplicate loop id "${loop.id}"`,
        });
      } else {
        loopIds.add(loop.id);
      }
      if (
        loop.label !== undefined &&
        (typeof loop.label !== 'string' || !(loop.label as string).trim())
      ) {
        issues.push({
          path: `${lAt}.label`,
          severity: 'error',
          message: 'label must be a non-empty string when present',
        });
      }
      if (loop.kind !== 'reinforcing' && loop.kind !== 'balancing') {
        issues.push({
          path: `${lAt}.kind`,
          severity: 'error',
          message: 'kind must be "reinforcing" or "balancing"',
        });
      }
      if (!Array.isArray(loop.path) || (loop.path as unknown[]).length < 2) {
        issues.push({
          path: `${lAt}.path`,
          severity: 'error',
          message: 'path must be an array of at least 2 variable ids',
        });
        return;
      }
      let pathOk = true;
      const loopPath = loop.path as unknown[];
      loopPath.forEach((pid: unknown, pi: number) => {
        if (typeof pid !== 'string' || !pid.trim()) {
          issues.push({
            path: `${lAt}.path[${pi}]`,
            severity: 'error',
            message: 'path entry must be a variable id',
          });
          pathOk = false;
        } else if (!variableIds.has(pid)) {
          issues.push({
            path: `${lAt}.path[${pi}]`,
            severity: 'error',
            message: `path references variable "${pid}", which is not a variable in this scene`,
          });
          pathOk = false;
        }
      });
      if (!pathOk) return;
      let minusCount = 0;
      const pathLen = loopPath.length;
      for (let pi = 0; pi < pathLen; pi++) {
        const from = loopPath[pi] as string;
        const to = loopPath[(pi + 1) % pathLen] as string;
        const key = `${from}->${to}`;
        const pol = edgePolarity.get(key);
        if (pol === undefined) {
          issues.push({
            path: `${lAt}.path`,
            severity: 'error',
            message: `loop edge "${from}" → "${to}" has no matching entry in causalEdges (a loop cannot draw over a missing edge)`,
          });
          pathOk = false;
          continue;
        }
        if (pol === '-') minusCount += 1;
      }
      if (!pathOk) return;
      const expectedKind = minusCount % 2 === 0 ? 'reinforcing' : 'balancing';
      if (loop.kind === 'reinforcing' || loop.kind === 'balancing') {
        if (loop.kind !== expectedKind) {
          issues.push({
            path: `${lAt}.kind`,
            severity: 'error',
            message:
              `loop labelled "${loop.kind}" but path has ${minusCount} '-' edge(s) — ` +
              `the parity demands "${expectedKind}" (even '-' count → reinforcing R; odd → balancing B)`,
          });
        }
      }
    });
  }

  return issues;
};

export default validate;
