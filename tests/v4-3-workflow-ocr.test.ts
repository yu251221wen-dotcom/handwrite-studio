import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_LINE_DETECTION, normalizeLineDetection } from "../lib/background/line-detection.ts";
import { ExportCancelledError, streamPages } from "../lib/export/stream-export.ts";
import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND_ADJUSTMENTS } from "../lib/handwriting/background-library.ts";
import { naturalizeRomanGlyph, romanNumeralCharacterIndexes } from "../lib/handwriting/roman-numerals.ts";
import { resolveTableLines } from "../lib/handwriting/table-line-style.ts";
import { DEFAULT_DOCUMENT_LAYOUT_SETTINGS, type CharacterRenderState, type PageState, type ProjectState } from "../lib/handwriting/types.ts";
import { commitHistory, createHistory, undoHistory } from "../lib/history/history-store.ts";
import { layoutDocumentBlocks } from "../lib/layout/block-layout-engine.ts";
import { validateDocumentCoverage } from "../lib/layout/coverage.ts";
import { createApproximateTextMeasurer } from "../lib/layout/text-measure.ts";
import { createOcrDraft, ocrTextToDocumentBlocks } from "../lib/ocr/ocr-lite.ts";
import { applyPageSettingsOverride, capturePageSettings } from "../lib/pages/page-settings-sync.ts";
import { FONT_SLOTS } from "../lib/handwriting/font-library.ts";

function page(pageIndex: number): PageState {
  return { pageId: `page-${pageIndex + 1}`, pageIndex, templateId: "no-template-a4", pageTemplateId: null,
    pageType: pageIndex ? "continuation" : "first", widthMm: 210, heightMm: 297, backgroundId: "white-clean",
    backgroundAdjustments: { ...DEFAULT_BACKGROUND_ADJUSTMENTS }, backgroundTransform: { fitMode: "cover", scale: 1, offsetX: 0, offsetY: 0 },
    lineDetection: { ...DEFAULT_LINE_DETECTION }, blockIds: [], lines: [{ id: `line-${pageIndex}`, pageId: `page-${pageIndex + 1}`,
      fieldId: "body", blockId: "body", blockType: "paragraph", label: "", text: "甲", startIndex: pageIndex, endIndex: pageIndex + 1,
      autoX: 50, autoY: 100, manualOffsetX: pageIndex + 3, manualOffsetY: pageIndex + 5, rotation: 0, fontSize: 17,
      letterSpacing: 1, lineHeight: 34, fontId: FONT_SLOTS[0].id, locked: false }] };
}

function project(): ProjectState {
  return { schemaVersion: 3, projectVersion: "4.3.0", id: "preview", document: { id: "doc", name: "demo", rawTexts: ["甲乙"], sourceCharacterCount: 2 },
    layoutMode: "no-template", noTemplateMode: "preserve-structure", templateId: null, documentBlocks: [], mappedBlockIds: [], unmappedBlockIds: [], explicitlyIgnoredBlockIds: [],
    documentLayoutSettings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS, seed: "1001", selectedFontId: FONT_SLOTS[0].id, fieldMappings: [], pages: [page(0), page(1)],
    handwriting: { preset: "natural", naturality: 52, randomization: { characterOffsetX: 1, characterOffsetY: 1, characterRotation: 1,
      characterScaleX: .02, characterScaleY: .02, characterFontSizeVariation: .02, characterBaselineOffset: 1, characterOpacityVariation: .02, correlation: .8 },
      inkColor: "#163d64", fixed: true }, exportSettings: { pageSize: "A4", dpi: 300, format: "png", jpgQuality: .9 }, updatedAt: "" };
}

test("all-page preview copies only paper settings and one undo restores the batch", () => {
  const original = project(); const source = { ...original.pages[0], backgroundId: "ruled-blue-40",
    lineDetection: normalizeLineDetection({ ...DEFAULT_LINE_DETECTION, enabled: true, snapEnabled: true, lineY: [100, 140, 180],
      averageSpacing: 40, firstUsableLine: 0, lastUsableLine: 2, writableLeft: 70, writableRight: 520, source: "manual" }) };
  const candidate = applyPageSettingsOverride({ ...original, pages: [source, original.pages[1]] }, capturePageSettings(source));
  assert.equal(original.pages[1].backgroundId, "white-clean", "preview must not mutate the current project");
  assert.equal(candidate.pages[1].backgroundId, "ruled-blue-40");
  assert.deepEqual(candidate.pages[1].lines, original.pages[1].lines, "manual line state stays page-local");
  const history = commitHistory(createHistory(original), candidate);
  assert.equal(history.past.length, 1); assert.deepEqual(undoHistory(history).present, original);
});

test("stream export consumes and releases one page at a time and can cancel", async () => {
  const order: string[] = []; const controller = new AbortController();
  await assert.rejects(streamPages({ total: 3, signal: controller.signal,
    render: async (index) => { order.push(`render-${index}`); return { index }; },
    consume: async (value) => { order.push(`consume-${value.index}`); if (value.index === 0) controller.abort(); },
    release: async (value) => { order.push(`release-${value.index}`); }, yieldToMain: async () => undefined,
  }), ExportCancelledError);
  assert.deepEqual(order, ["render-0", "consume-0", "release-0"]);
});

test("OCR correction text becomes traceable DocumentBlocks and uses the normal layout pipeline", () => {
  const draft = createOcrDraft("scan.png", "image/png", [{ text: "入院记录\n姓名：测试患者\n1、主诉胸闷\n现病史内容", confidence: 88 }]);
  assert.deepEqual(draft.lines.map((line) => line.suggestedType), ["heading", "key-value", "list", "paragraph"]);
  const blocks = ocrTextToDocumentBlocks(draft.text);
  const result = layoutDocumentBlocks({ documentId: "ocr", blocks, measurer: createApproximateTextMeasurer(),
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, settings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    backgroundId: "white-clean", mode: "preserve-structure" });
  assert.equal(validateDocumentCoverage([], result.pages, { blocks }).missingCharacters, 0);
});

test("Roman numerals receive stable per-occurrence handwriting variation", () => {
  assert.deepEqual([...romanNumeralCharacterIndexes("II\tIII\tIV\tV")], [0, 1, 3, 4, 5, 7, 8, 10]);
  const state: CharacterRenderState = { index: 0, character: "I", offsetX: 0, offsetY: 0, rotation: 0, scaleX: 1, scaleY: 1, fontSizeScale: 1, baselineOffset: 0, opacity: 1 };
  const line = { ...page(0).lines[0], visualKind: "table" as const };
  const first = naturalizeRomanGlyph(state, line, 2, "1001", "doc");
  assert.deepEqual(first, naturalizeRomanGlyph(state, line, 2, "1001", "doc"));
  assert.notDeepEqual(first, naturalizeRomanGlyph(state, line, 3, "1001", "doc"));
});

test("table line modes avoid doubling structured paper", () => {
  const ruled = { ...page(0), lineDetection: normalizeLineDetection({ ...DEFAULT_LINE_DETECTION, enabled: true, lineY: [100, 140, 180], averageSpacing: 40 }) };
  const solid = page(0);
  assert.equal(resolveTableLines("hidden", solid, BACKGROUND_PRESETS[0]), "none");
  assert.equal(resolveTableLines("visible", ruled, BACKGROUND_PRESETS[0]), "grid");
  assert.equal(resolveTableLines("auto", ruled, BACKGROUND_PRESETS[0]), "none");
  assert.equal(resolveTableLines("adaptive", solid, BACKGROUND_PRESETS[0]), "horizontal");
});

