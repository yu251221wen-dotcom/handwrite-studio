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

export async function loadUploadedFont(asset: FontAsset): Promise<void> {
  if (asset.kind !== "uploaded" || !asset.fileUrl || typeof FontFace === "undefined") return;
  const face = new FontFace(asset.family, `url(${asset.fileUrl})`);
  await face.load();
  document.fonts.add(face);
}
