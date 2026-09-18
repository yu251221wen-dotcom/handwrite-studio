import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const target = join(root, "public", "ocr");

const assets = [
  [join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"), "worker.min.js"],
  [join(root, "node_modules", ".pnpm", "tesseract.js-core@7.0.0", "node_modules", "tesseract.js-core", "tesseract-core-lstm.wasm.js"), "tesseract-core-lstm.wasm.js"],
  [join(root, "node_modules", "@tesseract.js-data", "chi_sim", "4.0.0_best_int", "chi_sim.traineddata.gz"), "chi_sim.traineddata.gz"],
  [join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"), "pdf.worker.min.mjs"],
];

mkdirSync(target, { recursive: true });
for (const [source, name] of assets) {
  if (!existsSync(source)) throw new Error(`OCR asset missing: ${source}`);
  const destination = join(target, name);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

