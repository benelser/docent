// @example/docent-scifi — the docent acceptance-test plugin pack.
//
// Ships one custom scene (`holodeck`) and one custom preset (`scifi-noir`).
// A consumer wires it into the engine via:
//
//   import {Engine} from '@bjelser/kit';
//   import corePlugins from '@bjelser/core';
//   import scifi from '@example/docent-scifi';
//
//   const engine = new Engine().use(corePlugins).use(scifi);
//
// This package does NOT touch `@bjelser/core`. The architectural proof: a
// third party can extend the scene library through the same public protocol
// `@bjelser/core` uses.

import type {Plugin} from '@bjelser/kit';

import {holodeckPlugin} from './scenes/holodeck';
import {scifiNoirPreset} from './presets/scifi-noir';

export {holodeckPlugin} from './scenes/holodeck';
export {scifiNoirPreset} from './presets/scifi-noir';

const plugins: ReadonlyArray<Plugin> = [holodeckPlugin, scifiNoirPreset];

export default plugins;
