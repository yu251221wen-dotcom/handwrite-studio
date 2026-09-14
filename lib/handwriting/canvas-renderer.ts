import { renderBackground } from "./background-library.ts";
import { generateCharacterStates } from "./randomization.ts";
import { lineX, lineY, type BackgroundAsset, type FontAsset, type HandwritingStyle, type LineLayout, type PageState } from "./types.ts";

export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;
export const A4_PIXELS = { 150: { width: 1240, height: 1754 }, 300: { width: 2480, height: 3508 }, 600: { width: 4961, height: 7016 } } as const;
export interface LineBounds { id: string; x: number; y: number; width: number; height: number }

export interface RenderOptions {
  page: PageState;
  pageCount: number;
  font: FontAsset;
  fonts?: FontAsset[];
  background: BackgroundAsset;
  handwriting: HandwritingStyle;
  seed: string;
  documentId: string;
  patientFields?: Record<string, string>;
  fieldTextById?: Record<string, string>;
  selectedLineId?: string;
  backgroundImage?: CanvasImageSource;
  showSelection?: boolean;
}

const stateCache = new Map<string, ReturnType<typeof generateCharacterStates>>();

export function characterStateKey(line: LineLayout, options: RenderOptions) {
  const config = options.handwriting.randomization;
  const lineFont = options.fonts?.find((font) => font.id === line.fontId) ?? options.font;
  return [options.documentId, line.fieldId, options.seed, lineFont.id, options.handwriting.naturality,
    config.characterOffsetX, config.characterOffsetY, config.characterRotation, config.characterScaleX, config.characterScaleY,
    config.characterFontSizeVariation, config.characterBaselineOffset, config.characterOpacityVariation, config.correlation].join("|");
}

function cachedStates(line: LineLayout, options: RenderOptions) {
  const key = characterStateKey(line, options);
  const fieldText = options.fieldTextById?.[line.fieldId] ?? line.text;
  const cacheKey = `${key}|${fieldText}`;
  let all = stateCache.get(cacheKey);
  if (!all) {
    all = generateCharacterStates(fieldText, key, options.handwriting.randomization, options.handwriting.naturality);
    stateCache.set(cacheKey, all);
    if (stateCache.size > 128) stateCache.delete(stateCache.keys().next().value as string);
  }
  const characters = Array.from(line.text);
  const indices = line.sourceCharacterIndices;
  if (indices && indices.length !== characters.length) throw new Error(`行 ${line.id} 的字迹索引不完整，已停止绘制`);
  const sourceCharacters = Array.from(fieldText);
  return characters.map((character, index) => {
    const sourceIndex = indices?.[index] ?? (options.fieldTextById?.[line.fieldId] !== undefined ? line.startIndex : 0) + index;
    // A tab/space inserted by layout must not consume an original character's state.
    if (indices && sourceIndex === -1 && /\s/u.test(character)) {
      return { index, character, offsetX: 0, offsetY: 0, rotation: 0, scaleX: 1, scaleY: 1,
        fontSizeScale: 1, baselineOffset: 0, opacity: 1 };
    }
    const state = all[sourceIndex];
    if (!state || (indices && sourceCharacters[sourceIndex] !== character)) {
      throw new Error(`行 ${line.id} 的字迹状态缺失或与原文不符，已停止绘制`);
    }
    return { ...state, index, character };
  });
}

function renderHeader(context: CanvasRenderingContext2D, options: RenderOptions) {
  if ((options.page.pageTemplateId ?? options.page.templateId) === "no-template-a4" || options.page.pageTemplateId === null) return;
  const firstPage = options.page.pageIndex === 0;
  context.fillStyle = "#2b7d84"; context.fillRect(0, 0, 7, PAGE_HEIGHT);
  context.textAlign = "center"; context.fillStyle = "rgba(72,91,102,.6)";
  context.font = "11px 'Microsoft YaHei UI', sans-serif"; context.fillText("中医住院病历", PAGE_WIDTH / 2, 68);
  context.fillStyle = "#27343b"; context.font = "600 24px serif";
  context.fillText(firstPage ? "住 院 病 历" : "住 院 病 历（续页）", PAGE_WIDTH / 2, 106);
  context.strokeStyle = "rgba(92,107,114,.28)"; context.beginPath(); context.moveTo(58, 135); context.lineTo(547, 135); context.stroke();
  if (!firstPage) return;
  context.beginPath(); context.moveTo(58, 236); context.lineTo(547, 236); context.stroke();
  context.textAlign = "left"; context.font = "12px 'Microsoft YaHei UI', sans-serif"; context.fillStyle = "rgba(53,66,74,.8)";
  const values = options.patientFields ?? {};
  const facts = [
    ["姓名", values.name ?? "", 58, 160], ["病案号", values.medical_record_number ?? "", 320, 160],
    ["性别", values.sex ?? "", 58, 190], ["年龄", values.age ?? "", 320, 190],
    ["职业", values.occupation ?? "", 58, 220], ["入院时间", values.admission_time ?? "", 320, 220],
  ] as const;
  for (const [label, value, x, y] of facts) {
    context.fillText(label, x, y);
    context.save(); context.font = `13px ${options.font.family}`; context.fillStyle = options.handwriting.inkColor;
    context.fillText(value, x + 52, y); context.restore();
  }
}

