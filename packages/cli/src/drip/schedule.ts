// Schedule → next-fire-time. The drip tick calls `nextFire(schedule, now)`
// to decide whether an entry is "due" right now.
//
// What we support:
//
//   - `{ datetime: ISO }` — one-shot fire. `nextFire` returns the parsed
//     Date if it's >= now; otherwise (entry already published-or-overdue),
//     it returns the same time (so the tick fires it immediately).
//
//   - `{ cadence: 'MWF' | 'TTH' | 'daily' | 'weekly', timeOfDay: 'HH:MM',
//        timezone: string }` — recurring. We use the Intl APIs to map the
//     timezone onto the next eligible weekday + HH:MM.
//
//   - `{ cron: string }` — cron string. Supported subset: 5-field cron
//     `minute hour day-of-month month day-of-week` with `*` and integer
//     literals only (no ranges, no steps, no comma lists in this PR). A
//     fuller cron parser belongs in a separate adapter.
//
// `due(schedule, now)` returns true when the entry's next fire window
// has elapsed.

import type {ScheduleSpec} from '@bjelser/kit';
import {isCadenceSchedule, isCronSchedule, isDatetimeSchedule} from '@bjelser/kit';

/**
 * Parse a `'HH:MM'` string into `{hour, minute}`. Throws on malformed.
 */
const parseHHMM = (s: string): {hour: number; minute: number} => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`invalid timeOfDay "${s}" — expected HH:MM`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`invalid timeOfDay "${s}" — out of range`);
  }
  return {hour, minute};
};

/**
 * Cadence → set of weekdays (0 = Sun … 6 = Sat).
 */
const cadenceWeekdays = (cadence: 'MWF' | 'TTH' | 'daily' | 'weekly'): Set<number> => {
  switch (cadence) {
    case 'MWF':
      return new Set([1, 3, 5]);
    case 'TTH':
      return new Set([2, 4]);
    case 'daily':
      return new Set([0, 1, 2, 3, 4, 5, 6]);
    case 'weekly':
      // "Same weekday the entry was created" is the spec; in the absence
      // of an explicit `weeklyDay` we default to Wednesday (3) — a
      // reasonable mid-week drop slot. Callers wanting different days
      // should use cadence 'MWF' / 'TTH' or a cron.
      return new Set([3]);
  }
};

/**
 * Compute the weekday (0–6) of `date` in `tz` via Intl. Handles DST
 * + tz offsets correctly without us doing manual math.
 */
const weekdayInTz = (date: Date, tz: string): number => {
  const fmt = new Intl.DateTimeFormat('en-US', {timeZone: tz, weekday: 'short'});
  const short = fmt.format(date); // e.g. "Mon"
  return {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6}[short] ?? 0;
};

/**
 * Compute `{Y, M, D, h, m}` of `date` in `tz`.
 */
const partsInTz = (date: Date, tz: string) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24, // Intl can give "24" for midnight
    minute: Number(get('minute')),
  };
};

/**
 * Build a Date for `(year-month-day at hour:minute)` interpreted in `tz`.
 *
 * Implementation note: we synthesize an ISO-like string and adjust via
 * the offset Intl reports. This is the canonical workaround until
 * `Temporal` is everywhere.
 */
const dateInTz = (
  ymd: {year: number; month: number; day: number},
  hm: {hour: number; minute: number},
  tz: string,
): Date => {
  // Start with UTC interpretation; compute the tz offset at that instant;
  // shift to land on the wall-clock we wanted. One round of correction is
  // enough except near DST transitions; we do a second corrective pass.
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const isoUtc = `${ymd.year}-${pad2(ymd.month)}-${pad2(ymd.day)}T${pad2(hm.hour)}:${pad2(hm.minute)}:00Z`;
  let d = new Date(isoUtc);

  for (let i = 0; i < 2; i++) {
    const got = partsInTz(d, tz);
    const wallMs =
      Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute);
    const targetMs =
      Date.UTC(ymd.year, ymd.month - 1, ymd.day, hm.hour, hm.minute);
    const delta = targetMs - wallMs;
    if (delta === 0) break;
    d = new Date(d.getTime() + delta);
  }
  return d;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Next fire time for the schedule, at or after `now`. Returns a Date.
 *
 * For `datetime` schedules: returns that exact instant.
 * For `cadence` schedules: returns the next `(weekday, HH:MM)` slot.
 * For `cron` schedules: minimal "next minute matching the cron" search,
 * one minute at a time, bounded to the next 7 days.
 */
