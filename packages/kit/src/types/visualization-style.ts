// VisualizationStyle — scene-family-level renderer knobs. Lives next to
// `DesignTokens` (per-pixel knobs) and `StyleIntent` (semantic meta-knobs).
//
// The renderer reads the *resolved* values (`Required<VisualizationStyle>`).
// `null` on `treatmentLock` means no lock — the scene's own treatment wins.
//
// Mirrors `packages/engine/src/style/styleSchema.ts` for v2.x compatibility.

/**
 * Where charts and diagrams put their legend block. `'none'` suppresses
 * the legend entirely (executive presets sometimes do this when the legend
 * is redundant with the axis labels).
 */
export type LegendPosition = 'top' | 'bottom' | 'left' | 'right' | 'none';

/** Runtime list of every {@link LegendPosition} value, in canonical order. */
export const LEGEND_POSITIONS: readonly LegendPosition[] = [
  'top',
  'bottom',
  'left',
  'right',
  'none',
] as const;

/**
 * Scene-family-level visualisation knobs.
 *
 * `treatmentLock` is the executive-deck lock: an executive preset sets
 * `treatmentLock: 'crisp'` so a scene that requests `treatment: 'sketch'`
 * still renders crisp. `null` means no lock.
 */
export interface VisualizationStyle {
  legendPosition?: LegendPosition;
  gridLines?: boolean;
  axisLabels?: boolean;
  /** Maximum labels per chart series — executive audiences get fewer. */
  maxLabelsPerSeries?: number;
  /**
   * The hand-drawn treatment lock: `crisp` clamps out sketch even if a scene
   * requests it (e.g. an executive deck blocks playful skins). `null` means
   * no lock — the scene's own `treatment` knob wins.
   */
  treatmentLock?: 'crisp' | 'sketch' | 'whiteboard' | null;
}
