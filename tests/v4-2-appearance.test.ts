import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_LINE_DETECTION, normalizeLineDetection } from "../lib/background/line-detection.ts";
import { V3_SHOWCASE_BLOCKS } from "../lib/demo/v3-showcase-fixture.ts";
import { BACKGROUND_PRESETS } from "../lib/handwriting/background-library.ts";
import { renderTextLayer, type RenderOptions } from "../lib/handwriting/canvas-renderer.ts";
import { automaticCorrectionMarks, DEFAULT_CORRECTION_STYLE } from "../lib/handwriting/correction-style.ts";
import { FONT_SLOTS } from "../lib/handwriting/font-library.ts";
import { DEFAULT_INK_STYLE, generateInkStates } from "../lib/handwriting/ink-style.ts";
import { DEFAULT_RANDOMIZATION } from "../lib/handwriting/randomization.ts";
import { deserializeProject, serializeProject } from "../lib/handwriting/serialization.ts";
import { mapSourceCharacters } from "../lib/handwriting/source-character-map.ts";
import { DEFAULT_DOCUMENT_LAYOUT_SETTINGS, type DocumentBlock, type LineLayout, type ProjectState } from "../lib/handwriting/types.ts";
import { layoutDocumentBlocks } from "../lib/layout/block-layout-engine.ts";
import { validateDocumentCoverage } from "../lib/layout/coverage.ts";
import { createApproximateTextMeasurer } from "../lib/layout/text-measure.ts";

const handwriting = { preset: "natural" as const, naturality: 52, randomization: DEFAULT_RANDOMIZATION, inkColor: "#163d64", fixed: true };

function drawingSpy() {
  const texts: Array<{ text: string; x: number; y: number; align: CanvasTextAlign }> = [];
  let strokes = 0;
  const context = {
    textAlign: "start" as CanvasTextAlign,
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, strokeRect() {}, fillRect() {},
    beginPath() {}, rect() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() { strokes += 1; },
    measureText: (text: string) => ({ width: Array.from(text).length * 17 }),
    fillText(this: { textAlign: CanvasTextAlign }, text: string, x: number, y: number) { texts.push({ text, x, y, align: this.textAlign }); },
  } as unknown as CanvasRenderingContext2D;
  return { context, texts, strokeCount: () => strokes };
}

function emptyOptions(): RenderOptions {
  return { page: { pageId: "page-1", pageIndex: 0, templateId: "no-template-a4", pageTemplateId: null,
    widthMm: 210, heightMm: 297, backgroundId: "paper", lines: [],
    backgroundAdjustments: { brightness: 100, contrast: 100, saturation: 100, blur: 0, noise: 0, rotation: 0 },
    backgroundTransform: { fitMode: "cover", scale: 1, offsetX: 0, offsetY: 0 } }, pageCount: 3,
    font: FONT_SLOTS[0], background: BACKGROUND_PRESETS[0], handwriting, seed: "1001", documentId: "doc",
    inkStyle: DEFAULT_INK_STYLE, correctionStyle: DEFAULT_CORRECTION_STYLE, footerMode: "auto" };
}

test("V4.2 ink states are deterministic, seed-sensitive and independent of page coordinates", () => {
  const first = generateInkStates(80, "doc|block|1001", DEFAULT_INK_STYLE);
  const same = generateInkStates(80, "doc|block|1001", DEFAULT_INK_STYLE);
  const changed = generateInkStates(80, "doc|block|2002", DEFAULT_INK_STYLE);
  assert.deepEqual(first, same);
  assert.notDeepEqual(first, changed);
  assert.ok(first.every((state) => state.alpha >= 0.76 && state.alpha <= 1));
});

test("footer auto mode suppresses native paper footer and generated mode is centered", () => {
  const native = drawingSpy();
  renderTextLayer(native.context, { ...emptyOptions(), background: { ...BACKGROUND_PRESETS[0], hasNativePageFooter: true } });
  assert.equal(native.texts.some((item) => item.text.includes("共 3 页")), false);
  const generated = drawingSpy();
  renderTextLayer(generated.context, { ...emptyOptions(), footerMode: "generated" });
  const footer = generated.texts.find((item) => item.text === "第 1 页 / 共 3 页")!;
  assert.deepEqual([footer.x, footer.y, footer.align], [595 / 2, 820, "center"]);
});

