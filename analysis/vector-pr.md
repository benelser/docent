# Vector PR Analysis: splunk_hec source second-stage framing & decoding

- **PR:** #25312
- **Title:** feat(splunk_hec source): support second-stage framing and decoding
- **URL:** https://github.com/vectordotdev/vector/pull/25312
- **Headline stat:** 7 files changed, +2,683 / -219. The vast majority of the change lives in one file: `src/sources/splunk_hec/mod.rs` (~1,638 changed lines).
- **Author:** thomasqueirozb. Merged (approved by pront, drichards-87, 20agbekodo).

## What it introduces / does

The `splunk_hec` source previously parsed the Splunk HEC envelope and emitted the inner payload as-is — one event per envelope (`/services/collector/event`) or one event per request body (`/services/collector/raw`). This PR adds optional per-endpoint codec configuration so the inner payload can be run through Vector's standard `framing` + `decoding` pipeline as a *second* decoding stage. With `decoding` set, a single HEC payload can now fan out to many events (e.g. newline-delimited records, native metrics, VRL-transformed logs). Legacy behavior is fully preserved when the new config is unset, and decode failures are swallowed rather than returned as errors to the Splunk client. A notable capability: the VRL codec can read HEC envelope metadata (host, sourcetype, channel) and the auth token via `%splunk_hec.*` paths and `get_secret!("splunk_hec_token")`, enabling per-token routing.

## What it touches

- **`src/sources/splunk_hec/mod.rs`** — the core: new `CodecConfig` struct, `event`/`raw` config fields, decoder build/threading, the decoded event-build path, ack-registration refactor, schema-definition rework.
- **`lib/codecs/src/decoding/decoder.rs`** — adds `Decoder::with_metadata_template(EventMetadata)`.
- **`lib/codecs/src/decoding/mod.rs`** — adds `DeserializerConfig::is_vrl()` and `Deserializer::with_metadata_template()` (no-op for non-VRL deserializers).
- **`lib/codecs/src/decoding/format/vrl.rs`** — `VrlDeserializer` gains a `metadata_template` field; pre-populates each synthetic event's metadata before the VRL program runs, so `%`-prefixed paths and `get_secret!()` are in scope.
- **`lib/vector-core/src/event/mod.rs`** — re-exports `Secrets` from the event module.
- **`website/cue/reference/components/sources/generated/splunk_hec.cue`** — generated docs for the new options (~923 lines).
- **`changelog.d/splunk_hec_source_codec.enhancement.md`** — changelog entry.

## The core change

Before: each HEC endpoint built exactly one event from the parsed envelope and sent it directly. After: an optional `Decoder` is threaded into the endpoint handlers, and when present the payload goes through a real framing/decoding loop that can yield many events.

**New per-endpoint config (before: nothing; after):**
```rust
pub struct CodecConfig {
    pub framing: Option<FramingConfig>,
    pub decoding: Option<DeserializerConfig>,
}
impl CodecConfig {
    fn build_decoder(&self, log_namespace: LogNamespace) -> crate::Result<Option<Decoder>> {
        match &self.decoding {
            Some(decoding) => {
                let framing = self.framing.clone()
                    .unwrap_or_else(|| decoding.default_message_based_framing());
                Ok(Some(DecodingConfig::new(framing, decoding.clone(), log_namespace).build()?))
            }
            None => Ok(None),
        }
    }
}
```

**Event construction — before (single event):**
```rust
for result in iter {
    match result {
        Ok(event) => events.push(event),
        Err(err) => { error = Some(err); break; }
    }
}
```

**After (fan-out chunk + decode-error tracking):**
```rust
for result in iter {
    match result {
        Ok((chunk, errored)) => {
            events.extend(chunk);
            had_decode_errors |= errored;
        }
        Err(err) => { error = Some(err); break; }
    }
}
```

The decode loop itself (`decode_payload`) drives `decoder.decode_eof(&mut buffer)` to EOF, stamping `source_type`, ingest timestamp, and the optional HEC token on every emitted event, and returns a `had_errors` flag so the caller can decide whether the request is ackable.

## Ripple effects

- **API / config surface:** two new optional source options (`event` and `raw`, each `{ framing, decoding }`), marked `docs::advanced`; defaults preserve current behavior.
- **Acknowledgement semantics:** the biggest behavioral subtlety. Without a decoder, the ack id is registered *before* body iteration (so capacity exhaustion fast-fails, byte-for-byte parity with old behavior). With a decoder, ack registration is *deferred* until after decoding — and is skipped entirely if the codec produced nothing, dropped any frame, or a later envelope errored. This prevents `/services/collector/ack` from reporting success for data Vector silently lost mid-stream.
- **Schema definitions:** `outputs()` was reworked to build per-endpoint schemas and merge them, because each endpoint now decides at runtime whether source metadata overwrites event fields or defers to decoder output. Output `DataType` becomes the union of both endpoints' decoder output types (logs from JSON, metrics from native, etc.), OR'd with `Log` for any non-decoder endpoint.
- **Field-precedence rule:** with a decoder configured, envelope extractors switch from `Overwrite` to `InsertIfEmpty` (`LegacyKeyStrategy`), so decoder-produced fields win on conflict. Precedence is decoder > top-level envelope keys > `fields.*`.
- **Cross-crate change:** `with_metadata_template` is added to the generic codecs `Decoder`/`Deserializer`, usable by any future source that wants to feed per-request context into a VRL decoder.
- **Performance:** the raw no-decoder path still uses `send_event` (avoiding `send_batch_latency` emission); the decoder path uses `send_batch`. New per-request `BytesMut` buffer allocation only when a decoder is configured.

## Why it matters

It turns the `splunk_hec` source from a fixed-shape envelope parser into a composable ingestion point: operators can split, reframe, or VRL-transform Splunk-bound payloads at the edge without bolting on a separate transform — including per-token, per-team routing driven by the auth token surfaced as a VRL secret. Doing this correctly meant carefully preserving the legacy fast path, the HEC acknowledgement contract, and the advertised schema, so the feature is additive and safe rather than a behavior change.

## Four beats

1. **The config surface.** A new `CodecConfig` (`framing` + `decoding`) is added per endpoint; `build_decoder` turns it into an optional `Decoder`, defaulting to a per-codec message-based framing.
2. **Threading the decoder.** The optional `Decoder` is plumbed through `SplunkSource`, the `/event` and `/raw` handlers, and the `EventIterator`, so the envelope parser can hand its inner payload to a real second-stage codec.
3. **Decode and overlay.** `build_events_decoded` extracts the envelope `event` field as bytes, runs `decode_payload`'s `decode_eof` loop to fan out into many events, then layers envelope metadata back on with `InsertIfEmpty` so decoder output wins on conflict — and the VRL codec gets envelope context injected via `with_metadata_template`.
4. **Honest acknowledgements.** Ack registration is restructured: deferred when a decoder is in use and refused outright if the codec emitted nothing or dropped a frame, so Splunk never gets an ack for data Vector lost.
