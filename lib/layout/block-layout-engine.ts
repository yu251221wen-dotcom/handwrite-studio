import type {
  DocumentBlock, DocumentLayoutSettings, LineLayout, NoTemplateMode, PageState,
} from "../handwriting/types.ts";
import { breakTextByWidth } from "./line-breaker.ts";
import type { TextMeasurer } from "./types.ts";
import { DEFAULT_ADJUSTMENTS, DEFAULT_TRANSFORM } from "./paginator.ts";
import { mapSourceCharacters } from "../handwriting/source-character-map.ts";

interface BlockLayoutInput {
  documentId: string; blocks: DocumentBlock[]; measurer: TextMeasurer;
  fontId: string; fontFamily: string; settings: DocumentLayoutSettings;
  backgroundId: string; mode: NoTemplateMode; previousPages?: PageState[];
}

type LogicalLine = Omit<LineLayout, "pageId" | "autoY">;
interface BlockUnit {
  block: DocumentBlock; lines: LogicalLine[]; spacingBefore: number; spacingAfter: number;
  keepWithNext: boolean; minLinesAfter: number; allowSplit: boolean;
}

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

function columnsFor(value: 1 | 2 | 3 | 4 | "auto", available: number, auto: number): number {
  if (value === "auto") return available > 390 ? auto : Math.max(1, auto - 1);
  return value;
}

function baseLine(
  block: DocumentBlock, id: string, text: string, startIndex: number, input: BlockLayoutInput,
  fontSize = input.settings.bodyFontSize, lineHeight = input.settings.lineHeight,
  visualKind: LogicalLine["visualKind"] = "text", columnWidths?: number[], rowIndex?: number,
  coverageText?: string,
): LogicalLine {
  return {
    id, fieldId: block.blockId, blockId: block.blockId, blockType: block.type,
    label: "", text, startIndex, endIndex: startIndex + Array.from(text).length,
    autoX: input.settings.marginLeft, manualOffsetX: 0, manualOffsetY: 0, rotation: 0,
    fontSize, letterSpacing: input.settings.letterSpacing, lineHeight, fontId: input.fontId,
    locked: false, visualKind, columnWidths, rowIndex, ...(coverageText !== undefined ? { coverageText } : {}),
  };
}

function wrappedLines(block: DocumentBlock, text: string, input: BlockLayoutInput, options: {
  fontSize?: number; lineHeight?: number; visualKind?: LogicalLine["visualKind"];
  firstIndent?: number;
} = {}): LogicalLine[] {
  const fontSize = options.fontSize ?? input.settings.bodyFontSize;
  const lineHeight = options.lineHeight ?? input.settings.lineHeight;
  const width = A4_WIDTH - input.settings.marginLeft - input.settings.marginRight;
  const broken = breakTextByWidth(text, width - (options.firstIndent ?? 0), input.measurer, {
    fontFamily: input.fontFamily, fontSize, letterSpacing: input.settings.letterSpacing,
  });
  return broken.map((line, index) => ({
    ...baseLine(block, `${block.blockId}:${line.startIndex}`, line.text, line.startIndex, input, fontSize, lineHeight, options.visualKind),
    autoX: input.settings.marginLeft + (index === 0 ? options.firstIndent ?? 0 : 0),
  }));
}

function structuredRows(
  block: DocumentBlock, rows: string[][], input: BlockLayoutInput, visualKind: "columns" | "table",
): LogicalLine[] {
  const width = A4_WIDTH - input.settings.marginLeft - input.settings.marginRight;
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const columnWidths = Array.from({ length: columnCount }, () => width / columnCount);
  let cursor = 0;
  return rows.map((row, rowIndex) => {
    const text = row.join("\t");
    const line = baseLine(block, `${block.blockId}:row:${rowIndex}`, text, cursor, input,
      input.settings.bodyFontSize, input.settings.lineHeight + (visualKind === "table" ? 5 : 0),
      visualKind, columnWidths, rowIndex);
    cursor += Array.from(text).length;
    return line;
  });
}