export const nextFire = (schedule: ScheduleSpec, now: Date = new Date()): Date => {
  if (isDatetimeSchedule(schedule)) {
    return new Date(schedule.datetime);
  }
  if (isCadenceSchedule(schedule)) {
    const {hour, minute} = parseHHMM(schedule.timeOfDay);
    const weekdays = cadenceWeekdays(schedule.cadence);
    const tz = schedule.timezone;

    // Try today; if today's slot hasn't fired and is an eligible weekday,
    // that's the answer. Otherwise walk forward day by day.
    for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
      const probe = new Date(now.getTime() + dayOffset * MS_PER_DAY);
      const wd = weekdayInTz(probe, tz);
      if (!weekdays.has(wd)) continue;
      const probeParts = partsInTz(probe, tz);
      const candidate = dateInTz(
        {year: probeParts.year, month: probeParts.month, day: probeParts.day},
        {hour, minute},
        tz,
      );
      if (candidate.getTime() >= now.getTime()) return candidate;
    }
    // Shouldn't be reachable for any cadence that has >=1 weekday/week.
    throw new Error(`no eligible fire window for cadence ${schedule.cadence}`);
  }
  if (isCronSchedule(schedule)) {
    return nextCronFire(schedule.cron, now);
  }
  throw new Error('unknown schedule shape');
};

export const due = (schedule: ScheduleSpec, now: Date = new Date()): boolean => {
  try {
    const fire = nextFire(schedule, now);
    return fire.getTime() <= now.getTime();
  } catch {
    return false;
  }
};

/**
 * Minimal 5-field cron matcher. Supports `*` and integer literals only.
 * Fields: minute hour day-of-month month day-of-week (0–6, Sun=0).
 *
 * Walks forward minute-by-minute, capped at 7 days.
 */
const nextCronFire = (expr: string, now: Date): Date => {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`cron must have 5 fields, got "${expr}"`);
  }
  const matches = (raw: string, value: number): boolean => {
    if (raw === '*') return true;
    return Number(raw) === value;
  };

  let candidate = new Date(now.getTime());
  // Round up to the next minute boundary.
  candidate.setSeconds(0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate = new Date(candidate.getTime() + 60_000);
  }

  const limit = now.getTime() + 7 * MS_PER_DAY;
  while (candidate.getTime() < limit) {
    const m = candidate.getMinutes();
    const h = candidate.getHours();
    const dom = candidate.getDate();
    const mo = candidate.getMonth() + 1;
    const dow = candidate.getDay();
    if (
      matches(fields[0]!, m) &&
      matches(fields[1]!, h) &&
      matches(fields[2]!, dom) &&
      matches(fields[3]!, mo) &&
      matches(fields[4]!, dow)
    ) {
      return candidate;
    }
    candidate = new Date(candidate.getTime() + 60_000);
  }
  throw new Error(`no cron match within 7 days for "${expr}"`);
};

/**
 * Parse the CLI `--schedule` shorthand:
 *   "MWF 15:00 America/Chicago"
 *   "TTH 09:30 UTC"
 *   "daily 12:00 America/New_York"
 *   "@2026-06-04T15:00:00Z"   (datetime — `@` prefix)
 *   "cron: * /15 * * * *"     (cron — `cron:` prefix)
 */
export const parseScheduleArg = (raw: string): ScheduleSpec => {
  const s = raw.trim();
  if (s.startsWith('@')) {
    const dt = s.slice(1);
    // Validate roughly — Date will accept anything.
    if (Number.isNaN(Date.parse(dt))) {
      throw new Error(`invalid --schedule datetime: "${dt}"`);
    }
    return {datetime: new Date(dt).toISOString()};
  }
  if (s.startsWith('cron:')) {
    return {cron: s.slice(5).trim()};
  }
  // Cadence shorthand.
  const parts = s.split(/\s+/);
  if (parts.length < 3) {
    throw new Error(
      `invalid --schedule "${raw}". Expected forms:\n` +
        `  "MWF 15:00 America/Chicago"\n` +
        `  "TTH 09:30 UTC"\n` +
        `  "@2026-06-04T15:00:00Z"\n` +
        `  "cron: 0 15 * * 1"`,
    );
  }
  const [cadenceRaw, timeOfDay, ...rest] = parts;
  const timezone = rest.join(' ');
  if (!['MWF', 'TTH', 'daily', 'weekly'].includes(cadenceRaw!)) {
    throw new Error(
      `invalid cadence "${cadenceRaw}". Expected MWF, TTH, daily, weekly.`,
    );
  }
  return {
    cadence: cadenceRaw as 'MWF' | 'TTH' | 'daily' | 'weekly',
    timeOfDay: timeOfDay!,
    timezone,
  };
};
