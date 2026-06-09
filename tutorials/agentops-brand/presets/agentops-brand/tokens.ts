// agentops-brand — design tokens.
//
// A real third-party brand pack — the visual register of an LLM-agent
// observability runbook. Tuned for the "agentops-lunch-and-learn" film
// (films/agentops-lunch-and-learn.json), but reusable by anything in the
// AgentOps family.
//
// Color provenance — the runbook's span taxonomy is the source of truth:
//   - PLAN_STEP        → purple #a78bfa   reasoning, the root of an agent trace
//   - LLM_CALL         → green  #4ade80   "computation succeeded" — model latency / cost
//   - TOOL_CALL        → brown  #c08552   "we touched the outside world" — earthy, deliberate
//   - AGENT_DECISION   → blue   #5cb6ff   the fork point — what path was chosen
//   - FLOW_CHECKPOINT  → gray   #9ca3af   sibling marker, neutral by design
//   - HALLUCINATION    → red    #ef4444   the only red on screen — when it lights, you look
//
// The kit's AccentTokens interface is a CLOSED enum of 6 names
// (blue/cyan/green/amber/rose/violet), so the six span colours have to MAP
// onto those keys. The mapping below was picked so that each existing scene
// component — which reads `accent.blue` by default — still resolves to a
// reasonable colour even before any per-scene accent override is authored:
//
//   accent.blue   → agent_decision  (default — closest to docent's neutral blue)
//   accent.violet → plan_step       (purple — semantically nearest)
//   accent.green  → llm_call        (a brighter, more saturated green than neutral)
//   accent.amber  → tool_call       (warm tan — sits as the "warm" channel)
//   accent.cyan   → flow_checkpoint (the muted/neutral channel — gray rendered cool)
//   accent.rose   → hallucination   (THE red — saturated, only one on the palette)
//
// Background ramp is a deep navy — not neutral's near-black. The runbook is
// a "control plane" subject; navy reads as the night-shift observability
// console without going as bleak as neutral. Panel borders are pulled a
// touch more saturated so the structure scenes (taxonomy diagrams, span
// hierarchies) read as the "blueprint" they are.
//
// Typography pairs Inter (chrome, prose) with JetBrains Mono (code,
// span-name keys). Both are already loaded by @bjelser/core's _shared/fonts
// module — no extra loader hookup needed.

import type {DesignTokens} from '@bjelser/kit';

export const tokens: DesignTokens = {
  bg: {
    // Navy ramp — observability-console night, not console-black.
    void: '#040712',     // deepest backdrop, behind everything
    base: '#0b1220',     // page ground — the navy floor
    panel: '#121b30',    // raised card
    panelHi: '#1a253f',  // focused card
    line: '#2a3856',     // panel border — more saturated than neutral
    lineHi: '#3e5183',   // focused border — accent glow seed
  },
  ink: {
    // Cooler than neutral's `#f3f5fa` — picks up the navy ground.
    hi: '#f1f5fb',       // headline ink
    mid: '#a8b3c7',      // body
    low: '#6c7896',      // tertiary
    faint: '#465168',    // metadata
  },
  accent: {
    // The agentops span taxonomy mapped onto the kit's closed enum.
    // Every hex below is the colour as it appears in the runbook
    // diagram (../diagrams/02-span-taxonomy.png).
    blue: '#5cb6ff',     // agent_decision  — the default; the fork point
    cyan: '#9ca3af',     // flow_checkpoint — gray, the neutral sibling
    green: '#4ade80',    // llm_call        — model invocation succeeded
    amber: '#c08552',    // tool_call       — earthy tan, outside-world action
    rose: '#ef4444',     // hallucination   — the only saturated red on screen
    violet: '#a78bfa',   // plan_step       — purple, the reasoning root
  },
  typography: {
    family: {
      // Inter for chrome / prose — engineering-clean but not cold.
      // JetBrains Mono for code (closeup scenes) and span keys.
      // Both already loaded by @bjelser/core's _shared/fonts.ts.
      sans: 'Inter, "Helvetica Neue", system-ui, sans-serif',
      serif: '"Source Serif Pro", Georgia, "Times New Roman", serif',
      mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
    },
    size: {
      micro: 12,
      small: 14,
      body: 18,
      label: 20,
      heading: 30,        // a touch larger than neutral — diagrams want room
      display: 60,        // banner scale for the frame scene
    },
    weight: {
      body: 400,
      label: 500,
      heading: 600,
      display: 700,
    },
    lineHeight: 1.5,      // engineering-tight but legible
    letterSpacing: 0,
  },
  // Comfortable spacing — a runbook is a long-form read.
  spacing: {xs: 4, sm: 8, md: 16, lg: 24, xl: 48, gutter: 28},
  // Soft corners — friendlier than the IDE-sharp `engineering` preset.
  radius: {sm: 6, md: 10, lg: 16},
  // Slightly heavier strokes than neutral — diagram lines need to read on
  // the deeper navy ground.
  stroke: {hairline: 0.75, thin: 1.25, regular: 2, bold: 3.5},
  // STRUCTURAL CHROME — the whole point of this preset's R5 refresh.
  // Replaces docent's default starfield+motes shell with an engineering /
  // observability skin: a hex dot lattice (reads as "control plane / fleet
  // view" rather than "outer space"), calmer ambient motion, a tighter
  // vignette, and span-name kickers ("PLAN_STEP →") that match the
  // runbook's vocabulary. The wordmark swaps `docent` for `agentops` so
  // an agentops viewer never sees the tool's branding leak through.
  chrome: {
    background: 'hex',
    motes: 0.5,
    vignette: 0.7,
    kickerStyle: 'agentops',
    wordmark: 'agentops',
  },
};

export default tokens;
