# @docent/core

> docent's default implementation. The 29 canonical scene plugins, 6 presets,
> the Kokoro TTS adapter, and the default narration + audio-rhythm features.
> Depends on `@docent/kit`; registers everything through the framework's
> public API.

There is no private path. If `@docent/core` ever has to reach into
`@docent/kit` internals to register a scene, the API is wrong — fix the
API, not the workaround.

## Loading

```ts
import {Engine} from '@docent/kit';
import * as core from '@docent/core';

const engine = new Engine().use(core);
```

`core` is an array of plugins; `engine.use(core)` registers every plugin
in one call via the polymorphic `use(plugin | plugin[])` dispatch.

## Adding a plugin

1. Create the plugin's directory under `src/scenes/`, `src/presets/`,
   `src/features/`, or `src/tts/`.
2. Export the plugin from the directory's `index.ts`.
3. The integrator adds the plugin to `src/index.ts`'s `corePlugins` array.

The integrator owns `src/index.ts`. Per-plugin agents don't touch it —
they add their plugin to its own directory and the integrator assembles
the manifest at merge time.
