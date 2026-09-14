import assert from "node:assert/strict";
import test from "node:test";
import { renderTextLayer, type RenderOptions } from "../lib/handwriting/canvas-renderer.ts";
import { mapSourceCharacters } from "../lib/handwriting/source-character-map.ts";
import { BACKGROUND_PRESETS } from "../lib/handwriting/background-library.ts";
import { FONT_SLOTS } from "../lib/handwriting/font-library.ts";
import { DEFAULT_RANDOMIZATION } from "../lib/handwriting/randomization.ts";
import { DEFAULT_DOCUMENT_LAYOUT_SETTINGS, type LineLayout, type ProjectState } from "../lib/handwriting/types.ts";
import { deserializeProject, serializeProject } from "../lib/handwriting/serialization.ts";
import { layoutDocumentBlocks } from "../lib/layout/block-layout-engine.ts";
import { createApproximateTextMeasurer } from "../lib/layout/text-measure.ts";
import { V3_SHOWCASE_BLOCKS } from "../lib/demo/v3-showcase-fixture.ts";
import { recordingCanvas } from "./recording-canvas.ts";
import { validateDocumentCoverage } from "../lib/layout/coverage.ts";

function options(lines: LineLayout[], source: string): RenderOptions {
  return { page: { pageId: "p", pageIndex: 0, templateId: "no-template-a4", pageTemplateId: null,
    widthMm: 210, heightMm: 297, lines, backgroundId: BACKGROUND_PRESETS[0].id,
    backgroundAdjustments: { brightness: 100, contrast: 100, saturation: 100, blur: 0, noise: 0, rotation: 0 },
    backgroundTransform: { fitMode: "cover", scale: 1, offsetX: 0, offsetY: 0 } },
    pageCount: 1, font: FONT_SLOTS[0], background: BACKGROUND_PRESETS[0], seed: "1001", documentId: "test",
    handwriting: { preset: "natural", naturality: 52, randomization: DEFAULT_RANDOMIZATION, inkColor: "#163d64", fixed: true },
    fieldTextById: { block: source } };
}
const line: LineLayout = { id: "row", pageId: "p", fieldId: "block", label: "", text: "",
  startIndex: 0, endIndex: 0, autoX: 50, autoY: 80, manualOffsetX: 0, manualOffsetY: 0,
  rotation: 0, fontSize: 17, letterSpacing: 1, lineHeight: 35, fontId: FONT_SLOTS[0].id, locked: false,
  visualKind: "table", columnWidths: [240, 240] };

test("actual fillText retains final characters in columns, multiple rows and Unicode", () => {
  const source = "性别：男入院：09:40\n记录：10:30可靠：可靠𠮷";
  const mapped = mapSourceCharacters([
    { ...line, text: "性别：男\t入院：09:40" },
    { ...line, id: "row2", text: "记录：10:30\t可靠：可靠𠮷", startIndex: 17 },
  ], source);
  const { context, glyphs } = recordingCanvas();
  renderTextLayer(context, options(mapped, source));
  assert.equal(glyphs.join(""), source.replace(/\s/gu, ""));
  assert.equal(mapped[1].sourceCharacterIndices.at(-1), Array.from(source).length - 1);
});

test("separator changes preserve original character indices and moving pages cannot alter them", () => {
  const source = "甲乙丙丁";
  const two = mapSourceCharacters([{ text: "甲\t乙" }, { text: "丙\t丁" }], source);
  const one = mapSourceCharacters([{ text: "甲乙丙丁" }], source);
  assert.deepEqual(two.flatMap((item) => item.sourceCharacterIndices).filter((index) => index >= 0), one[0].sourceCharacterIndices);
  assert.deepEqual(mapSourceCharacters([{ ...line, text: "甲乙丙丁", autoY: 500, pageId: "other" }], source)[0].sourceCharacterIndices,
    one[0].sourceCharacterIndices);
});

test("missing or corrupt drawing states fail loudly instead of reporting a successful partial render", () => {
  assert.throws(() => renderTextLayer(recordingCanvas().context, options([{ ...line, text: "甲乙" }], "甲")), /字迹状态/);
  assert.throws(() => renderTextLayer(recordingCanvas().context, options([{ ...line, text: "甲乙", sourceCharacterIndices: [0] }], "甲乙")), /字迹索引/);
  assert.throws(() => mapSourceCharacters([{ text: "甲丙" }], "甲乙"), /与原文不一致/);
});

test("old V3 projects acquire source indices without changing manual layout or seed", () => {
  const blocks = V3_SHOWCASE_BLOCKS;
  const pages = layoutDocumentBlocks({ documentId: "old-v3", blocks, measurer: createApproximateTextMeasurer(),
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, settings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    backgroundId: BACKGROUND_PRESETS[0].id, mode: "preserve-structure" }).pages;
  for (const page of pages) for (const item of page.lines) delete item.sourceCharacterIndices;
  pages[1].lines[0].manualOffsetX = 31;
  const project: ProjectState = { schemaVersion: 3, projectVersion: "3.0.0", id: "old-v3", document: { id: "old-v3", name: "demo", rawTexts: [], sourceCharacterCount: 0 },
    layoutMode: "no-template", noTemplateMode: "preserve-structure", templateId: null, documentBlocks: blocks,
    mappedBlockIds: [], unmappedBlockIds: [], explicitlyIgnoredBlockIds: [], documentLayoutSettings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    seed: "1001", selectedFontId: FONT_SLOTS[0].id, fieldMappings: [], pages, handwriting: options([], "").handwriting,
    exportSettings: { pageSize: "A4", dpi: 300, format: "png", jpgQuality: .9 }, updatedAt: "" };
  const restored = deserializeProject(serializeProject(project));
  assert.equal(restored.pages[1].lines[0].manualOffsetX, 31);
  assert.equal(restored.seed, "1001");
  assert.deepEqual(restored.pages.map((page) => page.pageId), pages.map((page) => page.pageId));
  assert.ok(restored.pages.every((page) => page.lines.every((item) => item.sourceCharacterIndices?.length === Array.from(item.text).length)));
  const damaged = structuredClone(restored.pages);
  damaged[0].lines[0].sourceCharacterIndices![0] = 999999;
  assert.equal(validateDocumentCoverage([], damaged, { blocks }).valid, false);
});
