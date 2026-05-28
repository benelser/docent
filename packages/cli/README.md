# @bjelser/cli

The `docent` binary — the thin shell that drives `@bjelser/kit` + `@bjelser/core`. Builds, validates, and depth-checks films from the command line.

## Install

```bash
npm install @bjelser/cli @bjelser/kit @bjelser/core
# or
bun add @bjelser/cli @bjelser/kit @bjelser/core
```

## Use

```bash
# Render a film through the new architecture
bunx docent build linear-algebra --scale 0.5

# Run the hermetic gallery (4 fixture films)
bunx docent hermetic --scale 0.5

# Validate a spec against the registered schema
bunx docent validate films/my-film.json

# Run depth checks
bunx docent depthcheck films/my-film.json
```

## Configuration

The CLI auto-discovers `docent.config.ts` in the project root. Use it to register custom plugin packs:

```ts
// docent.config.ts
import {corePlugins} from '@bjelser/core';
import {myFinancePack} from '@example/docent-finance';

export default {
  plugins: [...corePlugins, myFinancePack],
};
```

## Architecture

`@bjelser/cli` calls into `@bjelser/kit` (the framework). All scene types, presets, features, and TTS providers come from the plugin registry — `@bjelser/core` ships the defaults, third-party packs extend the surface. See the [main README](https://github.com/benelser/docent/blob/main/README.md) for the plugin-authoring guide.

## License

MIT
