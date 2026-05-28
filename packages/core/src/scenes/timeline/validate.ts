// Per-scene structural validation for the `timeline` scene.
//
// Migrated from packages/engine/cli/validate.ts (the `sc.type === 'timeline'`
// block and the `timeline:` requiredBody entry). A timeline plots events on a
// real date axis; the gaps between events are part of the argument — the
// time axis is load-bearing, the dates must be real. Phrases like "early
// 2024" or "during the war" fail the date parser at this layer.
//
// HARD-FAIL contracts (mirrored from v2.5.x):
//   - axis.start, axis.end parse as dates; end > start
//   - every event's date parses, lies in [start, end]
//   - every span's from/to parse, from <= to, both in [start, end]
//   - event/span ids unique within the scene
//   - axis.ticks (if present) each parse as dates within axis range
//   - at least one event OR one span (an empty axis is not a scene)

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

import {parseTimelineDate} from './_time';

/** Embedded-scene spec — Omit<Scene, 'beats'|...> + caption. */
export interface EmbeddedSceneSpec {
  type: string;
  id?: string;
  caption?: string;
  [key: string]: unknown;
}

export interface TimelineAxis {
  start: string;
  end: string;
  ticks?: string[];
}

export interface TimelineEvent {
  id: string;
  date: string;
  label: string;
  sub?: string;
  lane?: number;
  embed?: EmbeddedSceneSpec;
}

export interface TimelineSpan {
  id: string;
  from: string;
  to: string;
  label: string;
  lane?: number;
}

export interface TimelineScene extends Scene {
  type: 'timeline';
  kicker?: string;
  heading?: string;
  axis?: TimelineAxis;
  events?: TimelineEvent[];
  spans?: TimelineSpan[];
}

