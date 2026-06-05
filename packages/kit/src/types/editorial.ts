// Editorial marker vocabulary — Wave R11 shared contract.
//
// A *marker* in an NLE (Avid, Premiere, Resolve, Final Cut) is a colored pin
// on the timeline at a specific frame: a navigation aid, a note, a flag for
// a structural moment. Editors lean on them heavily — open a finished cut in
// any of the above and the first thing they look for is the marker track.
//
// docent's editorial exporters (R11.1 FCPXML, R11.2 AAF) emit one marker per
// meaningful structural moment in the film: every scene boundary, every beat
// boundary, every big-idea moment, every tension peak, every narration start.
// The two exporters were independently re-deriving these from the frame
// schedule; this module pulls the derivation into one place so both — and
// any future exporter — speak the same vocabulary.
//
// What lives here:
//   - The `EditorialMarkerKind` discriminator — five kinds, each named after
//     the structural moment it flags.
//   - The `EditorialMarkerColor` palette — the cross-NLE-portable set of
//     seven colors. Every NLE supports more (Avid: 16; Premiere: 8; Resolve:
//     16) but only these seven render identically everywhere.
//   - `EditorialMarker` — the shape itself. Frame-addressed, immutable,
//     carries the label the NLE chip displays + an optional longer note.
//   - `DEFAULT_MARKER_COLORS` — the kind → color map the enumerator uses
//     unless an exporter overrides per-marker.
//
// What does NOT live here:
//   - The enumerator (`enumerateMarkers`) — see `../frameworks/editorial.ts`.
//   - Per-NLE XML/AAF serialization — see the exporter packages.

/**
 * The closed set of marker kinds docent emits. Each kind names a structural
 * moment in a film; the kinds can overlap on the same frame (a scene's
 * first beat is also a scene boundary, a narration start, and possibly a
 * big-idea start). The enumerator emits all overlapping kinds as separate
 * markers and lets the consumer decide whether to dedupe — different NLEs
 * have different tolerances for stacked markers.
 *
 * - `'scene'` — start of any scene. Blue.
 * - `'beat'` — start of any beat. Gray.
 * - `'big-idea'` — start of a `tension`, `recap`, or `closeup` scene (the
 *   moments the film *earns* — the reasoning/payoff layer). Orange.
 * - `'tension-peak'` — last beat of a `tension` scene with multiple beats
 *   (the verdict, the hard truth). Red.
 * - `'narration'` — every beat with non-empty `beat.narration`. Green.
 */
export type EditorialMarkerKind =
  | 'scene'
  | 'beat'
  | 'big-idea'
  | 'tension-peak'
  | 'narration';

/**
 * Cross-NLE-portable marker color palette. Seven colors that render with
 * the same semantic intent across Avid Media Composer, Adobe Premiere Pro,
 * DaVinci Resolve, and Apple Final Cut Pro. Avid supports 16 distinct
 * colors; Resolve supports 16; Premiere supports 8 — but the intersection
 * where the same color name maps to the same swatch is these seven.
 *
 * Cut from the larger palettes: `cyan`/`teal` (only Avid + Resolve),
 * `magenta`/`pink` (Premiere maps to "magenta", Resolve to "pink", Avid
 * has both), `lemon`/`mint`/`navy` (Avid-only).
 */
export type EditorialMarkerColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'gray';

/**
 * One editorial marker — a colored pin at a specific frame on the master
 * timeline. Immutable; the enumerator returns a frozen array.
 *
 * `frame` is in master-timeline frames at the film's resolved fps. The
 * `sceneIndex` and (optional) `beatIndex` back-reference into `spec.scenes`
 * — an exporter that wants to enrich a marker with scene metadata can look
 * up the source without re-walking the schedule.
 */
export interface EditorialMarker {
  /** Master-timeline frame number. Always `>= 0`, always `<= totalFrames`. */
  readonly frame: number;
  /** Which structural moment this marker flags. */
  readonly kind: EditorialMarkerKind;
  /** The chip color the NLE renders. */
  readonly color: EditorialMarkerColor;
  /**
   * Short text the NLE renders next to the chip. The enumerator truncates
   * long labels (e.g. narration) to ~30 chars on a word boundary so the
   * chip stays readable.
   */
  readonly label: string;
  /**
   * Longer descriptive text. NLEs surface this in a marker-detail panel
   * (Avid's marker comment, Premiere's marker description, Resolve's
   * marker notes). When the label is a truncation, `note` carries the
   * full original text.
   */
  readonly note?: string;
  /** Index into `spec.scenes` — the scene this marker belongs to. */
  readonly sceneIndex: number;
  /**
   * Index into `spec.scenes[sceneIndex].beats` — present on `beat`,
   * `narration`, and `tension-peak` kinds; absent on `scene` and
   * `big-idea` (which fire on scene boundaries, not specific beats).
   */
  readonly beatIndex?: number;
}

/**
 * The default color the enumerator assigns each marker kind. Exporters MAY
 * override per-marker (e.g. an FCPXML exporter that re-colors a `narration`
 * marker for a specific scene) but the defaults are the agreed semantic
 * map every consumer reads first.
 */
export const DEFAULT_MARKER_COLORS: Record<
  EditorialMarkerKind,
  EditorialMarkerColor
> = {
  scene: 'blue',
  beat: 'gray',
  'big-idea': 'orange',
  'tension-peak': 'red',
  narration: 'green',
};
