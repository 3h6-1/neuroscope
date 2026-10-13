# Local dialogue and observable workspace

NeuroScope has two explicitly different response modes. The **state inspector** is a deterministic formatter of supplied simulation data. It can report activity, symbolic focus, stored memory items, compound mechanisms and recorded events. It does not invent unseen events or answer arbitrary questions by pretending to be an intelligent brain. It works without WebGPU, an account, an API key or a model download.

The optional **local language model** generates open-ended text in a browser worker using WebLLM. Its answer is conditioned on a captured snapshot of the experiment and explicitly supplied conversation history. The language model is a separate computational system: speech does not emerge from the displayed neurons, and its outputs are not literal internal thoughts of those neurons. Regional activity, symbolic associations and language sampling are different layers.

## Model loading and privacy

Nothing downloads a language model at startup, during ordinary state inspection, or merely by importing `src/dialogue.js`. Only the explicit **Load local language model** action calls `DialogueClient.load()`. The WebLLM runtime is then imported dynamically and a dedicated worker is constructed. Inference takes place locally, as described by [WebLLM's official documentation](https://webllm.mlc.ai/docs/).

The dependency is pinned to `@mlc-ai/web-llm` **0.2.86**, verified against the publisher's npm `latest` tag and [official package source](https://github.com/mlc-ai/web-llm/blob/main/package.json) on October 13, 2026. Two IDs were checked against the installed prebuilt registry:

| Model | Exact ID | Registry GPU-memory estimate |
| --- | --- | --- |
| Qwen2.5 1.5B Instruct | `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | 1629.75 MB |
| SmolLM2 360M Instruct | `SmolLM2-360M-Instruct-q4f32_1-MLC` | 579.61 MB |

These are registry memory estimates, **not download sizes or a promise that a device can run the model**. Weights, tokenizer files and compiled WebGPU runtime artifacts are fetched from the configured MLC model hosts, including Hugging Face and MLC's library host. Initial downloads can be large and slow; available GPU memory, shader support, browser limits and cache space matter. See the [official model configuration](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts).

The browser must expose WebGPU in a secure context (normally HTTPS or localhost). Feature detection is preliminary; initialization can still fail because no suitable adapter exists or memory is insufficient. Failure leaves the state inspector available. A worker avoids placing inference directly on the interface thread, although GPU contention can still affect animation. The implementation follows the [official worker API](https://webllm.mlc.ai/docs/user/advanced_usage.html#using-workers).

Questions and simulation snapshots are passed to the local worker, not a remote inference API. Initial artifact requests disclose ordinary connection metadata to their hosts. The site does not add server-side chat storage. Conversation and experiment persistence are controlled by the application's explicit export/import features. WebLLM may cache downloaded model artifacts in browser storage. **Unload** terminates the worker and releases the active model; it does not promise to delete cached artifacts. Browser site-data controls can remove those caches.

## Scientific boundaries

The brain population equations, point-neuron circuit, symbolic workspace and language model have separate state representations and time scales. The context includes a frozen snapshot of clocks, current activity, focus, memory, metrics and active exposures. Sensory input is disabled in this experiment; direct typed messages are a symbolic input channel, not a simulation of vision, hearing or biological language decoding.

The words *attention*, *retention*, *flexibility* and *inhibition* name heuristic workspace parameters. They are not validated clinical measurements. The local language sampler uses:

```text
temperature = 0.2 + 0.6 × flexibility
```

Flexibility is clipped to [0,1]. When it is absent, temperature defaults to 0.35. This is an explicit interface rule for exploring a hypothesis; it is **not a neuronal equation or a validated mapping from a drug to a thought**. Sampling uses `top_p = 0.9` and limits each response to 384 new tokens. Changing temperature changes the local model's sampling distribution, not its underlying learned knowledge. A higher value does not measure creativity, intelligence, mood or impairment.

The system instruction asks for an answer and, when relevant, a brief explanation of observable supplied mechanisms. It explicitly distinguishes simulation measurements, assumptions, missing data and general knowledge. It does not request private chain-of-thought or expose a hidden reasoning transcript. Stored user statements remain user statements, not verified facts. Qualitative cofactor exposures retain unknown acute cognitive effects.

A prompt instruction is not a scientific validation method or a guarantee that a small language model will obey it. Local model output can be inaccurate, omit caveats or invent details. The underlying visible state and cited model documentation remain the reference for the experiment. Generated descriptions cannot predict human perception, drug experiences, consciousness, clinical outcomes or individual treatment response.

## Integration contract

`src/dialogue.js` exports `DialogueClient`, `DEFAULT_MODEL` and `MODEL_OPTIONS`. Construction accepts `onProgress`, `onStatus` and an optional `engineFactory` for tests. Neither construction nor state inspection initializes a model.

```js
const client = new DialogueClient({ onProgress, onStatus });
await client.load(DEFAULT_MODEL); // Only after the explicit user action.
const response = await client.respond({
  question,
  context,
  history,
  signal,
  onToken: (delta, accumulatedText) => updateAnswer(accumulatedText),
});
```

`respond()` returns `{text, mode, modelId?, contextSummary, contextSnapshot, error?}`. `mode` is `local-llm` or `state-inspector`. The provenance summary is a readable string. The compact snapshot contains clocks, metrics, focus, exposure definitions and the explicit language-sampling rule; it does not contain a hidden thought process or a full prompt transcript. Ordinary history accepts only user/assistant messages; arbitrary injected system-role history is excluded. The current question is preserved up to 3,000 characters. Older history and snapshots share a 7,200-character prompt budget; the response summary discloses shortening. This is a character budget, not a tokenizer guarantee. An engine context-limit error produces a disclosed state-inspector fallback and suggests a shorter question or history.

Status values are `idle`, `loading`, `ready`, `generating`, `unavailable` and `error`. The `available` getter reports preliminary browser capability. `canRespond` is false during loading, generation, unloading and cancellation cleanup; `waitUntilReady()` resolves after those operations settle. UI submission stays disabled until then. `onStatus` receives `{status,message,modelId}`; `onProgress` receives `{progress,text}`.

Only one load or generation operation may run at once. Overlapping requests fail with `BusyError`. `cancel()` interrupts generation or terminates an in-progress load, suppresses stale tokens and rejects the active request with `AbortError`. Cancellation cleanup attempts to reset the model cache and falls back to unloading if that cleanup stalls. `unload()` cancels active work and terminates the worker. Each generation resets the engine conversation cache; the explicitly supplied history is the sole conversational history. An empty history therefore cannot accidentally continue an earlier experiment's cached chat.

Local generation errors release the engine and return a grounded state-inspector response with an `error` field. Partially streamed text should be replaced with the returned response, not kept as if generation succeeded. A failed load throws so the interface can show its cause without claiming that a model is ready.

## Verification

`node --test tests/dialogue.test.js` checks deterministic state inspection; sparse/unknown values; genuine workspace memory and event fields; qualitative exposures; lack of implicit downloads; capability detection; streaming deltas; explicit history; sampling-temperature provenance; cancellation; mutex behavior; late-load cleanup; unloading during generation; generation failure rollback; and the exact installed prebuilt model IDs.

These tests use an injected mock inference engine for lifecycle and streaming behavior. They do **not** establish successful GPU inference, response quality, or neuroscience validity. Real-model loading and generation require a separate browser check on a suitable device; successful unit tests alone must not be reported as such a check.

### Device check, October 13, 2026

In the Codex in-app browser on the development machine, the SmolLM2 360M option loaded through the actual WebGPU worker, generated a streamed answer, recorded its captured clocks/metrics/sampling provenance, and unloaded successfully. No browser warnings or errors were observed during that check. This is one successful device check, not a guarantee for all GPUs or browsers. Qwen2.5 was registry-checked and covered by mocked lifecycle tests but was not downloaded in this verification.
