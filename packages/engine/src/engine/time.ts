// Fault-tolerant date parsing for the `timeline` scene type.
//
// A timeline carries an axis (`start`/`end`) and events/spans pinned to date
// strings. The author writes dates in a few human-natural forms; the engine
// parses them to a single numeric coordinate (epoch milliseconds) so positions
// on the axis fall out by linear interpolation.
//
// SUPPORTED — exactly these forms; everything else is rejected as a HARD FAIL:
//   - ISO date         "2017-06-12"
//   - month-year ISO   "2017-06"
//   - year-only        "1914"
//   - month-year text  "Jun 2025"  "June 2025"
//
// REJECTED — alpha content other than month names (e.g. "early 2024",
//   "during the war", "Q3 2023") returns null. The validator turns null into
//   a HARD FAIL; the renderer treats null as "do not plot".

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

// Parse a permitted date string to epoch milliseconds (UTC). Returns null on
// any unrecognised form. The function is forgiving on whitespace but strict on
// shape — "early 2024" or "during the war" is null.
export const parseTimelineDate = (s: unknown): number | null => {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;

  // Year-only — "1914", "2026". (1- to 4-digit positive year.)
  const yearOnly = /^(\d{1,4})$/.exec(t);
  if (yearOnly) {
    const y = Number(yearOnly[1]);
    return Date.UTC(y, 0, 1);
  }

  // ISO "YYYY-MM-DD"
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]) - 1;
    const d = Number(iso[3]);
    if (m < 0 || m > 11 || d < 1 || d > 31) return null;
    return Date.UTC(y, m, d);
  }

  // ISO month-year "YYYY-MM"
  const isoMo = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (isoMo) {
    const y = Number(isoMo[1]);
    const m = Number(isoMo[2]) - 1;
    if (m < 0 || m > 11) return null;
    return Date.UTC(y, m, 1);
  }

  // Month-year text — "Jun 2025", "June 2025"
  const mo = /^([A-Za-z]+)\s+(\d{1,4})$/.exec(t);
  if (mo) {
    const m = MONTHS[mo[1].toLowerCase()];
    if (m === undefined) return null; // alpha that isn't a month name → reject
    const y = Number(mo[2]);
    return Date.UTC(y, m, 1);
  }

  // Year-month text — "2025 Jun"
  const ym = /^(\d{1,4})\s+([A-Za-z]+)$/.exec(t);
  if (ym) {
    const m = MONTHS[ym[2].toLowerCase()];
    if (m === undefined) return null;
    const y = Number(ym[1]);
    return Date.UTC(y, m, 1);
  }

  return null;
};

// A short tick label for an arbitrary date string. The renderer reads the
// author's tick string verbatim (we never invent labels), but for auto-spaced
// ticks we synthesize a year string from epoch ms.
export const yearOf = (ms: number): string => {
  const d = new Date(ms);
  return String(d.getUTCFullYear());
};
