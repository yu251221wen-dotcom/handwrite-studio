import { renderBackground } from "./background-library.ts";
import { assertFontReady, fontCssFamily } from "./font-library.ts";
import { generateCharacterStates } from "./randomization.ts";
import { automaticCorrectionMarks, correctionMarksByBlock, normalizeCorrectionStyle } from "./correction-style.ts";
import { generateInkStates, normalizeInkStyle } from "./ink-style.ts";
import { naturalizeRomanGlyph, romanNumeralCharacterIndexes } from "./roman-numerals.ts";
import { normalizeTableLineStyle, resolveTableLines } from "./table-line-style.ts";
import { lineX, lineY, type BackgroundAsset, type CorrectionMark, type CorrectionStyle, type FontAsset, type HandwritingStyle, type InkStyle, type LineLayout, type PageFooterMode, type PageState, type TableLineMode, type TableLineStyle } from "./types.ts";
import { monotonicNow, recordRenderTiming } from "../performance/performance-monitor.ts";

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
  inkStyle?: InkStyle;
  correctionStyle?: CorrectionStyle;
  footerMode?: PageFooterMode;
  tableLineMode?: TableLineMode;
  tableLineStyle?: TableLineStyle;
  seed: string;
  documentId: string;
  patientFields?: Record<string, string>;
  fieldTextById?: Record<string, string>;
  selectedLineId?: string;
  backgroundImage?: CanvasImageSource;
  showSelection?: boolean;
  showLineGuides?: boolean;
  /** True when this context contains text only, so dry-brush cutouts cannot erase paper pixels. */
  isolatedTextLayer?: boolean;
}

const stateCache = new Map<string, ReturnType<typeof generateCharacterStates>>();
const inkStateCache = new Map<string, ReturnType<typeof generateInkStates>>();

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