export function renderPageBackground(context: CanvasRenderingContext2D, options: RenderOptions) {
  context.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  renderBackground(context, options.background, options.page.backgroundAdjustments, PAGE_WIDTH, PAGE_HEIGHT,
    `paper:${options.page.pageId}`, options.backgroundImage, options.page.backgroundTransform);
  renderHeader(context, options);
}

export function renderTextLayer(context: CanvasRenderingContext2D, options: RenderOptions, clear = true): LineBounds[] {
  if (clear) context.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.textBaseline = "alphabetic";
  const bounds: LineBounds[] = [];
  for (const line of options.page.lines) {
    const states = cachedStates(line, options);
    const lineFont = options.fonts?.find((font) => font.id === line.fontId) ?? options.font;
    let cursor = 0; let columnIndex = 0; const x = lineX(line); const y = lineY(line);
    context.save(); context.translate(x, y); context.rotate(line.rotation * Math.PI / 180);
    if (line.visualKind === "table" && line.columnWidths?.length) {
      context.save(); context.strokeStyle = "rgba(73,91,101,.28)"; context.lineWidth = 0.75;
      let edge = 0; const top = -line.fontSize - 8; const height = line.lineHeight;
      for (const width of line.columnWidths) { context.strokeRect(edge, top, width, height); edge += width; }
      context.restore();
    }
    for (const state of states) {
      if (state.character === "\t" && line.columnWidths?.length) {
        cursor = line.columnWidths.slice(0, Math.min(++columnIndex, line.columnWidths.length)).reduce((sum, width) => sum + width, 0) + 8;
        continue;
      }
      const size = line.fontSize * state.fontSizeScale;
      context.font = `${size}px ${lineFont.family}`;
      const measured = context.measureText(state.character).width;
      context.save(); context.translate(cursor + state.offsetX, state.offsetY + state.baselineOffset);
      context.rotate(state.rotation * Math.PI / 180); context.scale(state.scaleX, state.scaleY);
      context.globalAlpha = state.opacity; context.fillStyle = options.handwriting.inkColor; context.fillText(state.character, 0, 0);
      context.restore(); cursor += measured + line.letterSpacing;
    }
    context.restore();
    const structuredWidth = line.columnWidths?.reduce((sum, width) => sum + width, 0) ?? 0;
    const box = { id: line.id, x: x - 5, y: y - line.fontSize - 8, width: Math.max(36, structuredWidth || cursor + 10), height: Math.max(line.fontSize + 18, line.lineHeight) };
    bounds.push(box);
    if (options.showSelection && line.id === options.selectedLineId) {
      context.save(); context.strokeStyle = "rgba(40,126,134,.72)"; context.fillStyle = "rgba(230,247,246,.45)"; context.lineWidth = 1;
      context.fillRect(box.x, box.y, box.width, box.height); context.strokeRect(box.x, box.y, box.width, box.height);
      context.fillStyle = "#fff"; context.strokeStyle = "#287e86";
      for (const handleX of [box.x, box.x + box.width]) { context.beginPath(); context.rect(handleX - 3, box.y + box.height / 2 - 3, 6, 6); context.fill(); context.stroke(); }
      context.restore();
    }
  }
  context.fillStyle = "rgba(87,101,108,.52)"; context.font = "11px 'Microsoft YaHei UI', sans-serif";
  context.fillText(`第 ${options.page.pageIndex + 1} 页 / 共 ${options.pageCount} 页`, 58, 790);
  if ((options.page.pageTemplateId ?? options.page.templateId) !== "no-template-a4" && options.page.pageTemplateId !== null) context.fillText("实习医师（签名）", 430, 790);
  return bounds;
}

export function renderCompositeCanvas(canvas: HTMLCanvasElement, options: RenderOptions, widthPx: number, heightPx: number) {
  canvas.width = widthPx; canvas.height = heightPx;
  const context = canvas.getContext("2d"); if (!context) return;
  context.setTransform(widthPx / PAGE_WIDTH, 0, 0, heightPx / PAGE_HEIGHT, 0, 0);
  renderPageBackground(context, options); renderTextLayer(context, { ...options, showSelection: false }, false);
}