function applyBlockAlignment(lines: LogicalLine[], block: DocumentBlock, input: BlockLayoutInput): LogicalLine[] {
  const alignment = "alignment" in block && typeof block.alignment === "string" ? block.alignment : "left";
  if (alignment === "left") return lines;
  const contentWidth = A4_WIDTH - input.settings.marginLeft - input.settings.marginRight;
  return lines.map((line) => {
    const measuredWidth = input.measurer.measure(line.text, {
      fontFamily: input.fontFamily, fontSize: line.fontSize, letterSpacing: line.letterSpacing,
    });
    const freeSpace = Math.max(0, contentWidth - measuredWidth);
    return { ...line, autoX: input.settings.marginLeft + (alignment === "center" ? freeSpace / 2 : freeSpace) };
  });
}

function blockToUnit(block: DocumentBlock, input: BlockLayoutInput): BlockUnit {
  const simple = input.mode === "simplified";
  let lines: LogicalLine[];
  let spacingBefore = input.settings.paragraphSpacingBefore;
  let spacingAfter = input.settings.paragraphSpacingAfter;
  let keepWithNext = Boolean(block.keepWithNext);
  const minLinesAfter = block.type === "heading" ? block.minLinesAfterHeading : 0;
  let allowSplit = block.allowSplit !== false;

  if (block.type === "heading") {
    const fontSize = block.level === 1 ? Math.max(input.settings.headingFontSize + 2, block.fontSize) : input.settings.headingFontSize;
    lines = wrappedLines(block, block.sourceText, input, { fontSize, lineHeight: Math.max(fontSize + 11, input.settings.lineHeight), visualKind: "heading" });
    lines = applyBlockAlignment(lines, block, input);
    spacingBefore = input.settings.headingSpacingBefore; spacingAfter = input.settings.headingSpacingAfter;
    keepWithNext = true; allowSplit = false;
  } else if (block.type === "key-value" && !simple) {
    const count = columnsFor(input.settings.keyValueColumns, A4_WIDTH - input.settings.marginLeft - input.settings.marginRight, 2);
    const rows = Array.from({ length: Math.ceil(block.items.length / count) }, (_, index) => block.items.slice(index * count, (index + 1) * count).map((item) => item.raw));
    lines = structuredRows(block, rows, input, "columns");
  } else if (block.type === "table" && !simple) {
    lines = structuredRows(block, block.rows, input, "table");
  } else if (block.type === "prescription" && !simple) {
    const count = columnsFor(input.settings.prescriptionColumns, A4_WIDTH - input.settings.marginLeft - input.settings.marginRight, 3);
    const rows = Array.from({ length: Math.ceil(block.items.length / count) }, (_, index) => block.items.slice(index * count, (index + 1) * count).map((item) => item.raw));
    lines = structuredRows(block, rows, input, "columns");
  } else if (block.type === "signature" && !simple) {
    lines = structuredRows(block, [block.entries.map((entry) => entry.raw)], input, "columns");
    allowSplit = false;
  } else {
    const firstIndent = block.type === "paragraph" ? (block.firstLineIndent || input.settings.firstLineIndent) : 0;
    lines = wrappedLines(block, block.sourceText, input, { firstIndent });
    lines = applyBlockAlignment(lines, block, input);
  }
  // A partially recognized structured block must never discard its remaining text.
  if (lines.map((line) => line.text).join("").replace(/\s+/gu, "") !== block.sourceText.replace(/\s+/gu, "")) {
    lines = wrappedLines(block, block.sourceText, input);
  }
  lines = mapSourceCharacters(lines, block.sourceText);
  return { block, lines, spacingBefore, spacingAfter, keepWithNext, minLinesAfter, allowSplit };
}

function restoreManual(line: LogicalLine, previous: Map<string, LineLayout>): LogicalLine {
  const old = previous.get(line.id);
  return old ? { ...line, manualOffsetX: old.manualOffsetX, manualOffsetY: old.manualOffsetY,
    rotation: old.rotation, fontSize: old.fontSize, letterSpacing: old.letterSpacing,
    lineHeight: old.lineHeight, fontId: old.fontId, locked: old.locked } : line;
}