export const validate = (
  scene: TimelineScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;
  const sc = scene as unknown as {
    axis?: {start?: unknown; end?: unknown; ticks?: unknown};
    events?: unknown;
    spans?: unknown;
  };

  let axisStartMs: number | null = null;
  let axisEndMs: number | null = null;
  if (!sc.axis || typeof sc.axis !== 'object' || Array.isArray(sc.axis)) {
    issues.push({
      path: `${at}.axis`,
      message: 'timeline requires an axis {start, end, ticks?}',
      severity: 'error',
      code: 'timeline/missing-axis',
    });
  } else {
    const axis = sc.axis;
    if (typeof axis.start !== 'string' || !axis.start.trim()) {
      issues.push({
        path: `${at}.axis.start`,
        message: 'missing or empty start date',
        severity: 'error',
        code: 'timeline/axis-start-missing',
      });
    } else {
      axisStartMs = parseTimelineDate(axis.start);
      if (axisStartMs === null) {
        issues.push({
          path: `${at}.axis.start`,
          message: `axis.start "${axis.start}" is not a parseable date — use ISO "YYYY-MM-DD", month-year "Jun 2025" / "2025-06", or year-only "1914"`,
          severity: 'error',
          code: 'timeline/axis-start-unparseable',
        });
      }
    }
    if (typeof axis.end !== 'string' || !axis.end.trim()) {
      issues.push({
        path: `${at}.axis.end`,
        message: 'missing or empty end date',
        severity: 'error',
        code: 'timeline/axis-end-missing',
      });
    } else {
      axisEndMs = parseTimelineDate(axis.end);
      if (axisEndMs === null) {
        issues.push({
          path: `${at}.axis.end`,
          message: `axis.end "${axis.end}" is not a parseable date — use ISO "YYYY-MM-DD", month-year "Jun 2025" / "2025-06", or year-only "1914"`,
          severity: 'error',
          code: 'timeline/axis-end-unparseable',
        });
      }
    }
    if (
      axisStartMs !== null &&
      axisEndMs !== null &&
      axisEndMs <= axisStartMs
    ) {
      issues.push({
        path: `${at}.axis.end`,
        message: `axis.end (${String(axis.end)}) must lie strictly after axis.start (${String(axis.start)})`,
        severity: 'error',
        code: 'timeline/axis-not-monotonic',
      });
    }
    if (axis.ticks !== undefined) {
      if (!Array.isArray(axis.ticks)) {
        issues.push({
          path: `${at}.axis.ticks`,
          message: 'ticks must be an array of date strings',
          severity: 'error',
          code: 'timeline/ticks-not-array',
        });
      } else {
        axis.ticks.forEach((tk: unknown, ti: number) => {
          if (typeof tk !== 'string' || !tk.trim()) {
            issues.push({
              path: `${at}.axis.ticks[${ti}]`,
              message: 'tick must be a non-empty date string',
              severity: 'error',
              code: 'timeline/tick-empty',
            });
            return;
          }
          const ms = parseTimelineDate(tk);
          if (ms === null) {
            issues.push({
              path: `${at}.axis.ticks[${ti}]`,
              message: `tick "${tk}" is not a parseable date`,
              severity: 'error',
              code: 'timeline/tick-unparseable',
            });
          } else if (
            axisStartMs !== null &&
            axisEndMs !== null &&
            (ms < axisStartMs || ms > axisEndMs)
          ) {
            issues.push({
              path: `${at}.axis.ticks[${ti}]`,
              message: `tick "${tk}" falls outside the axis [${String(axis.start)}, ${String(axis.end)}]`,
              severity: 'error',
              code: 'timeline/tick-out-of-range',
            });
          }
        });
      }
    }
  }

  const tlIds = new Set<string>();
  // events
  if (sc.events !== undefined && !Array.isArray(sc.events)) {
    issues.push({
      path: `${at}.events`,
      message: 'events must be an array',
      severity: 'error',
      code: 'timeline/events-not-array',
    });
  } else if (Array.isArray(sc.events)) {
    sc.events.forEach((e: unknown, k: number) => {
      const eAt = `${at}.events[${k}]`;
      if (!e || typeof e !== 'object') {
        issues.push({
          path: eAt,
          message: 'event must be an object {id, date, label, sub?, lane?}',
          severity: 'error',
          code: 'timeline/event-not-object',
        });
        return;
      }
      const ev = e as Record<string, unknown>;
      if (typeof ev.id !== 'string' || !ev.id.trim()) {
        issues.push({
          path: `${eAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'timeline/event-id-missing',
        });
      } else if (tlIds.has(ev.id)) {
        issues.push({
          path: `${eAt}.id`,
          message: `duplicate timeline id "${ev.id}"`,
          severity: 'error',
          code: 'timeline/duplicate-id',
        });
      } else {
        tlIds.add(ev.id);
      }
      if (typeof ev.label !== 'string' || !ev.label.trim()) {
        issues.push({
          path: `${eAt}.label`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'timeline/event-label-missing',
        });
      }
      if (ev.sub !== undefined && (typeof ev.sub !== 'string' || !ev.sub.trim())) {
        issues.push({
          path: `${eAt}.sub`,
          message: 'sub must be a non-empty string when present',
          severity: 'error',
          code: 'timeline/event-sub-empty',
        });
      }
      if (
        ev.lane !== undefined &&
        (typeof ev.lane !== 'number' ||
          !Number.isInteger(ev.lane) ||
          (ev.lane as number) < 0)
      ) {
        issues.push({
          path: `${eAt}.lane`,
          message: 'lane must be a non-negative integer',
          severity: 'error',
          code: 'timeline/event-lane-invalid',
        });
      }
      if (typeof ev.date !== 'string' || !ev.date.trim()) {
        issues.push({
          path: `${eAt}.date`,
          message: 'missing or empty date string',
          severity: 'error',
          code: 'timeline/event-date-missing',
        });
      } else {
        const ms = parseTimelineDate(ev.date);
        if (ms === null) {
          issues.push({
            path: `${eAt}.date`,
            message: `date "${ev.date}" is not parseable — phrases like "early 2024" or "during the war" are rejected; use a real date`,
            severity: 'error',
            code: 'timeline/event-date-unparseable',
          });
        } else if (
          axisStartMs !== null &&
          axisEndMs !== null &&
          (ms < axisStartMs || ms > axisEndMs)
        ) {
          const axisStartStr =
            sc.axis && typeof sc.axis === 'object'
              ? String((sc.axis as {start?: unknown}).start)
              : '';
          const axisEndStr =
            sc.axis && typeof sc.axis === 'object'
              ? String((sc.axis as {end?: unknown}).end)
              : '';
          issues.push({
            path: `${eAt}.date`,
            message: `event date "${ev.date}" falls outside the axis [${axisStartStr}, ${axisEndStr}]`,
            severity: 'error',
            code: 'timeline/event-date-out-of-range',
          });
        }
      }
    });
  }

  // spans
  if (sc.spans !== undefined && !Array.isArray(sc.spans)) {
    issues.push({
      path: `${at}.spans`,
      message: 'spans must be an array',
      severity: 'error',
      code: 'timeline/spans-not-array',
    });
  } else if (Array.isArray(sc.spans)) {
    sc.spans.forEach((sp: unknown, k: number) => {
      const sAt = `${at}.spans[${k}]`;
      if (!sp || typeof sp !== 'object') {
        issues.push({
          path: sAt,
          message: 'span must be an object {id, from, to, label, lane?}',
          severity: 'error',
          code: 'timeline/span-not-object',
        });
        return;
      }
      const span = sp as Record<string, unknown>;
      if (typeof span.id !== 'string' || !span.id.trim()) {
        issues.push({
          path: `${sAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'timeline/span-id-missing',
        });
      } else if (tlIds.has(span.id)) {
        issues.push({
          path: `${sAt}.id`,
          message: `duplicate timeline id "${span.id}"`,
          severity: 'error',
          code: 'timeline/duplicate-id',
        });
      } else {
        tlIds.add(span.id);
      }
      if (typeof span.label !== 'string' || !span.label.trim()) {
        issues.push({
          path: `${sAt}.label`,
          message: 'missing or empty string',
          severity: 'error',
          code: 'timeline/span-label-missing',
        });
      }
      if (
        span.lane !== undefined &&
        (typeof span.lane !== 'number' ||
          !Number.isInteger(span.lane) ||
          (span.lane as number) < 0)
      ) {
        issues.push({
          path: `${sAt}.lane`,
          message: 'lane must be a non-negative integer',
          severity: 'error',
          code: 'timeline/span-lane-invalid',
        });
      }
      const axisStartStr =
        sc.axis && typeof sc.axis === 'object'
          ? String((sc.axis as {start?: unknown}).start)
          : '';
      const axisEndStr =
        sc.axis && typeof sc.axis === 'object'
          ? String((sc.axis as {end?: unknown}).end)
          : '';
      let fMs: number | null = null;
      let tMs: number | null = null;
      if (typeof span.from !== 'string' || !span.from.trim()) {
        issues.push({
          path: `${sAt}.from`,
          message: 'missing or empty from date',
          severity: 'error',
          code: 'timeline/span-from-missing',
        });
      } else {
        fMs = parseTimelineDate(span.from);
        if (fMs === null) {
          issues.push({
            path: `${sAt}.from`,
            message: `from "${span.from}" is not a parseable date`,
            severity: 'error',
            code: 'timeline/span-from-unparseable',
          });
        } else if (
          axisStartMs !== null &&
          axisEndMs !== null &&
          (fMs < axisStartMs || fMs > axisEndMs)
        ) {
          issues.push({
            path: `${sAt}.from`,
            message: `span.from "${span.from}" falls outside the axis [${axisStartStr}, ${axisEndStr}]`,
            severity: 'error',
            code: 'timeline/span-from-out-of-range',
          });
        }
      }
      if (typeof span.to !== 'string' || !span.to.trim()) {
        issues.push({
          path: `${sAt}.to`,
          message: 'missing or empty to date',
          severity: 'error',
          code: 'timeline/span-to-missing',
        });
      } else {
        tMs = parseTimelineDate(span.to);
        if (tMs === null) {
          issues.push({
            path: `${sAt}.to`,
            message: `to "${span.to}" is not a parseable date`,
            severity: 'error',
            code: 'timeline/span-to-unparseable',
          });
        } else if (
          axisStartMs !== null &&
          axisEndMs !== null &&
          (tMs < axisStartMs || tMs > axisEndMs)
        ) {
          issues.push({
            path: `${sAt}.to`,
            message: `span.to "${span.to}" falls outside the axis [${axisStartStr}, ${axisEndStr}]`,
            severity: 'error',
            code: 'timeline/span-to-out-of-range',
          });
        }
      }
      if (fMs !== null && tMs !== null && fMs > tMs) {
        issues.push({
          path: `${sAt}.to`,
          message: `span.to (${String(span.to)}) must be on or after span.from (${String(span.from)})`,
          severity: 'error',
          code: 'timeline/span-not-monotonic',
        });
      }
    });
  }

  // requiredBody — at least one event OR one span. From v2.5.x
  // validate.ts:2542-2547: an empty axis is not a scene; the axis exists to
  // carry markers.
  const eventsLen = Array.isArray(sc.events) ? sc.events.length : 0;
  const spansLen = Array.isArray(sc.spans) ? sc.spans.length : 0;
  if (eventsLen === 0 && spansLen === 0) {
    issues.push({
      path: at,
      message:
        'timeline requires at least 1 event or 1 span (the axis exists to carry markers)',
      severity: 'error',
      code: 'timeline/empty-body',
    });
  }

  return issues;
};

export default validate;