test("prescription defaults to four fixed cells per row and signature is kept together in normal flow", () => {
  const prescription = V3_SHOWCASE_BLOCKS.find((block) => block.type === "prescription")!;
  const prescriptionResult = layoutDocumentBlocks({ documentId: "rx", blocks: [prescription], measurer: createApproximateTextMeasurer(),
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, settings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    backgroundId: "white", mode: "preserve-structure" });
  const rows = prescriptionResult.lines.filter((line) => line.blockType === "prescription");
  assert.deepEqual(rows.map((line) => line.text.split("\t").length), [4, 4, 1]);
  assert.ok(rows.every((line) => line.columnWidths?.length === 4));

  const paragraphText = "甲".repeat(30);
  const signatureText = "带教老师：甲\t规培医师：乙";
  const blocks: DocumentBlock[] = [
    { blockId: "body", type: "paragraph", sourceOrder: 0, sourceStart: 0, sourceEnd: 30, sourceText: paragraphText,
      content: paragraphText, firstLineIndent: 0, lineHeight: 34, paragraphSpacing: 0, allowSplit: true },
    { blockId: "signature", type: "signature", sourceOrder: 1, sourceStart: 30, sourceEnd: 30 + Array.from(signatureText).length,
      sourceText: signatureText, entries: [{ role: "带教老师", name: "甲", raw: "带教老师：甲" }, { role: "规培医师", name: "乙", raw: "规培医师：乙" }],
      alignment: "right", allowSplit: false },
  ];
  const detection = normalizeLineDetection({ ...DEFAULT_LINE_DETECTION, enabled: true, snapEnabled: true, source: "manual",
    lineY: [100, 140, 180, 220], averageSpacing: 40, firstUsableLine: 0, lastUsableLine: 3, writableLeft: 247, writableRight: 347 });
  const result = layoutDocumentBlocks({ documentId: "signature-flow", blocks, measurer: { measure: (text) => Array.from(text).length * 10 },
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, settings: { ...DEFAULT_DOCUMENT_LAYOUT_SETTINGS, firstLineIndent: 0 },
    backgroundId: "paper", mode: "preserve-structure", previousPages: [{ ...emptyOptions().page, lineDetection: detection }] });
  assert.deepEqual(result.pages.map((page) => page.lines.length), [3, 2]);
  assert.ok(result.pages[1].lines.every((line) => line.blockType === "signature" && line.visualKind === "signature"));
  assert.ok(result.pages[1].lines[0].autoX > detection.writableLeft);
  assert.equal(validateDocumentCoverage([], result.pages, { blocks }).missingCharacters, 0);
});

test("manual corrections stay source-anchored and do not change content coverage", () => {
  const source = "患者今日胸闷缓解。";
  const [line] = mapSourceCharacters([{ id: "line", pageId: "page-1", fieldId: "body", blockId: "body", blockType: "paragraph" as const,
    label: "", text: source, startIndex: 0, endIndex: Array.from(source).length, autoX: 60, autoY: 120,
    manualOffsetX: 0, manualOffsetY: 0, rotation: 0, fontSize: 17, letterSpacing: 1, lineHeight: 34,
    fontId: FONT_SLOTS[0].id, locked: false }], source);
  const mark = { id: "manual:body:4", blockId: "body", sourceStart: 4, sourceEnd: 6, sourceText: "胸闷", type: "double-strike" as const, replacementText: "胸部不适" };
  const spy = drawingSpy();
  renderTextLayer(spy.context, { ...emptyOptions(), page: { ...emptyOptions().page, lines: [line] }, fieldTextById: { body: source },
    correctionStyle: { enabled: true, automatic: false, automaticProbability: 0, marks: [mark] }, footerMode: "hidden" });
  assert.ok(spy.strokeCount() >= 2);
  assert.ok(spy.texts.some((item) => item.text === "胸部不适"));
  assert.equal(spy.texts.filter((item) => Array.from(item.text).length === 1).map((item) => item.text).join(""), source);
  const block: DocumentBlock = { blockId: "body", type: "paragraph", sourceOrder: 0, sourceStart: 0, sourceEnd: Array.from(source).length,
    sourceText: source, content: source, firstLineIndent: 0, lineHeight: 34, paragraphSpacing: 0 };
  assert.equal(validateDocumentCoverage([], [{ ...emptyOptions().page, lines: [line] }], { blocks: [block] }).missingCharacters, 0);
});

test("auto correction rejects identifiers, dates, diagnoses and prescriptions", () => {
  const style = { ...DEFAULT_CORRECTION_STYLE, automatic: true, automaticProbability: 1 };
  const unsafe: LineLayout[] = [
    { ...({} as LineLayout), id: "a", fieldId: "a", blockId: "a", blockType: "paragraph", text: "姓名：测试患者 2026-09-16", sourceCharacterIndices: Array.from({ length: 20 }, (_, index) => index) },
    { ...({} as LineLayout), id: "b", fieldId: "b", blockId: "b", blockType: "prescription", text: "党参15g", sourceCharacterIndices: [0, 1, 2, 3, 4, 5] },
  ];
  assert.equal(unsafe.flatMap((line) => automaticCorrectionMarks(line, line.text, style, "1001", "doc")).length, 0);
});

test("Schema V3 serialization adds and preserves V4.2 appearance settings without re-layout", () => {
  const options = emptyOptions();
  const state: ProjectState = { schemaVersion: 3, projectVersion: "4.1.0", id: "appearance", document: { id: "doc", name: "demo", rawTexts: [], sourceCharacterCount: 0 },
    layoutMode: "no-template", noTemplateMode: "preserve-structure", templateId: null, documentBlocks: [], mappedBlockIds: [], unmappedBlockIds: [], explicitlyIgnoredBlockIds: [],
    documentLayoutSettings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS, seed: "1001", selectedFontId: FONT_SLOTS[0].id, fieldMappings: [], pages: [options.page], handwriting,
    exportSettings: { pageSize: "A4", dpi: 300, format: "png", jpgQuality: .9 }, updatedAt: "" };
  const upgraded = deserializeProject(JSON.stringify(state));
  assert.equal(upgraded.projectVersion, "4.2.1"); assert.equal(upgraded.footerMode, "auto");
  assert.deepEqual(upgraded.inkStyle, { ...DEFAULT_INK_STYLE, color: handwriting.inkColor });
  const restored = deserializeProject(serializeProject({ ...upgraded, footerMode: "native",
    correctionStyle: { enabled: true, automatic: false, automaticProbability: 0, marks: [{ id: "m", blockId: "b", sourceStart: 1, sourceEnd: 2, sourceText: "甲", type: "single-strike" }] } }));
  assert.equal(restored.footerMode, "native"); assert.equal(restored.correctionStyle?.marks.length, 1);
});