export function layoutDocumentBlocks(input: BlockLayoutInput): { pages: PageState[]; lines: LineLayout[] } {
  const previousLines = new Map(input.previousPages?.flatMap((page) => page.lines.map((line) => [line.id, line] as const)) ?? []);
  const previousAutoPages = (input.previousPages ?? []).filter((page) => page.pageType !== "blank" && page.pageType !== "custom");
  const trailingManualPages = (input.previousPages ?? []).filter((page) => page.pageType === "blank" || page.pageType === "custom");
  const units = input.blocks.map((block) => blockToUnit(block, input));
  const pages: PageState[] = [];
  const top = input.settings.marginTop;
  const bottom = A4_HEIGHT - input.settings.marginBottom;
  let y = top;

  const makePage = (): PageState => {
    const index = pages.length;
    const old = previousAutoPages[index];
    const pageId = old?.pageId ?? `page-${index + 1}`;
    const page: PageState = {
      pageId, pageIndex: index, templateId: "no-template-a4",
      pageTemplateId: null, pageType: index === 0 ? "first" : "continuation",
      widthMm: 210, heightMm: 297, backgroundId: old?.backgroundId ?? input.backgroundId,
      backgroundAdjustments: old?.backgroundAdjustments ?? { ...DEFAULT_ADJUSTMENTS },
      backgroundTransform: old?.backgroundTransform ?? { ...DEFAULT_TRANSFORM }, blockIds: [], lines: [],
    };
    pages.push(page); y = top; return page;
  };
  let page = makePage();
  const nextPage = () => { page = makePage(); };

  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const unit = units[unitIndex];
    if (!unit.lines.length) continue;
    const nextUnit = units[unitIndex + 1];
    const availableLines = Math.floor((bottom - y - unit.spacingBefore) / Math.max(1, unit.lines[0].lineHeight));
    const requiredWithNext = unit.keepWithNext ? unit.lines.length + Math.min(unit.minLinesAfter, nextUnit?.lines.length ?? 0) : 0;
    if ((requiredWithNext && availableLines < requiredWithNext) || (!unit.allowSplit && availableLines < unit.lines.length) ||
        (availableLines > 0 && availableLines < input.settings.minLinesAtPageBottom && unit.lines.length > availableLines)) nextPage();
    y += unit.spacingBefore;
    const fullUnitHeight = unit.lines.reduce((sum, line) => sum + restoreManual(line, previousLines).lineHeight, 0);
    let lineIndex = 0;
    while (lineIndex < unit.lines.length) {
      let fitCount = 0;
      let fittedHeight = 0;
      for (let index = lineIndex; index < unit.lines.length; index += 1) {
        const candidate = restoreManual(unit.lines[index], previousLines);
        if (y + fittedHeight + candidate.lineHeight > bottom) break;
        fittedHeight += candidate.lineHeight;
        fitCount += 1;
      }

      if (fitCount === 0) {
        if (y > top) { nextPage(); continue; }
        // A single manually enlarged line may be taller than the content area.
        // Place it once instead of entering a pagination loop.
        fitCount = 1;
      }

      const remaining = unit.lines.length - lineIndex;
      let take = Math.min(fitCount, remaining);
      if (remaining > take) {
        const canSplit = unit.allowSplit || fullUnitHeight > bottom - top;
        if (!canSplit) { nextPage(); continue; }

        // Keep a small continuation at the top of the following page, but consume
        // the current page instead of moving the entire long paragraph forward.
        const minNext = Math.min(input.settings.minLinesAtPageTop, remaining - 1);
        take = Math.min(take, remaining - minNext);
        const minCurrent = Math.min(input.settings.minLinesAtPageBottom, remaining - minNext);
        if (take < minCurrent && y > top) { nextPage(); continue; }
      }

      for (let offset = 0; offset < take; offset += 1) {
        const logical = restoreManual(unit.lines[lineIndex], previousLines);
        const line = { ...logical, pageId: page.pageId, autoY: y };
        page.lines.push(line); if (!page.blockIds!.includes(unit.block.blockId)) page.blockIds!.push(unit.block.blockId);
        y += logical.lineHeight;
        lineIndex += 1;
      }
      if (lineIndex < unit.lines.length) nextPage();
    }
    y += unit.spacingAfter;
  }

  for (const manual of trailingManualPages) {
    const pageIndex = pages.length;
    pages.push({ ...manual, pageIndex, pageId: manual.pageId || `page-${pageIndex + 1}`,
      lines: manual.lines.map((line) => ({ ...line, pageId: manual.pageId || `page-${pageIndex + 1}` })) });
  }
  return { pages, lines: pages.flatMap((item) => item.lines) };
}
