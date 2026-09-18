import type { DocumentBlock, DocumentBlockType } from "../handwriting/types.ts";

export interface OcrDraftLine {
  id: string; pageIndex: number; text: string; confidence: number; suggestedType: DocumentBlockType;
}

export interface OcrDraft {
  fileName: string; mediaType: string; text: string; confidence: number; lines: OcrDraftLine[];
}

export interface OcrProgress {
  stage: "loading" | "rendering" | "recognizing" | "complete";
  page: number; totalPages: number; progress: number; message: string;
}

const HEADING_WORDS = new Set([
  "入院记录", "体格检查", "专科检查", "辅助检查", "拟诊讨论", "初步诊断", "诊疗计划",
  "中医望闻切诊", "中医辨病辨证依据", "中医鉴别诊断", "西医诊断依据", "西医鉴别诊断", "中药处方", "中医外治",
]);

function normalizedLine(value: string): string {
  return value.replace(/[\u00a0\u2000-\u200b]/gu, " ").replace(/[ \t]+/gu, " ").trim();
}

export function suggestOcrBlockType(text: string): DocumentBlockType {
  const compact = text.replace(/\s+/gu, "").replace(/[：:]$/u, "");
  if (HEADING_WORDS.has(compact) || (compact.length <= 16 && /(?:记录|检查|诊断|计划|处方|讨论)$/u.test(compact))) return "heading";
  if (/^(?:[（(]?\d+[）).、]|[一二三四五六七八九十]+[、.])\s*/u.test(text)) return "list";
  if (/^[^：:\n]{1,12}[：:]\s*\S+/u.test(text)) return "key-value";
  return "paragraph";
}

export function createOcrDraft(fileName: string, mediaType: string, pages: Array<{ text: string; confidence: number }>): OcrDraft {
  const lines: OcrDraftLine[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    for (const raw of pages[pageIndex].text.split(/\r?\n/u)) {
      const text = normalizedLine(raw);
      if (!text) continue;
      lines.push({ id: `ocr-${pageIndex + 1}-${lines.length + 1}`, pageIndex, text,
        confidence: pages[pageIndex].confidence, suggestedType: suggestOcrBlockType(text) });
    }
  }
  const text = lines.map((line) => line.text).join("\n");
  const confidence = pages.length ? pages.reduce((sum, page) => sum + page.confidence, 0) / pages.length : 0;
  return { fileName, mediaType, text, confidence, lines };
}

function stableBlockId(order: number, text: string) {
  let hash = 2166136261;
  for (const character of text) { hash ^= character.codePointAt(0) ?? 0; hash = Math.imul(hash, 16777619); }
  return `ocr-${order.toString().padStart(4, "0")}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function ocrTextToDocumentBlocks(value: string): DocumentBlock[] {
  const lines = value.split(/\r?\n/u).map(normalizedLine).filter(Boolean);
  let cursor = 0;
  return lines.map((sourceText, sourceOrder): DocumentBlock => {
    const blockId = stableBlockId(sourceOrder, sourceText);
    const sourceStart = cursor; const sourceEnd = cursor + Array.from(sourceText).length; cursor = sourceEnd + 1;
    const base = { blockId, sourceOrder, sourceStart, sourceEnd, sourceText };
    const kind = suggestOcrBlockType(sourceText);
    if (kind === "heading") return { ...base, type: "heading", text: sourceText, level: 2, alignment: "left",
      fontSize: 21, fontWeight: 600, spacingBefore: 10, spacingAfter: 0, minLinesAfterHeading: 1,
      keepWithNext: true, allowSplit: false };
    if (kind === "list") {
      const match = sourceText.match(/^([（(]?\d+[）).、]|[一二三四五六七八九十]+[、.])\s*(.*)$/u);
      return { ...base, type: "list", items: [{ marker: match?.[1] ?? "•", text: match?.[2] ?? sourceText, raw: sourceText }], allowSplit: true };
    }
    if (kind === "key-value") {
      const match = sourceText.match(/^([^：:]{1,12})[：:]\s*(.*)$/u)!;
      return { ...base, type: "key-value", items: [{ key: match[1].trim(), value: match[2].trim(), raw: sourceText }], columns: "auto", allowSplit: true };
    }
    return { ...base, type: "paragraph", content: sourceText, firstLineIndent: 0, lineHeight: 34,
      paragraphSpacing: 0, allowSplit: true };
  });
}

function abortError(): DOMException { return new DOMException("OCR 已取消", "AbortError"); }

async function imageFileToCanvas(file: Blob): Promise<{ canvas: HTMLCanvasElement; release: () => void }> {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 2200; const scale = Math.min(1, maxWidth / Math.max(1, bitmap.width));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d"); if (!context) { bitmap.close(); throw new Error("浏览器无法建立 OCR 画布"); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { canvas, release: () => { bitmap.close(); canvas.width = 1; canvas.height = 1; } };
}

export async function recognizeOcrFile(file: File, onProgress: (progress: OcrProgress) => void, signal?: AbortSignal): Promise<OcrDraft> {
  if (signal?.aborted) throw abortError();
  onProgress({ stage: "loading", page: 0, totalPages: 1, progress: 0, message: "正在加载本地 OCR 引擎" });
  const [{ createWorker }, pdfjs] = await Promise.all([import("tesseract.js"), import("pdfjs-dist")]);
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
  const worker = await createWorker("chi_sim", 1, {
    workerPath: "/ocr/worker.min.js", corePath: "/ocr/tesseract-core-lstm.wasm.js", langPath: "/ocr",
    logger: (message) => onProgress({ stage: "recognizing", page: 0, totalPages: 1,
      progress: Math.round(message.progress * 100), message: `OCR：${message.status}` }),
  });
  const abort = () => { void worker.terminate(); };
  signal?.addEventListener("abort", abort, { once: true });
  const pages: Array<{ text: string; confidence: number }> = [];
  try {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const pdf = await loadingTask.promise;
      try {
        for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
          if (signal?.aborted) throw abortError();
          onProgress({ stage: "rendering", page: pageIndex + 1, totalPages: pdf.numPages,
            progress: Math.round(pageIndex / pdf.numPages * 100), message: `正在渲染 PDF ${pageIndex + 1} / ${pdf.numPages} 页` });
          const page = await pdf.getPage(pageIndex + 1); const viewport = page.getViewport({ scale: 2.2 });
          const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          try {
            const context = canvas.getContext("2d"); if (!context) throw new Error("浏览器无法渲染扫描 PDF");
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
            pages.push({ text: result.data.text, confidence: result.data.confidence });
            onProgress({ stage: "recognizing", page: pageIndex + 1, totalPages: pdf.numPages,
              progress: Math.round((pageIndex + 1) / pdf.numPages * 100), message: `已识别 ${pageIndex + 1} / ${pdf.numPages} 页` });
          } finally { canvas.width = 1; canvas.height = 1; page.cleanup(); }
        }
      } finally { await pdf.cleanup(); await loadingTask.destroy(); }
    } else {
      const image = await imageFileToCanvas(file);
      try {
        const result = await worker.recognize(image.canvas, {}, { text: true, blocks: true });
        pages.push({ text: result.data.text, confidence: result.data.confidence });
      } finally { image.release(); }
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    await worker.terminate().catch(() => undefined);
  }
  if (signal?.aborted) throw abortError();
  onProgress({ stage: "complete", page: pages.length, totalPages: pages.length, progress: 100, message: "OCR 完成，请校对后确认导入" });
  return createOcrDraft(file.name, file.type, pages);
}
