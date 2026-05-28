// @example/docent-finance — a vertical scene pack for financial explainers.
//
// Adds two scenes through @bjelser/kit's public protocol:
//
//   - `ohlc`        — an Open-High-Low-Close chart over 5..20 bars. The
//                     comparison-cluster move for "show the multi-bar shape
//                     of a market over time."
//   - `candlestick` — a single bar, close-read. The argument move for "what
//                     does this ONE bar tell us about the day."
//
// Standard finance conventions: green up (close ≥ open), red down (close <
// open). The wick stretches from low to high; the body fills open ↔ close.
//
// A consumer wires this pack into the engine via:
//
//   import {Engine} from '@bjelser/kit';
//   import corePlugins from '@bjelser/core';
//   import finance from '@example/docent-finance';
//
//   const engine = new Engine().use(corePlugins).use(finance);
//
// This package does NOT touch `@bjelser/core`. The architectural proof: a
// third-party vertical can carry domain-specific scenes through the same
// protocol the core 29 use.

import type {Plugin} from '@bjelser/kit';

import {ohlcPlugin} from './scenes/ohlc';
import {candlestickPlugin} from './scenes/candlestick';

export {ohlcPlugin} from './scenes/ohlc';
export {candlestickPlugin} from './scenes/candlestick';

const plugins: ReadonlyArray<Plugin> = [ohlcPlugin, candlestickPlugin];

export default plugins;
