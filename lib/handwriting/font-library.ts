import type { FontAsset } from "./types.ts";

const systemFonts: FontAsset[] = [
  { id: "system-kaiti", name: "系统楷体", previewName: "清晰楷写", family: "KaiTi, Kaiti SC, serif", kind: "system", enabled: true, slot: 1, license: "系统字体引用，不随应用分发" },
  { id: "system-xingkai", name: "系统行楷", previewName: "自然行楷", family: "STXingkai, KaiTi, serif", kind: "system", enabled: true, slot: 2, license: "系统字体引用，不随应用分发" },
  { id: "system-fangsong", name: "系统仿宋", previewName: "工整仿宋", family: "FangSong, STFangsong, serif", kind: "system", enabled: true, slot: 3, license: "系统字体引用，不随应用分发" },
  { id: "system-serif", name: "系统书写体", previewName: "本机书写备用", family: "cursive, KaiTi, serif", kind: "system", enabled: true, slot: 4, license: "系统字体引用，不随应用分发" },
];

const emptySlots: FontAsset[] = Array.from({ length: 26 }, (_, index) => ({
  id: `custom-slot-${String(index + 5).padStart(2, "0")}`,
  name: `自定义字体位 ${String(index + 5).padStart(2, "0")}`,
  previewName: "等待上传 TTF 或 OTF",
  family: "KaiTi, serif",
  kind: "slot" as const,
  enabled: false,
  slot: index + 5,
}));

export const FONT_SLOTS: FontAsset[] = [...systemFonts, ...emptySlots];

export const FONT_PREVIEW_LINES = ["春风又绿江南岸", "患者因腹痛三天入院"];

const fontLoads = new Map<string, Promise<void>>();
const loadedFonts = new Set<string>();
const fontBatchLoads = new Map<string, Promise<void>>();

function fontKey(asset: FontAsset): string {
  return `${asset.id}|${asset.family}|${asset.fileUrl ?? ""}`;
}

export function fontCssFamily(asset: FontAsset): string {
  return asset.kind === "uploaded" ? `"${asset.family.replace(/["\\]/gu, "")}"` : asset.family;
}

function canvasFontFingerprint(family: string): number {
  const canvas = document.createElement("canvas"); canvas.width = 520; canvas.height = 76;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法创建字体验收画布");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111"; context.textBaseline = "alphabetic"; context.font = `36px ${family}`;
  context.fillText(`Aa09 ${FONT_PREVIEW_LINES[0]}`, 4, 48);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 2166136261;
  for (let index = 3; index < pixels.length; index += 16) { hash ^= pixels[index]; hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

export function verifyUploadedFontCanvas(asset: FontAsset): boolean {
  if (asset.kind !== "uploaded" || typeof document === "undefined") return true;
  const custom = canvasFontFingerprint(fontCssFamily(asset));
  return ["serif", "sans-serif", "monospace"].every((fallback) => custom !== canvasFontFingerprint(fallback));
}

export async function loadUploadedFont(asset: FontAsset): Promise<void> {
  if (asset.kind !== "uploaded") return;
  if (!asset.fileUrl) throw new Error(`字体 ${asset.name} 缺少资源地址`);
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts) {
    throw new Error("当前浏览器不支持自定义字体加载");
  }
  const key = fontKey(asset);
  if (loadedFonts.has(key) && document.fonts.check(`20px ${fontCssFamily(asset)}`, FONT_PREVIEW_LINES[1])) return;
  const existing = fontLoads.get(key);
  if (existing) return existing;
  const task = (async () => {
    const format = /\.otf(?:\?|$)/iu.test(asset.fileUrl ?? "") ? "opentype" : "truetype";
    const face = new FontFace(asset.family, `url(${JSON.stringify(asset.fileUrl)}) format("${format}")`, {
      style: "normal", weight: "normal", display: "swap",
    });
    await face.load();
    if (face.status !== "loaded") throw new Error(`字体 ${asset.name} 下载后未进入 loaded 状态`);
    document.fonts.add(face);
    const matched = await document.fonts.load(`20px ${fontCssFamily(asset)}`, FONT_PREVIEW_LINES.join(""));
    await document.fonts.ready;
    if (!matched.length || !document.fonts.check(`20px ${fontCssFamily(asset)}`, FONT_PREVIEW_LINES[1])) {
      document.fonts.delete(face);
      throw new Error(`字体 ${asset.name} 注册失败，已阻止系统字体回退`);
    }
    if (!verifyUploadedFontCanvas(asset)) {
      document.fonts.delete(face);
      throw new Error(`字体 ${asset.name} 已下载，但 Canvas 未能确认使用该字体，已阻止静默回退`);
    }
    loadedFonts.add(key);
  })().catch((error) => {
    fontLoads.delete(key);
    throw error instanceof Error ? error : new Error(`字体 ${asset.name} 加载失败`);
  });
  fontLoads.set(key, task);
  return task;
}

export async function ensureFontsReady(assets: FontAsset[]): Promise<void> {
  const uploaded = [...new Map(assets.filter((asset) => asset.kind === "uploaded").map((asset) => [asset.id, asset])).values()];
  if (!uploaded.length) return;
  const batchKey = uploaded.map(fontKey).sort().join("||");
  const cached = fontBatchLoads.get(batchKey);
  if (cached) return cached;
  const task = (async () => {
    await Promise.all(uploaded.map(loadUploadedFont));
    if (typeof document !== "undefined" && document.fonts) await document.fonts.ready;
  })().catch((error) => {
    fontBatchLoads.delete(batchKey);
    throw error;
  });
  fontBatchLoads.set(batchKey, task);
  return task;
}

export function assertFontReady(asset: FontAsset): void {
  if (asset.kind !== "uploaded" || typeof document === "undefined" || !document.fonts) return;
  if (!loadedFonts.has(fontKey(asset)) || !document.fonts.check(`20px ${fontCssFamily(asset)}`, FONT_PREVIEW_LINES[1])) {
    throw new Error(`字体 ${asset.name} 尚未真正加载，已阻止静默回退`);
  }
}
