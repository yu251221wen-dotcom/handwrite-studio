import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEFAULT_LINE_DETECTION, normalizeLineDetection } from "../lib/background/line-detection.ts";
import { correctionMarksByBlock } from "../lib/handwriting/correction-style.ts";
import { FONT_SLOTS } from "../lib/handwriting/font-library.ts";
import { DEFAULT_INK_STYLE, generateInkStates } from "../lib/handwriting/ink-style.ts";
import { DEFAULT_DOCUMENT_LAYOUT_SETTINGS, type DocumentBlock, type PageState } from "../lib/handwriting/types.ts";
import { getLastPaginationDiagnostics, layoutDocumentBlocks } from "../lib/layout/block-layout-engine.ts";
import { validateDocumentCoverage } from "../lib/layout/coverage.ts";
import { getPerformanceSnapshot, resetPerformanceSnapshot } from "../lib/performance/performance-monitor.ts";

const measurer = { measure: (text: string) => Array.from(text).length * 10 };
const paper = normalizeLineDetection({ ...DEFAULT_LINE_DETECTION, enabled: true, snapEnabled: true, source: "manual",
  lineY: [100, 140, 180, 220, 260, 300], averageSpacing: 40, firstUsableLine: 0, lastUsableLine: 5,
  writableLeft: 247.5, writableRight: 347.5, offsetY: -2 });
const previousPage: PageState = {
  pageId: "page-1", pageIndex: 0, templateId: "no-template-a4", pageTemplateId: null, pageType: "first",
  widthMm: 210, heightMm: 297, backgroundId: "paper",
  backgroundAdjustments: { brightness: 100, contrast: 100, saturation: 100, blur: 0, noise: 0, rotation: 0 },
  backgroundTransform: { fitMode: "cover", scale: 1, offsetX: 0, offsetY: 0 }, lineDetection: paper, blockIds: [], lines: [],
};

function paragraph(blockId: string, sourceText: string, order: number): DocumentBlock {
  return { blockId, type: "paragraph", sourceOrder: order, sourceStart: 0, sourceEnd: Array.from(sourceText).length,
    sourceText, content: sourceText, firstLineIndent: 0, lineHeight: 40, paragraphSpacing: 0, allowSplit: true };
}

function layout(blocks: DocumentBlock[]) {
  return layoutDocumentBlocks({ documentId: "v4.2.1", blocks, measurer, fontId: FONT_SLOTS[0].id,
    fontFamily: FONT_SLOTS[0].family, settings: { ...DEFAULT_DOCUMENT_LAYOUT_SETTINGS, firstLineIndent: 0 },
    backgroundId: "paper", mode: "preserve-structure", previousPages: [previousPage] });
}

test("splittable prose consumes the final paper slot and diagnostics report no avoidable gap", () => {
  const blocks = [paragraph("first", "甲".repeat(35), 0), paragraph("second", "乙".repeat(70), 1)];
  const result = layout(blocks);
  assert.ok(result.pages.length > 1);
  assert.equal(result.pages[0].lines.length, 6);
  assert.equal(validateDocumentCoverage([], result.pages, { blocks }).missingCharacters, 0);
  assert.equal(getLastPaginationDiagnostics().some((item) => item.breakReason === "avoidable-gap"), false);
});

test("two consecutive signature blocks use the final two slots without a decorative gap", () => {
  const blocks: DocumentBlock[] = [
    ...Array.from({ length: 4 }, (_, index) => paragraph(`body-${index}`, String.fromCharCode(0x7532 + index), index)),
    { blockId: "teacher", type: "signature", sourceOrder: 4, sourceStart: 0, sourceEnd: 7, sourceText: "带教老师：甲",
      entries: [{ role: "带教老师", name: "甲", raw: "带教老师：甲" }], alignment: "right", allowSplit: false },
    { blockId: "student", type: "signature", sourceOrder: 5, sourceStart: 0, sourceEnd: 7, sourceText: "规培医师：乙",
      entries: [{ role: "规培医师", name: "乙", raw: "规培医师：乙" }], alignment: "right", allowSplit: false },
  ];
  const result = layout(blocks);
  assert.equal(result.pages.length, 1, JSON.stringify(result.pages.map((page) => page.lines.map((line) => ({ id: line.id, type: line.blockType, slot: line.assignedPaperLineIndex })) )));
  assert.deepEqual(result.pages[0].lines.slice(-2).map((line) => line.blockType), ["signature", "signature"]);
  assert.ok(result.pages[0].lines.slice(-2).every((line) => line.autoX > paper.writableLeft));
  assert.equal(validateDocumentCoverage([], result.pages, { blocks }).missingCharacters, 0);
});

