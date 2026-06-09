// JSON Schema fragment for the `live-browser` scene's per-type spec branch.
//
// R16.1. The docent move that *drives a real browser at render time*. Unlike
// `demonstrate` — which plays a pre-recorded MP4 baked weeks ago — the
// `live-browser` scene declares a URL + an action script; the cascade's
// `live-capture-stage` spawns a headless Playwright session BEFORE the
// Remotion render, captures the session as an MP4 under
// `public/clips/<filmId>/live-<sceneId>.mp4`, and the renderer plays that
// captured clip via the same chrome the `demonstrate` scene uses.
//
// Why a new scene type instead of an option on `demonstrate`? Two reasons:
//
//   1. Authoring affordance — a `demonstrate` scene's `clip` is a hand-curated
//      asset the author refines outside docent (Final Cut, ScreenStudio, etc.).
//      A `live-browser` scene's clip is an *output*, regenerated on every
//      build. Mixing them would conflate "I picked this asset" with "the
//      cascade owns this asset". The scene type is the lever — the cascade
//      hook only fires on `type === 'live-browser'`.
//   2. Spec hygiene — an editor opening a `demonstrate` scene expects the
//      `clip` field to be authoritative. A `live-browser` scene's captured
//      clip carries a predictable path the author MUST NOT edit (the hash
//      of url+actions becomes part of the cache key). The grammar makes
//      that distinction visible.
//
// The schema mirrors `demonstrate` for the rendered output (cursor / pins
// overlays in clip-native pixels), but the input shape is entirely new:
// `url`, `viewport`, `actions[]`, optional `auth`, and a `durationFrames`
// total capture window. The build-time hook runs Playwright; the
// render-side component reads the captured MP4 — the spec author never
// thinks about an asset path because the cascade owns it.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'live-browser scenes — drive a real browser at render time. The cascade\'s ' +
    '`live-capture-stage` runs BEFORE the Remotion render, spawns a headless ' +
    'Playwright session against `url`, executes the declared `actions[]` (each ' +
    'with an `at` frame offset), and writes a captured MP4 under ' +
    '`public/clips/<filmId>/live-<sceneId>.mp4`. The render-side component plays ' +
    'that clip inside the same device-style window panel `demonstrate` uses, ' +
    'with optional cursor/pin overlays layered on top. Every render produces a ' +
    'FRESH capture against current data — no stale recording. When Playwright ' +
    'is not installed (or the capture fails), the scene degrades to the same ' +
    'placeholder `demonstrate` shows when its `clip` is missing.',
  required: ['url'],
  properties: {
    url: {
      type: 'string',
      minLength: 1,
      description:
        'the URL Playwright navigates to. http:// and https:// schemes are ' +
        'supported; file:// is rejected at validate time (a typo from "test ' +
        'against a local html" should land in `demonstrate` with a baked clip, ' +
        'not in a live capture). The cascade waits for `networkidle` after ' +
        'navigation before running the action script.',
    },
    viewport: {
      type: 'object',
      additionalProperties: false,
      properties: {
        width: {type: 'number', minimum: 320, maximum: 7680},
        height: {type: 'number', minimum: 240, maximum: 4320},
      },
      description:
        'Playwright viewport size. Defaults to {1920, 1080} so the captured ' +
        'session matches the film canvas at native 16:9 — overlay coordinates ' +
        'line up pixel-for-pixel without rescaling. Override when capturing a ' +
        'portrait dashboard (set 1080x1920 against a `meta.aspect: "9:16"` ' +
        'film) or a small kiosk surface.',
    },
    actions: {
      type: 'array',
      description:
        'ordered action script Playwright executes after navigation. Each ' +
        'action carries an `at` (frame offset from capture start, 30 fps), a ' +
        '`kind` discriminator, and a kind-specific payload (selector / text / ' +
        'coordinates / durationFrames). The cascade waits until each action\'s ' +
        '`at` frame before dispatching it — so an author writes the script ' +
        'against the captured clip\'s timeline, not the wall clock.',
      items: {
        type: 'object',
        required: ['at', 'kind'],
        additionalProperties: false,
        properties: {
          at: {
            type: 'number',
            minimum: 0,
            description:
              'frame offset from capture start at which to dispatch this action.',
          },
          kind: {
            type: 'string',
            enum: ['click', 'hover', 'scroll', 'type', 'wait', 'screenshot'],
            description:
              'what Playwright does at this frame. `click` / `hover` / `type` ' +
              'require a selector or (x, y) coords. `scroll` accepts a selector ' +
              '(scrollIntoView) or absolute (x, y) (window.scrollTo). `type` ' +
              'requires `text`. `wait` holds for `durationFrames`. ' +
              '`screenshot` captures a still annotation point (no-op for the ' +
              'video itself; reserved for future per-action thumbnail surface).',
          },
          selector: {
            type: 'string',
            description: 'CSS selector. Mutually exclusive with (x, y) on click/hover.',
          },
          text: {
            type: 'string',
            description: 'text to type, required when `kind === "type"`.',
          },
          x: {type: 'number', description: 'absolute viewport X (alternative to selector).'},
          y: {type: 'number', description: 'absolute viewport Y (alternative to selector).'},
          durationFrames: {
            type: 'number',
            minimum: 1,
            description:
              'how long to hold (for `wait`) or animate towards (for hover). ' +
              'Default 30 (one second at 30 fps).',
          },
        },
      },
    },
    durationFrames: {
      type: 'number',
      minimum: 30,
      description:
        'Total length of the capture, in frames at 30 fps. Default 360 (12s). ' +
        'The cascade tears down the browser at this frame regardless of ' +
        'remaining actions — over-long action scripts get truncated, not extended.',
    },
    auth: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: {type: 'string', enum: ['basic', 'header']},
        username: {type: 'string'},
        password: {type: 'string'},
        headers: {
          type: 'object',
          additionalProperties: {type: 'string'},
        },
      },
      description:
        'optional auth surfaced to Playwright\'s context. `basic` populates ' +
        '`httpCredentials`; `header` populates `setExtraHTTPHeaders`. Use a ' +
        'header for token-based auth (Bearer, X-API-Key); use basic for the ' +
        'old-school dashboard behind nginx auth_basic.',
    },
    kicker: {type: 'string', description: 'the section label rendered in the scene chrome.'},
    heading: {type: 'string', description: 'the scene heading drawn beneath the kicker.'},
    cursorStyle: {
      type: 'string',
      enum: ['mac', 'windows'],
      description: 'pointer glyph for the optional `cursor` overlay; defaults to mac.',
    },
    cursor: {
      type: 'array',
      description:
        'OPTIONAL cursor waypoints layered ABOVE the captured clip. Same ' +
        'semantics as `demonstrate.cursor` — but note Playwright already drove ' +
        'its OWN cursor in the capture, so this overlay is a layered annotation ' +
        '(an emphasis stroke), not a replacement. Most live-browser scenes ' +
        'omit `cursor` entirely and let Playwright\'s real pointer carry the eye.',
      items: {
        type: 'object',
        required: ['at', 'x', 'y'],
        additionalProperties: false,
        properties: {
          at: {type: 'number', minimum: 0},
          x: {type: 'number'},
          y: {type: 'number'},
          action: {type: 'string', enum: ['move', 'click', 'hover']},
        },
      },
    },
    pins: {
      type: 'array',
      description: 'OPTIONAL pin callouts. Same shape as `demonstrate.pins`.',
      items: {
        type: 'object',
        required: ['at', 'durationFrames', 'x', 'y', 'text'],
        additionalProperties: false,
        properties: {
          at: {type: 'number', minimum: 0},
          durationFrames: {type: 'number', minimum: 1},
          x: {type: 'number'},
          y: {type: 'number'},
          text: {type: 'string', minLength: 1},
          anchor: {type: 'string', enum: ['tl', 'tr', 'bl', 'br']},
          leader: {type: 'boolean'},
        },
      },
    },
  },
};

export default schema;
