// docent.config.ts — wires @example/docent-finance into the engine.
//
// The CLI's engine factory walks up from cwd looking for this file. When
// found, its `plugins` array is registered on top of @bjelser/core's
// corePlugins. The finance pack adds two scene types (`ohlc`,
// `candlestick`) — both in the `comparison` cluster.

import finance from './src';

export default {
  plugins: finance,
};