function cachedInkStates(line: LineLayout, options: RenderOptions) {
  const fieldText = options.fieldTextById?.[line.fieldId] ?? line.text;
  const ink = normalizeInkStyle(options.inkStyle, options.handwriting.inkColor);
  const lineFont = options.fonts?.find((font) => font.id === line.fontId) ?? options.font;
  const stableKey = [options.documentId, line.fieldId, options.seed, lineFont.id, ink.color, ink.variation,
    ink.bleed, ink.dryBrush, ink.brokenInk, ink.darknessTrend].join("|");
  const cacheKey = `${stableKey}|${fieldText}`;
  let all = inkStateCache.get(cacheKey);
  if (!all) {
    all = generateInkStates(Array.from(fieldText).length, stableKey, ink);
    inkStateCache.set(cacheKey, all);
    if (inkStateCache.size > 128) inkStateCache.delete(inkStateCache.keys().next().value as string);
  }
  const characters = Array.from(line.text);
  return characters.map((_, index) => {
    const sourceIndex = line.sourceCharacterIndices?.[index] ?? (options.fieldTextById?.[line.fieldId] !== undefined ? line.startIndex : 0) + index;
    return sourceIndex < 0 ? generateInkStates(1, "layout-space", { ...ink, enabled: false })[0] : all![sourceIndex];
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
    assertFontReady(options.font);
    context.save(); context.font = `13px ${fontCssFamily(options.font)}`; context.fillStyle = normalizeInkStyle(options.inkStyle, options.handwriting.inkColor).color;
    context.fillText(value, x + 52, y); context.restore();
  }
}

interface RenderedGlyph { sourceIndex: number; x: number; width: number; top: number; bottom: number }

function correctionMarksForLine(line: LineLayout, options: RenderOptions): CorrectionMark[] {
  const style = normalizeCorrectionStyle(options.correctionStyle);
  if (!style.enabled) return [];
  const blockId = line.blockId ?? line.fieldId;
  const source = options.fieldTextById?.[line.fieldId] ?? line.text;
  return [...(correctionMarksByBlock(style).get(blockId) ?? []), ...automaticCorrectionMarks(line, source, style, options.seed, options.documentId)];
}

function renderCorrections(context: CanvasRenderingContext2D, line: LineLayout, glyphs: RenderedGlyph[], options: RenderOptions, fontFamily: string) {
  const marks = correctionMarksForLine(line, options);
  if (!marks.length) return;
  const ink = normalizeInkStyle(options.inkStyle, options.handwriting.inkColor);
  context.save(); context.strokeStyle = ink.color; context.fillStyle = ink.color; context.lineWidth = Math.max(0.75, line.fontSize * 0.055);
  for (const mark of marks) {
    const covered = glyphs.filter((glyph) => glyph.sourceIndex >= mark.sourceStart && glyph.sourceIndex < mark.sourceEnd);
    if (!covered.length) continue;
    const left = Math.min(...covered.map((glyph) => glyph.x));
    const right = Math.max(...covered.map((glyph) => glyph.x + glyph.width));
    const mid = -line.fontSize * 0.34;
    const strike = (offset = 0) => { context.beginPath(); context.moveTo(left - 1, mid + offset); context.lineTo(right + 1, mid + offset); context.stroke(); };
    if (mark.type === "single-strike") strike();
    else if (mark.type === "double-strike") { strike(-1.6); strike(1.6); }
    else if (mark.type === "diagonal") { context.beginPath(); context.moveTo(left, 1); context.lineTo(right, -line.fontSize * 0.9); context.stroke(); }
    else if (mark.type === "scribble") {
      const steps = Math.max(4, Math.ceil((right - left) / 7)); context.beginPath(); context.moveTo(left, mid);
      for (let index = 1; index <= steps; index += 1) context.lineTo(left + (right - left) * index / steps, mid + (index % 2 ? -3 : 3));
      context.stroke();
    } else if (mark.type === "caret") {
      const at = right + 1; context.beginPath(); context.moveTo(at - 4, 4); context.lineTo(at, -3); context.lineTo(at + 4, 4); context.stroke();
    } else strike();
    if (mark.replacementText) {
      context.save(); context.font = `${Math.max(10, line.fontSize * 0.72)}px ${fontFamily}`;
      const rewriteX = mark.type === "rewrite-side" ? right + 7 : left;
      context.fillText(mark.replacementText, rewriteX, mark.type === "rewrite-side" ? 0 : -line.fontSize - 4);
      context.restore();
    }
  }
  context.restore();
}

function shouldRenderGeneratedFooter(options: RenderOptions) {
  const mode = options.footerMode ?? "auto";
  if (mode === "hidden" || mode === "native") return false;
  if (mode === "generated") return true;
  return !(options.page.backgroundHasNativePageFooter ?? options.background.hasNativePageFooter);
}

export function renderPageBackground(context: CanvasRenderingContext2D, options: RenderOptions) {
  const started = monotonicNow();
  context.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  renderBackground(context, options.background, options.page.backgroundAdjustments, PAGE_WIDTH, PAGE_HEIGHT,
    `paper:${options.page.pageId}`, options.backgroundImage, options.page.backgroundTransform);
  renderHeader(context, options);
  recordRenderTiming("background", monotonicNow() - started);
}

export function renderOverlayLayer(context: CanvasRenderingContext2D, options: RenderOptions, bounds: LineBounds[], clear = true) {
  const started = monotonicNow();
  if (clear) context.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  const detection = options.page.lineDetection;
  if (options.showLineGuides && detection?.enabled && detection.showLines) {
    context.save();
    context.strokeStyle = "rgba(225,72,94,.72)";
    context.fillStyle = "rgba(225,72,94,.9)";
    context.lineWidth = 0.8;
    context.setLineDash([5, 4]);
    context.font = "9px sans-serif";
    for (const line of detection.lineY) {
      const y = line + detection.offsetY;
      context.beginPath(); context.moveTo(10, y); context.lineTo(PAGE_WIDTH - 10, y); context.stroke();
      context.fillText(Math.round(y).toString(), 12, y - 2);
    }
    context.restore();
  }
  if (options.showSelection && options.selectedLineId) {
    const box = bounds.find((item) => item.id === options.selectedLineId);
    if (box) {
      context.save(); context.strokeStyle = "rgba(40,126,134,.72)"; context.fillStyle = "rgba(230,247,246,.45)"; context.lineWidth = 1;
      context.fillRect(box.x, box.y, box.width, box.height); context.strokeRect(box.x, box.y, box.width, box.height);
      context.fillStyle = "#fff"; context.strokeStyle = "#287e86";
      for (const handleX of [box.x, box.x + box.width]) { context.beginPath(); context.rect(handleX - 3, box.y + box.height / 2 - 3, 6, 6); context.fill(); context.stroke(); }
      context.restore();
    }
  }
  recordRenderTiming("overlay", monotonicNow() - started);
}

export function renderTextLayer(context: CanvasRenderingContext2D, options: RenderOptions, clear = true): LineBounds[] {
  const started = monotonicNow();
  let correctionMs = 0;
  if (clear) context.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.textBaseline = "alphabetic";
  const bounds: LineBounds[] = [];
  for (const line of options.page.lines) {
    const states = cachedStates(line, options);
    const inkStates = cachedInkStates(line, options);
    const ink = normalizeInkStyle(options.inkStyle, options.handwriting.inkColor);
    const matchedFont = options.fonts?.find((font) => font.id === line.fontId);
    if (options.fonts && !matchedFont) throw new Error(`行 ${line.id} 引用的字体 ${line.fontId} 不可用，已阻止系统字体回退`);
    const lineFont = matchedFont ?? options.font;
    assertFontReady(lineFont);
    let cursor = 0; let columnIndex = 0; const x = lineX(line); const y = lineY(line);
    context.save(); context.translate(x, y); context.rotate(line.rotation * Math.PI / 180);
    if (line.visualKind === "table" && line.columnWidths?.length) {
      const tableLines = resolveTableLines(options.tableLineMode, options.page, options.background);
      if (tableLines !== "none") {
        const style = normalizeTableLineStyle(options.tableLineStyle);
        context.save(); context.strokeStyle = style.color; context.globalAlpha = style.alpha; context.lineWidth = style.width;
        const total = line.columnWidths.reduce((sum, width) => sum + width, 0); const top = -line.fontSize - 8; const height = line.lineHeight;
        if (tableLines === "grid") {
          let edge = 0; for (const width of line.columnWidths) { context.strokeRect(edge, top, width, height); edge += width; }
        } else {
          context.beginPath(); context.moveTo(0, top + height); context.lineTo(total, top + height); context.stroke();
        }
        context.restore();
      }
    }
    const advances = states.map((state) => {
      if (state.character === "\t") return 0;
      context.font = `${line.fontSize * state.fontSizeScale}px ${fontCssFamily(lineFont)}`;
      return context.measureText(state.character).width + line.letterSpacing;
    });
    const columnScales = line.columnWidths?.map((width, index) => {
      let current = 0; let total = 0;
      for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
        if (states[stateIndex].character === "\t") { current += 1; continue; }
        if (current === index) total += advances[stateIndex];
      }
      return Math.min(1, Math.max(0.7, (width - 14) / Math.max(1, total)));
    });
    const glyphs: RenderedGlyph[] = [];
    const romanIndexes = romanNumeralCharacterIndexes(line.text);
    for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
      const rawState = states[stateIndex];
      const sourceIndex = line.sourceCharacterIndices?.[stateIndex] ?? line.startIndex + stateIndex;
      const state = romanIndexes.has(stateIndex) ? naturalizeRomanGlyph(rawState, line, sourceIndex, options.seed, options.documentId) : rawState;
      if (state.character === "\t" && line.columnWidths?.length) {
        cursor = line.columnWidths.slice(0, Math.min(++columnIndex, line.columnWidths.length)).reduce((sum, width) => sum + width, 0) + 8;
        continue;
      }
      const size = line.fontSize * state.fontSizeScale;
      context.font = `${size}px ${fontCssFamily(lineFont)}`;
      const measured = context.measureText(state.character).width;
      const columnScale = columnScales?.[columnIndex] ?? 1;
      const inkState = inkStates[stateIndex];
      const glyphX = cursor + state.offsetX;
      context.save(); context.translate(glyphX, state.offsetY + state.baselineOffset);
      const columnWidth = line.columnWidths?.[columnIndex];
      if (columnWidth && typeof context.clip === "function") {
        const columnStart = line.columnWidths!.slice(0, columnIndex).reduce((sum, width) => sum + width, 0) + 6;
        context.beginPath(); context.rect(columnStart - glyphX, -line.fontSize - 9, Math.max(1, columnWidth - 12), line.lineHeight + 6); context.clip();
      }
      context.rotate(state.rotation * Math.PI / 180); context.scale(state.scaleX * columnScale, state.scaleY);
      const textureAlpha = inkState.brokenInk ? 0.78 : inkState.dryBrush ? 0.88 : 1;
      context.globalAlpha = state.opacity * inkState.alpha * textureAlpha;
      context.fillStyle = ink.color;
      const textureBrightness = inkState.dryBrush || inkState.brokenInk ? 1.04 + Math.abs(inkState.textureOffset) * 0.04 : 1;
      context.filter = `brightness(${inkState.brightness * textureBrightness}) saturate(${inkState.saturation}) blur(${inkState.bleed * 0.22}px)`;
      context.shadowColor = ink.color; context.shadowBlur = inkState.bleed * 1.15;
      context.fillText(state.character, 0, 0);
      if (options.isolatedTextLayer && (inkState.dryBrush || inkState.brokenInk)) {
        context.save(); context.globalCompositeOperation = "destination-out";
        context.globalAlpha = inkState.brokenInk ? 0.52 : 0.28;
        const scratchY = -size * (0.42 + inkState.textureOffset * 0.08);
        context.fillRect(Math.max(0.4, measured * 0.12), scratchY, Math.max(0.8, measured * 0.64), Math.max(0.35, size * 0.025));
        if (inkState.brokenInk) context.fillRect(measured * 0.48, -size * 0.72, Math.max(0.4, size * 0.035), size * 0.48);
        context.restore();
      }
      context.restore();
      glyphs.push({ sourceIndex, x: glyphX, width: measured * state.scaleX * columnScale, top: -size, bottom: 2 });
      cursor += (measured + line.letterSpacing) * columnScale;
    }
    const correctionStarted = monotonicNow();
    renderCorrections(context, line, glyphs, options, fontCssFamily(lineFont));
    correctionMs += monotonicNow() - correctionStarted;
    context.restore();
    const structuredWidth = line.columnWidths?.reduce((sum, width) => sum + width, 0) ?? 0;
    const box = { id: line.id, x: x - 5, y: y - line.fontSize - 8, width: Math.max(36, structuredWidth || cursor + 10), height: Math.max(line.fontSize + 18, line.lineHeight) };
    bounds.push(box);
  }
  if (shouldRenderGeneratedFooter(options)) {
    context.save(); context.fillStyle = "rgba(87,101,108,.58)"; context.font = "11px 'Microsoft YaHei UI', sans-serif";
    context.textAlign = "center"; context.fillText(`第 ${options.page.pageIndex + 1} 页 / 共 ${options.pageCount} 页`, PAGE_WIDTH / 2, 820); context.restore();
  }
  recordRenderTiming("correction", correctionMs);
  recordRenderTiming("text", monotonicNow() - started);
  return bounds;
}

export function renderCompositeCanvas(canvas: HTMLCanvasElement, options: RenderOptions, widthPx: number, heightPx: number) {
  canvas.width = widthPx; canvas.height = heightPx;
  const context = canvas.getContext("2d"); if (!context) return;
  context.setTransform(widthPx / PAGE_WIDTH, 0, 0, heightPx / PAGE_HEIGHT, 0, 0);
  const exportOptions = { ...options, showSelection: false, showLineGuides: false };
  renderPageBackground(context, exportOptions);
  const textCanvas = canvas.ownerDocument.createElement("canvas"); textCanvas.width = widthPx; textCanvas.height = heightPx;
  const textContext = textCanvas.getContext("2d"); if (!textContext) return;
  textContext.setTransform(widthPx / PAGE_WIDTH, 0, 0, heightPx / PAGE_HEIGHT, 0, 0);
  renderTextLayer(textContext, { ...exportOptions, isolatedTextLayer: true }, true);
  context.setTransform(1, 0, 0, 1, 0, 0); context.drawImage(textCanvas, 0, 0);
  textCanvas.width = 1; textCanvas.height = 1;
}
