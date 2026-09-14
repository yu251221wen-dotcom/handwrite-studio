import type { BackgroundAsset, BackgroundAdjustments, BackgroundTransform } from "./types.ts";
import { createSeededRandom } from "./seeded-random.ts";

export const DEFAULT_BACKGROUND_ADJUSTMENTS: BackgroundAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  noise: 0,
  rotation: 0,
};

export const BACKGROUND_PRESETS: BackgroundAsset[] = [
  { id: "white-clean", name: "纯白 A4", kind: "preset", enabled: true, baseColor: "#ffffff", pattern: "solid" },
  { id: "white-soft", name: "柔白纸", kind: "preset", enabled: true, baseColor: "#fdfdfb", pattern: "solid", texture: 0.08 },
  { id: "warm-white", name: "暖白纸", kind: "preset", enabled: true, baseColor: "#fffdf6", pattern: "solid", texture: 0.1 },
  { id: "cream", name: "奶油纸", kind: "preset", enabled: true, baseColor: "#fff8e8", pattern: "solid", texture: 0.14 },
  { id: "pale-yellow", name: "微黄旧纸", kind: "preset", enabled: true, baseColor: "#fbf3da", pattern: "solid", texture: 0.24, vignette: 0.08 },
  { id: "ivory", name: "象牙白", kind: "preset", enabled: true, baseColor: "#fdf8e9", pattern: "solid", unevenLight: 0.08 },
  { id: "ruled-blue-40", name: "淡蓝横线 40", kind: "preset", enabled: true, baseColor: "#fffef9", pattern: "ruled", lineColor: "#b9d7e4", spacing: 40 },
  { id: "ruled-blue-48", name: "淡蓝横线 48", kind: "preset", enabled: true, baseColor: "#fffefb", pattern: "ruled", lineColor: "#b4d3df", spacing: 48 },
  { id: "ruled-blue-56", name: "淡蓝横线 56", kind: "preset", enabled: true, baseColor: "#fffef8", pattern: "ruled", lineColor: "#c1dce8", spacing: 56 },
  { id: "ruled-gray-42", name: "淡灰横线 42", kind: "preset", enabled: true, baseColor: "#ffffff", pattern: "ruled", lineColor: "#d6d9dc", spacing: 42 },
  { id: "ruled-gray-50", name: "淡灰横线 50", kind: "preset", enabled: true, baseColor: "#fdfdfc", pattern: "ruled", lineColor: "#cfd3d6", spacing: 50 },
  { id: "ruled-warm-46", name: "暖灰横线", kind: "preset", enabled: true, baseColor: "#fffaf0", pattern: "ruled", lineColor: "#ded2c2", spacing: 46 },
  { id: "margin-blue", name: "蓝线作业纸", kind: "preset", enabled: true, baseColor: "#fffefa", pattern: "ruled", lineColor: "#b7d5e1", spacing: 48, marginLine: true },
  { id: "margin-gray", name: "灰线笔记纸", kind: "preset", enabled: true, baseColor: "#fcfcfa", pattern: "ruled", lineColor: "#d2d4d4", spacing: 44, marginLine: true },
  { id: "grid-blue-28", name: "淡蓝方格 28", kind: "preset", enabled: true, baseColor: "#fffef9", pattern: "grid", lineColor: "#c7dce5", spacing: 28 },
  { id: "grid-blue-36", name: "淡蓝方格 36", kind: "preset", enabled: true, baseColor: "#ffffff", pattern: "grid", lineColor: "#c2d8e0", spacing: 36 },
  { id: "grid-gray-32", name: "淡灰方格 32", kind: "preset", enabled: true, baseColor: "#fdfdfc", pattern: "grid", lineColor: "#d7d8d5", spacing: 32 },
  { id: "grid-warm-40", name: "暖色方格 40", kind: "preset", enabled: true, baseColor: "#fffaf0", pattern: "grid", lineColor: "#ddd2bf", spacing: 40 },
  { id: "dots-blue-24", name: "蓝色点阵 24", kind: "preset", enabled: true, baseColor: "#ffffff", pattern: "dots", lineColor: "#bdd3df", spacing: 24 },
  { id: "dots-gray-28", name: "灰色点阵 28", kind: "preset", enabled: true, baseColor: "#fdfdfb", pattern: "dots", lineColor: "#cfd2d3", spacing: 28 },
  { id: "dots-warm-30", name: "暖色点阵 30", kind: "preset", enabled: true, baseColor: "#fffaf0", pattern: "dots", lineColor: "#d8cdbc", spacing: 30 },
  { id: "ledger-blue", name: "淡蓝表格纸", kind: "preset", enabled: true, baseColor: "#fbfeff", pattern: "ledger", lineColor: "#bed7df", spacing: 46 },
  { id: "ledger-gray", name: "淡灰表格纸", kind: "preset", enabled: true, baseColor: "#fefefe", pattern: "ledger", lineColor: "#d1d5d7", spacing: 42 },
  { id: "texture-fine", name: "细纸纹", kind: "preset", enabled: true, baseColor: "#fffdf8", pattern: "solid", texture: 0.22 },
  { id: "texture-fiber", name: "纤维纸纹", kind: "preset", enabled: true, baseColor: "#fcf7e9", pattern: "solid", texture: 0.38 },
  { id: "scan-light", name: "轻微扫描噪声", kind: "preset", enabled: true, baseColor: "#fafafa", pattern: "solid", texture: 0.42, vignette: 0.06 },
  { id: "scan-gray", name: "灰度扫描纸", kind: "preset", enabled: true, baseColor: "#f4f4f1", pattern: "solid", texture: 0.34, unevenLight: 0.08 },
  { id: "shadow-corner", name: "右下轻阴影", kind: "preset", enabled: true, baseColor: "#fffefb", pattern: "solid", shadow: 0.16 },
  { id: "vignette-soft", name: "边缘轻暗纸", kind: "preset", enabled: true, baseColor: "#fffdf7", pattern: "solid", vignette: 0.18 },
  { id: "uneven-light", name: "轻微亮度不均", kind: "preset", enabled: true, baseColor: "#fffdf9", pattern: "solid", unevenLight: 0.2, texture: 0.12 },
];