test("one prescription row may occupy the final available slot", () => {
  const items = ["黄芪15g", "党参10g", "白术10g", "炙甘草6g"].map((raw) => ({ name: raw.replace(/\d.*$/u, ""), dose: raw.match(/\d.*$/u)?.[0] ?? "", raw }));
  const sourceText = items.map((item) => item.raw).join("\t");
  const blocks: DocumentBlock[] = [
    ...Array.from({ length: 5 }, (_, index) => paragraph(`body-${index}`, "甲", index)),
    { blockId: "rx", type: "prescription", sourceOrder: 5, sourceStart: 0, sourceEnd: Array.from(sourceText).length,
      sourceText, items, columns: "auto", allowSplit: true },
  ];
  const result = layout(blocks);
  assert.equal(result.pages.length, 1, JSON.stringify(result.pages.map((page) => page.lines.map((line) => ({ id: line.id, type: line.blockType, slot: line.assignedPaperLineIndex })) )));
  assert.equal(result.pages[0].lines.at(-1)?.blockType, "prescription");
  assert.equal(validateDocumentCoverage([], result.pages, { blocks }).missingCharacters, 0);
});

test("a heading moves only when the final slot cannot also hold one following line", () => {
  const blocks: DocumentBlock[] = [
    ...Array.from({ length: 5 }, (_, index) => paragraph(`body-${index}`, "甲", index)),
    { blockId: "heading", type: "heading", sourceOrder: 5, sourceStart: 0, sourceEnd: 2, sourceText: "诊断",
      text: "诊断", level: 2, alignment: "left", fontSize: 20, fontWeight: 600, spacingBefore: 0, spacingAfter: 0,
      minLinesAfterHeading: 1, keepWithNext: true, allowSplit: false },
    paragraph("after", "乙", 6),
  ];
  const result = layout(blocks);
  assert.equal(result.pages[0].lines.length, 5);
  assert.equal(result.pages[1].lines[0].blockType, "heading");
  assert.equal(getLastPaginationDiagnostics()[0].breakReason, "heading-with-next");
});

test("appearance work does not increment layout recomputation and expensive ink effects default off", () => {
  resetPerformanceSnapshot();
  layout([paragraph("body", "甲".repeat(80), 0)]);
  const before = getPerformanceSnapshot();
  generateInkStates(2000, "same-writer", { ...DEFAULT_INK_STYLE, color: "#20558a", variation: 0.3 });
  const after = getPerformanceSnapshot();
  assert.equal(after.layoutRecomputeCount, before.layoutRecomputeCount);
  assert.equal(before.layoutRecomputeCount, 1);
  assert.ok(before.layout.wrap.count >= 1 && before.layout.pagination.count >= 1 && before.layout["slot-assignment"].count >= 1);
  assert.deepEqual([DEFAULT_INK_STYLE.bleed, DEFAULT_INK_STYLE.dryBrush, DEFAULT_INK_STYLE.brokenInk], [0, 0, 0]);
});

test("manual corrections are indexed by block and editor mounts only current and adjacent canvases", () => {
  const marks = [
    { id: "a", blockId: "one", sourceStart: 0, sourceEnd: 1, sourceText: "甲", type: "single-strike" as const },
    { id: "b", blockId: "two", sourceStart: 0, sourceEnd: 1, sourceText: "乙", type: "double-strike" as const },
  ];
  const style = { enabled: true, automatic: false, automaticProbability: 0, marks };
  assert.strictEqual(correctionMarksByBlock(style), correctionMarksByBlock(style));
  assert.deepEqual(correctionMarksByBlock(style).get("one")?.map((mark) => mark.id), ["a"]);
  const source = readFileSync("components/editor/editor-workspace.tsx", "utf8");
  assert.match(source, /Math\.abs\(pageIndex - currentPage\.pageIndex\) <= 1/u);
  assert.doesNotMatch(source, /第 \{page\.pageIndex \+ 1\} 页 · \{page\.pageType/u);
});
