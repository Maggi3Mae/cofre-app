// Copia a static/ocr lo que el OCR necesita para funcionar sin internet:
// el worker de tesseract.js, los núcleos WebAssembly y el modelo de español;
// y a static/zxing el lector de QR (zxing-wasm), que si no se bajaría de un CDN.
// Se ejecuta solo antes de `npm run dev` y `npm run build` (static/ocr y static/zxing no van al repo).
import { cpSync, mkdirSync, existsSync } from "node:fs";

const destino = "static/ocr";
mkdirSync(destino, { recursive: true });
const archivos = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz", "spa.traineddata.gz"],
];
for (const [de, a] of archivos) {
  if (!existsSync(de)) throw new Error(`Falta ${de}: corre «npm install».`);
  cpSync(de, `${destino}/${a}`);
}
mkdirSync("static/zxing", { recursive: true });
const zxing = "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm";
if (!existsSync(zxing)) throw new Error(`Falta ${zxing}: corre «npm install».`);
cpSync(zxing, "static/zxing/zxing_reader.wasm");
console.log("OCR listo en static/ocr y lector de QR en static/zxing");