function drawPreset(context: CanvasRenderingContext2D, asset: BackgroundAsset, width: number, height: number, seed: string) {
  context.fillStyle = asset.baseColor;
  context.fillRect(0, 0, width, height);
  const spacing = asset.spacing ?? 48;
  context.strokeStyle = asset.lineColor ?? "#d7dadd";
  context.fillStyle = asset.lineColor ?? "#d7dadd";
  context.lineWidth = 0.65;
  if (asset.pattern === "ruled" || asset.pattern === "grid" || asset.pattern === "ledger") {
    for (let y = spacing; y < height; y += spacing) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  }
  if (asset.pattern === "grid") {
    for (let x = spacing; x < width; x += spacing) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  }
  if (asset.pattern === "ledger") {
    for (let x = width / 4; x < width; x += width / 4) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  }
  if (asset.pattern === "dots") {
    for (let y = spacing; y < height; y += spacing) for (let x = spacing; x < width; x += spacing) { context.beginPath(); context.arc(x, y, 0.8, 0, Math.PI * 2); context.fill(); }
  }
  if (asset.marginLine) {
    context.strokeStyle = "rgba(204,87,76,.42)";
    context.beginPath(); context.moveTo(58, 0); context.lineTo(58, height); context.stroke();
  }
  if (asset.texture) {
    const random = createSeededRandom(`${asset.id}:${seed}`);
    context.fillStyle = `rgba(72,61,42,${0.025 * asset.texture})`;
    const count = Math.round(width * height * asset.texture / 260);
    for (let index = 0; index < count; index += 1) context.fillRect(random.next() * width, random.next() * height, 0.6 + random.next(), 0.6 + random.next());
  }
  if (asset.unevenLight) {
    const gradient = context.createRadialGradient(width * 0.22, height * 0.12, 0, width * 0.35, height * 0.3, width * 0.9);
    gradient.addColorStop(0, `rgba(255,255,255,${asset.unevenLight})`); gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  }
  if (asset.vignette) {
    const gradient = context.createRadialGradient(width / 2, height / 2, width * 0.3, width / 2, height / 2, width * 0.78);
    gradient.addColorStop(0, "rgba(54,43,31,0)"); gradient.addColorStop(1, `rgba(54,43,31,${asset.vignette})`);
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  }
  if (asset.shadow) {
    const gradient = context.createLinearGradient(width * 0.68, height * 0.62, width, height);
    gradient.addColorStop(0, "rgba(36,45,50,0)"); gradient.addColorStop(1, `rgba(36,45,50,${asset.shadow})`);
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  }
}

function imageSize(image: CanvasImageSource) {
  const candidate = image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  return { width: candidate.naturalWidth || candidate.width || 1, height: candidate.naturalHeight || candidate.height || 1 };
}

export function renderBackground(context: CanvasRenderingContext2D, asset: BackgroundAsset, adjustments: BackgroundAdjustments, width: number, height: number, seed: string, image?: CanvasImageSource, transform: BackgroundTransform = { fitMode: "cover", scale: 1, offsetX: 0, offsetY: 0 }) {
  const buffer = document.createElement("canvas");
  buffer.width = width; buffer.height = height;
  const bufferContext = buffer.getContext("2d");
  if (!bufferContext) return;
  if (asset.kind === "uploaded" && image) {
    const source = imageSize(image);
    const fit = transform.fitMode === "stretch" ? { x: width, y: height }
      : transform.fitMode === "fit"
        ? { x: Math.min(width / source.width, height / source.height), y: Math.min(width / source.width, height / source.height) }
        : { x: Math.max(width / source.width, height / source.height), y: Math.max(width / source.width, height / source.height) };
    const drawnWidth = transform.fitMode === "stretch" ? fit.x * transform.scale : source.width * fit.x * transform.scale;
    const drawnHeight = transform.fitMode === "stretch" ? fit.y * transform.scale : source.height * fit.y * transform.scale;
    bufferContext.fillStyle = asset.baseColor || "#fff"; bufferContext.fillRect(0, 0, width, height);
    bufferContext.drawImage(image, (width - drawnWidth) / 2 + transform.offsetX, (height - drawnHeight) / 2 + transform.offsetY, drawnWidth, drawnHeight);
  }
  else drawPreset(bufferContext, asset, width, height, seed);

  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(adjustments.rotation * Math.PI / 180);
  context.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) blur(${adjustments.blur}px)`;
  const scale = 1 + Math.abs(adjustments.rotation) / 90;
  context.drawImage(buffer, -width * scale / 2, -height * scale / 2, width * scale, height * scale);
  context.restore();
  if (adjustments.noise > 0) {
    const random = createSeededRandom(`${asset.id}:${seed}:noise:${adjustments.noise}`);
    context.fillStyle = `rgba(36,45,50,${Math.min(0.06, adjustments.noise / 1800)})`;
    const count = Math.round(width * height * adjustments.noise / 1800);
    for (let index = 0; index < count; index += 1) context.fillRect(random.next() * width, random.next() * height, 1, 1);
  }
}
