# Bun PR Analysis — Static `import defer`

- **PR number:** #30975
- **Title:** Implement static `import defer` (TC39 Stage 3)
- **URL:** https://github.com/oven-sh/bun/pull/30975
- **Headline stat:** 15 files changed, +837 / -85 (merged as commit `184d0371aa`)

## What it introduces / does

This PR implements the static form of the TC39 Stage 3 [Deferred Module Evaluation](https://github.com/tc39/proposal-defer-import-eval) proposal — the `import defer * as ns from "./mod.js"` syntax. A deferred module is fetched and linked at load time, but its body is **not evaluated** until the first non-symbol property is accessed on the namespace object, at which point it runs synchronously. JavaScriptCore already shipped the runtime machinery for this (WebKit `3167a44fb9`); the PR's job is to thread a new `ModulePhase::Defer` flag all the way through Bun's own parser, printer, and JSModuleRecord bridge so JSC actually receives it, and to flip the `useImportDefer` engine option on. It deliberately scopes itself to the static form — dynamic `import.defer(...)` is left for a follow-up.

## What it touches

- **Parser / AST:** `src/js_parser/parse/parse_stmt.rs`, `src/js_parser/p.rs`, `src/js_parser/scan/scan_imports.rs`, `src/js_parser/parse/parse_entry.rs`, `src/js_parser/lower/lower_esm_exports_hmr.rs`, `src/ast/s.rs`, `src/ast/import_record.rs`
- **Printer / ModuleInfo serialization:** `src/js_printer/lib.rs`, `src/bundler/analyze_transpiled_module.rs`
- **JSC bridge (Rust → C++):** `src/bundler_jsc/analyze_jsc.rs`, `src/jsc/bindings/BunAnalyzeTranspiledModule.cpp`
- **Runtime / transpiler cache:** `src/jsc/bindings/ZigGlobalObject.cpp` (engine flag), `src/jsc/RuntimeTranspilerCache.rs` (cache format version 20 → 21)
- **Tests:** `test/js/bun/resolve/import-defer.test.ts` (new, 16 cases, 384 lines), `test/bundler/bundler_compile.test.ts`

## The core change

The central problem: `defer` is not a reserved word, so `import defer from "x"` must keep working as an ordinary default import. The parser treats `defer` as a phase keyword **only** when the very next token is `*`. In `src/js_parser/parse/parse_stmt.rs`, after reading what looks like a default-binding identifier, it compares the *raw* token bytes and peeks ahead:

```rust
if default_name_raw == b"defer" && p.lexer.token == T::TAsterisk && !opts.is_export {
    // ...module-scope check...
    p.lexer.next()?;
    p.lexer.expect_contextual_keyword(b"as")?;
    stmt = S::Import {
        namespace_ref: p.store_name_in_ref(p.lexer.identifier)?,
        star_name_loc: Some(p.lexer.loc()),
        phase_defer: true,
        ..Default::default()
    };
    // ...expect identifier, `from`, path, semicolon...
    return p.process_import_statement(stmt, path, loc, false);
}
```

The new state flows through two new fields: `S::Import.phase_defer` (`src/ast/s.rs`) and `ImportRecord::Flags::PHASE_DEFER` (`src/ast/import_record.rs`, bit 15, previously reserved padding). Downstream, the printer must hand JSC a faithful `JSModuleRecord`. Before, `requested_modules` was a generic `OrderedMap<StringID, FetchParameters>` keyed by specifier alone. After, it becomes a dedicated `RequestedModules` struct keyed by the **pair** `(specifier, phase)` plus a parallel `phases: Vec<ModulePhase>`, matching JSC's `ModuleAnalyzer::appendRequestedModule` — so the same specifier can be imported at both Evaluation and Defer phase:

```rust
struct RequestedModules {
    keys: Vec<StringID>,
    values: Vec<FetchParameters>,
    phases: Vec<ModulePhase>,
    index: HashMap<(StringID, ModulePhase), usize>,
}
```

Finally, in `BunAnalyzeTranspiledModule.cpp`, the deferred request is materialized into JSC with the new phase argument:

```cpp
extern "C" void JSC_JSModuleRecord__addImportEntryNamespaceDefer(/* ... */) {
    moduleRecord->addImportEntry(JSModuleRecord::ImportEntry {
        .type = JSModuleRecord::ImportEntryType::Namespace,
        .phase = AbstractModuleRecord::ModulePhase::Defer,
        // ...moduleRequest, importName, localName...
    });
}
```

## Ripple effects

- **New cache format:** the `ModuleInfo` blob now serializes a `u8` phase array (with 4-byte alignment padding) parallel to the requested-modules keys/values. The transpiler-cache `EXPECTED_VERSION` is bumped 20 → 21, invalidating older on-disk caches.
- **New serialized record kind:** `RecordKind::ImportInfoNamespaceDefer` (discriminant `9`) is added to the printer, the deserializer, and the JSC bridge; the deserializer validates phase bytes (0/1 only) since the buffer can come from an untrusted on-disk cache, returning `null` / `BadModuleInfo` on bad input.
- **C ABI changes:** all five `JSC_JSModuleRecord__addRequestedModule*` extern functions and their Rust wrappers gain a trailing `phase_defer: bool` parameter; a new `addImportEntryNamespaceDefer` entry point is introduced.
- **Dead-code elimination guard:** `scan_imports.rs` is changed so it will **not** strip an unused namespace binding from a `phase_defer` import — dropping it would degrade `import defer * as ns` to a bare side-effect import, eagerly evaluating a module the user explicitly asked to defer. The `convert_star_to_clause` optimization is likewise disabled for deferred imports.
- **Export semantics:** `finalize()`'s local→indirect export rewrite intentionally ignores deferred namespace imports, so `import defer * as ns; export { ns }` stays a *local* export, matching JSC's `ModuleAnalyzer::exportVariable`.
- **Bundler limitation:** when `bun build` inlines a deferred dependency into the same chunk, defer semantics are lost (the body runs at chunk load); only external imports preserve `import defer` in the output.
- **Unrelated build fix:** `wtf-bindings.cpp` gains an explicit `<cassert>` include, because the latest WebKit bump dropped a transitive include that `Int128.h` had been providing.

## Why it matters

`import defer` lets developers eliminate startup cost from expensive modules that may never be used on a given code path — a CLI subcommand's heavy dependency, an optional feature's module — without sacrificing the static, statically-analyzable `import` form or falling back to async dynamic `import()`. The engineering point is that the *runtime* already existed in JSC; the value of the PR is the careful, end-to-end plumbing: a contextual keyword that doesn't break existing identifiers, a serialization format that round-trips a new dimension (phase) through Bun's transpiler cache, and DCE/printer passes taught not to silently destroy the deferral the user asked for.

## Four beats

1. **The contextual keyword.** The parser learns to read `defer` as a phase keyword — but only when it is immediately followed by `*` — so `import defer from "x"` and `import { defer } from "x"` keep working unchanged, with the raw-byte comparison guarding against escape tricks like `defer`.
2. **Carrying the flag.** A new `phase_defer` field on the import AST node and a `PHASE_DEFER` bit on the import record carry the deferral intent from parse time into every later compilation pass.
3. **Reworking the wire format.** The printer's requested-modules store is rebuilt to dedup by `(specifier, phase)` and to serialize a parallel phase byte array, a new `ImportInfoNamespaceDefer` record kind appears, and the transpiler-cache version bumps to 21.
4. **Reaching the engine — and protecting the intent.** The Rust↔C++ JSC bridge gains `addImportEntryNamespaceDefer` and phase-aware requested-module calls, `useImportDefer` is switched on, and the dead-code-elimination pass is taught never to strip a deferred namespace binding (which would re-eagerize the module), all backed by a 16-case test suite.
