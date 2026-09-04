# Vendored text recognition

The photo capture feature reads tickets with [Tesseract.js](https://github.com/naptha/tesseract.js).
Everything it needs is committed here so the app works with **no CDN and no network
access** — which matters on a locked-down corporate network, and means no photograph
ever leaves the device.

| Path | Package | Version | Licence |
|---|---|---|---|
| `tesseract.min.js`, `worker.min.js` | `tesseract.js` | 5.1.1 | Apache-2.0 |
| `core/tesseract-core-simd-lstm.wasm.js`, `core/tesseract-core-lstm.wasm.js` | `tesseract.js-core` | 5.1.1 | Apache-2.0 |
| `lang/eng.traineddata.gz` | `@tesseract.js-data/eng` (4.0.0_best_int) | 1.0.0 | Apache-2.0 |

Both core builds are shipped: browsers with WebAssembly SIMD (anything current) take
the `simd` build, older ones fall back to the plain LSTM build.

## Refreshing

```sh
npm pack tesseract.js@5 tesseract.js-core@5 @tesseract.js-data/eng@1
```

then copy `dist/tesseract.min.js`, `dist/worker.min.js`, the two `*-lstm.wasm.js`
core builds and `4.0.0_best_int/eng.traineddata.gz` into place.
