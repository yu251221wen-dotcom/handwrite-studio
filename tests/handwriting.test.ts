import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { BACKGROUND_PRESETS } from "../lib/handwriting/background-library.ts";
import { A4_PIXELS, characterStateKey, type RenderOptions } from "../lib/handwriting/canvas-renderer.ts";
import { FONT_SLOTS } from "../lib/handwriting/font-library.ts";
import { DEFAULT_RANDOMIZATION, generateCharacterStates } from "../lib/handwriting/randomization.ts";
import { deserializeProject, serializeProject } from "../lib/handwriting/serialization.ts";
import { nextSeed } from "../lib/handwriting/seeded-random.ts";
import { DEFAULT_DOCUMENT_LAYOUT_SETTINGS, type FieldMapping, type LineLayout, type ProjectState, type ProjectStateV2 } from "../lib/handwriting/types.ts";
import { commitHistory, createHistory, redoHistory, undoHistory } from "../lib/history/history-store.ts";
import { V3_SHOWCASE_BLOCKS, V3_SHOWCASE_FIELDS } from "../lib/demo/v3-showcase-fixture.ts";
import { layoutDocumentBlocks } from "../lib/layout/block-layout-engine.ts";
import { validateDocumentCoverage } from "../lib/layout/coverage.ts";
import { layoutDocument } from "../lib/layout/layout-engine.ts";
import { breakTextByWidth } from "../lib/layout/line-breaker.ts";
import { layoutProjectPages } from "../lib/layout/project-layout.ts";
import { createApproximateTextMeasurer } from "../lib/layout/text-measure.ts";
import { DEFAULT_A4_TEMPLATE } from "../lib/layout/types.ts";
import { addBlankPage, deletePageContent, duplicatePage, inspectPageDeletion, movePage } from "../lib/pages/page-manager.ts";

const measurer = createApproximateTextMeasurer();
const field = (value: string, id = "present_illness"): FieldMapping => ({ id, label: "现病史", value, sourceText: value, confidence: 1, confirmed: true, role: "body" });
const layout = (fields: FieldMapping[]) => layoutDocument({ documentId: "doc-1", fields, measurer, template: DEFAULT_A4_TEMPLATE,
  fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, fontSize: 17, letterSpacing: 1.1, backgroundId: BACKGROUND_PRESETS[0].id });

test("same seed reproduces states and a different seed changes them", () => {
  const text = "患者因腹痛三天入院，精神尚可。";
  assert.deepEqual(generateCharacterStates(text, "1001", DEFAULT_RANDOMIZATION, 52), generateCharacterStates(text, "1001", DEFAULT_RANDOMIZATION, 52));
  assert.notDeepEqual(generateCharacterStates(text, "1001", DEFAULT_RANDOMIZATION, 52), generateCharacterStates(text, "2002", DEFAULT_RANDOMIZATION, 52));
});

test("naturality zero is clean and punctuation is restrained", () => {
  const clean = generateCharacterStates("中文标点，。", "3003", DEFAULT_RANDOMIZATION, 0);
  for (const state of clean) assert.deepEqual([state.offsetX, state.offsetY, state.rotation, state.baselineOffset, state.opacity], [0, 0, 0, 0, 1]);
  const text = "患者腹痛三天，伴恶心、乏力。";
  const expressive = generateCharacterStates(text, "1001", DEFAULT_RANDOMIZATION, 100);
  const punctuation = expressive.filter((item) => "，、。".includes(item.character));
  const normal = expressive.filter((item) => !"，、。".includes(item.character));
  const avg = (items: typeof expressive) => items.reduce((sum, item) => sum + Math.abs(item.rotation), 0) / items.length;
  assert.ok(avg(punctuation) < avg(normal));
});

test("line breaking is width-based and obeys common Chinese punctuation rules", () => {
  const lines = breakTextByWidth("患者腹痛（三天），伴恶心。继续观察。", 100, measurer, { fontFamily: "serif", fontSize: 17, letterSpacing: 1 });
  assert.equal(lines.map((line) => line.text).join(""), "患者腹痛（三天），伴恶心。继续观察。");
  assert.deepEqual(lines.map((line) => line.startIndex), lines.map((_, index) => index === 0 ? 0 : lines[index - 1].endIndex));
  assert.ok(lines.every((line) => !"，。！？；：、）》】".includes(line.text[0] ?? "")));
  assert.ok(lines.every((line) => !"（《【“‘".includes(line.text.at(-1) ?? "")));
});

test("3000 and 5000 characters paginate without silent loss", () => {
  for (const count of [3000, 5000]) {
    const text = "患者舌淡苔薄脉弦治疗以疏肝理气健脾和胃为法。".repeat(320).slice(0, count);
    const result = layout([field(text)]); const coverage = validateDocumentCoverage([field(text)], result.pages);
    assert.ok(result.pages.length > 1); assert.equal(coverage.sourceCharacterCount, count + 4); assert.equal(coverage.laidOutCharacterCount, count + 4); assert.ok(coverage.valid);
  }
});

test("a field crossing pages only has its label on the first line", () => {
  const result = layout([field("持续观察病情变化。".repeat(200))]);
  const lines = result.pages.flatMap((page) => page.lines);
  assert.ok(result.pages.length >= 2); assert.equal(lines.filter((line) => line.label === "现病史").length, 1);
});

test("manual line offsets survive re-pagination and state key ignores page and coordinates", () => {
  const initial = layout([field("观察病情变化。".repeat(80))]); const line = initial.lines[5];
  line.manualOffsetX = 33; line.manualOffsetY = -12;
  const second = layoutDocument({ documentId: "doc-1", fields: [field("观察病情变化。".repeat(80))], measurer, template: DEFAULT_A4_TEMPLATE,
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, fontSize: 17, letterSpacing: 1.1, backgroundId: BACKGROUND_PRESETS[3].id, previousPages: initial.pages });
  const restored = second.lines.find((item) => item.id === line.id)!;
  assert.equal(restored.manualOffsetX, 33); assert.equal(restored.manualOffsetY, -12);
  const options: RenderOptions = { page: initial.pages[0], pageCount: initial.pages.length, font: FONT_SLOTS[0], background: BACKGROUND_PRESETS[0],
    handwriting: { preset: "natural", naturality: 52, randomization: DEFAULT_RANDOMIZATION, inkColor: "#173f64", fixed: true }, seed: "1001", documentId: "doc-1" };
  const moved: LineLayout = { ...line, pageId: "another-page", autoX: 400, autoY: 700, manualOffsetX: -10, manualOffsetY: 9 };
  assert.equal(characterStateKey(line, options), characterStateKey(moved, { ...options, page: { ...options.page, backgroundId: BACKGROUND_PRESETS[10].id } }));
});

test("history undo and redo cover seed and manual position changes", () => {
  let history = createHistory({ seed: "1001", x: 0 });
  history = commitHistory(history, { seed: "2002", x: 0 }); history = commitHistory(history, { seed: "2002", x: 40 });
  history = undoHistory(history); assert.deepEqual(history.present, { seed: "2002", x: 0 });
  history = undoHistory(history); assert.deepEqual(history.present, { seed: "1001", x: 0 });
  history = redoHistory(history); assert.deepEqual(history.present, { seed: "2002", x: 0 });
});

test("V2 and V1 projects migrate to V3; V3 serialization preserves offsets", () => {
  const result = layout([field("病情平稳。".repeat(220))]);
  assert.ok(result.pages.length >= 2);
  result.pages[1].lines[0].manualOffsetX = 22;
  result.pages[1].lines[0].manualOffsetY = -9;
  const project: ProjectStateV2 = { schemaVersion: 2, projectVersion: "2.0.0", id: "test", document: { id: "doc", name: "test.docx", rawTexts: [], sourceCharacterCount: 400 },
    seed: "1001", selectedFontId: FONT_SLOTS[0].id, fieldMappings: [field("病情平稳。".repeat(80))], pages: result.pages,
    handwriting: { preset: "natural", naturality: 52, randomization: DEFAULT_RANDOMIZATION, inkColor: "#173f64", fixed: true },
    exportSettings: { pageSize: "A4", dpi: 300, format: "png", jpgQuality: 0.9 }, updatedAt: new Date().toISOString() };
  const restored = deserializeProject(JSON.stringify(project)); assert.equal(restored.seed, "1001");
  assert.equal(restored.schemaVersion, 3); assert.equal(deserializeProject(serializeProject(restored)).schemaVersion, 3);
  assert.equal(restored.layoutMode, "no-template"); assert.equal(restored.templateId, null);
  assert.deepEqual(restored.mappedBlockIds, []); assert.deepEqual(restored.unmappedBlockIds, []);
  assert.equal(restored.pages[1].lines[0].manualOffsetX, 22); assert.equal(restored.pages[1].lines[0].manualOffsetY, -9);
  const legacy = deserializeProject(JSON.stringify({ schemaVersion: 1, id: "old", documentName: "old.docx", documentFingerprint: "abc", seed: "9", selectedFontId: FONT_SLOTS[0].id,
    selectedBackgroundId: BACKGROUND_PRESETS[0].id, background: BACKGROUND_PRESETS[0], handwriting: project.handwriting,
    lines: [{ id: "x", label: "主诉", text: "头痛", x: 61, y: 320 }], updatedAt: project.updatedAt }));
  assert.equal(legacy.schemaVersion, 3); assert.equal(legacy.pages.length, 1);
});

test("no-template preserve structure creates every block kind with missing zero", () => {
  const result = layoutDocumentBlocks({ documentId: "v3", blocks: V3_SHOWCASE_BLOCKS, measurer,
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, settings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    backgroundId: BACKGROUND_PRESETS[0].id, mode: "preserve-structure" });
  const coverage = validateDocumentCoverage(V3_SHOWCASE_FIELDS, result.pages, { blocks: V3_SHOWCASE_BLOCKS });
  assert.ok(result.pages.length >= 2); assert.ok(coverage.valid); assert.equal(coverage.missingCharacters, 0);
  const kinds = new Set(result.lines.map((line) => line.blockType));
  for (const kind of ["heading", "paragraph", "key-value", "table", "prescription", "signature"]) assert.ok(kinds.has(kind as never));
  assert.ok(result.lines.some((line) => line.visualKind === "table"));
  assert.ok(result.lines.some((line) => line.blockType === "prescription" && line.text.includes("\t")));
});

test("simplified mode preserves source while weakening tables and columns", () => {
  const result = layoutDocumentBlocks({ documentId: "v3", blocks: V3_SHOWCASE_BLOCKS, measurer,
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, settings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    backgroundId: BACKGROUND_PRESETS[0].id, mode: "simplified" });
  const coverage = validateDocumentCoverage([], result.pages, { blocks: V3_SHOWCASE_BLOCKS });
  assert.ok(coverage.valid); assert.equal(coverage.missingCharacters, 0);
  assert.equal(result.lines.filter((line) => line.blockType === "table").every((line) => line.visualKind === "text"), true);
});

test("legacy template mode cannot reactivate the production template layout path", () => {
  const base: ProjectState = { schemaVersion: 3, projectVersion: "3.1.0", id: "mode-switch",
    document: { id: "v3", name: "demo.docx", rawTexts: V3_SHOWCASE_BLOCKS.map((block) => block.sourceText), sourceCharacterCount: 1 },
    layoutMode: "no-template", noTemplateMode: "preserve-structure", templateId: null, documentBlocks: V3_SHOWCASE_BLOCKS,
    mappedBlockIds: [], unmappedBlockIds: [], explicitlyIgnoredBlockIds: [],
    documentLayoutSettings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS, seed: "1001", selectedFontId: FONT_SLOTS[0].id,
    fieldMappings: V3_SHOWCASE_FIELDS, pages: [], handwriting: { preset: "natural", naturality: 52, randomization: DEFAULT_RANDOMIZATION,
      inkColor: "#173f64", fixed: true }, exportSettings: { pageSize: "A4", dpi: 300, format: "png", jpgQuality: 0.9 }, updatedAt: new Date().toISOString() };
  const noTemplatePages = layoutProjectPages(base, measurer, FONT_SLOTS[0]);
  assert.ok(noTemplatePages.every((page) => page.pageTemplateId === null));
  const legacyFlagPages = layoutProjectPages({ ...base, layoutMode: "template", pages: noTemplatePages }, measurer, FONT_SLOTS[0]);
  assert.ok(legacyFlagPages.every((page) => page.pageTemplateId === null));
  assert.deepEqual(legacyFlagPages.map((page) => page.lines.map((line) => line.text)), noTemplatePages.map((page) => page.lines.map((line) => line.text)));
});

test("block paginator keeps headings with following content and splits long paragraphs", () => {
  const result = layoutDocumentBlocks({ documentId: "v3", blocks: V3_SHOWCASE_BLOCKS, measurer,
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, settings: { ...DEFAULT_DOCUMENT_LAYOUT_SETTINGS, marginBottom: 140 },
    backgroundId: BACKGROUND_PRESETS[0].id, mode: "preserve-structure" });
  assert.ok(result.pages.length >= 3);
  for (const page of result.pages) {
    const last = page.lines.at(-1); assert.notEqual(last?.blockType, "heading");
  }
  assert.ok(new Set(result.lines.filter((line) => line.blockId === "demo-present").map((line) => line.pageId)).size > 1);
});

test("table rows and prescription items stay atomic", () => {
  const result = layoutDocumentBlocks({ documentId: "v3", blocks: V3_SHOWCASE_BLOCKS.filter((block) => block.type === "table" || block.type === "prescription"), measurer,
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, settings: { ...DEFAULT_DOCUMENT_LAYOUT_SETTINGS, marginTop: 300, marginBottom: 300 },
    backgroundId: BACKGROUND_PRESETS[0].id, mode: "preserve-structure" });
  const tableLines = result.lines.filter((line) => line.blockType === "table");
  assert.equal(tableLines.length, 5); assert.ok(tableLines.every((line) => line.rowIndex !== undefined));
  const prescriptions = result.lines.filter((line) => line.blockType === "prescription");
  assert.ok(prescriptions.every((line) => line.text.split("\t").every((item) => /\d+g$/.test(item))));
});

test("explicitly ignored blocks are excluded without becoming missing", () => {
  const ignored = V3_SHOWCASE_BLOCKS.at(-1)!;
  const active = V3_SHOWCASE_BLOCKS.slice(0, -1);
  const result = layoutDocumentBlocks({ documentId: "v3", blocks: active, measurer,
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, settings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    backgroundId: BACKGROUND_PRESETS[0].id, mode: "preserve-structure" });
  const coverage = validateDocumentCoverage([], result.pages, { blocks: V3_SHOWCASE_BLOCKS, ignoredBlockIds: [ignored.blockId] });
  assert.ok(coverage.valid); assert.equal(coverage.missingCharacters, 0); assert.ok(coverage.explicitlyIgnoredCharacters > 0);
});

test("page add duplicate reorder delete protection and undo are functional", () => {
  const initial = layoutDocumentBlocks({ documentId: "v3", blocks: V3_SHOWCASE_BLOCKS, measurer,
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, settings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    backgroundId: BACKGROUND_PRESETS[0].id, mode: "preserve-structure" }).pages;
  const added = addBlankPage(initial); assert.equal(added.length, initial.length + 1); assert.equal(added.at(-1)?.pageType, "blank");
  const duplicated = duplicatePage(added, initial[0].pageId); assert.equal(duplicated.length, added.length + 1); assert.equal(duplicated[1].pageType, "custom");
  const moved = movePage(duplicated, duplicated[1].pageId, duplicated.length - 1); assert.equal(moved.at(-1)?.pageId, duplicated[1].pageId);
  assert.equal(inspectPageDeletion(initial, initial[0].pageId).protected, true);
  const deleted = deletePageContent(added, added.at(-1)!.pageId); assert.equal(deleted.length, initial.length);
  let history = createHistory(initial); history = commitHistory(history, deleted); history = undoHistory(history); assert.deepEqual(history.present, initial);
});

test("V3 project save and reopen preserves page two manual offsets", () => {
  const result = layoutDocumentBlocks({ documentId: "v3", blocks: V3_SHOWCASE_BLOCKS, measurer,
    fontId: FONT_SLOTS[0].id, fontFamily: FONT_SLOTS[0].family, settings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    backgroundId: BACKGROUND_PRESETS[0].id, mode: "preserve-structure" });
  result.pages[1].lines[0].manualOffsetX = 19;
  const state: ProjectState = { schemaVersion: 3, projectVersion: "3.1.0", id: "v3", document: { id: "v3", name: "demo.docx", rawTexts: V3_SHOWCASE_BLOCKS.map((block) => block.sourceText), sourceCharacterCount: 1 },
    layoutMode: "no-template", noTemplateMode: "preserve-structure", templateId: null, documentBlocks: V3_SHOWCASE_BLOCKS,
    mappedBlockIds: [], unmappedBlockIds: [], explicitlyIgnoredBlockIds: [], documentLayoutSettings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    seed: "1001", selectedFontId: FONT_SLOTS[0].id, fieldMappings: [], pages: result.pages,
    handwriting: { preset: "natural", naturality: 52, randomization: DEFAULT_RANDOMIZATION, inkColor: "#173f64", fixed: true }, exportSettings: { pageSize: "A4", dpi: 300, format: "png", jpgQuality: 0.9 }, updatedAt: new Date().toISOString() };
  assert.equal(deserializeProject(serializeProject(state)).pages[1].lines[0].manualOffsetX, 19);
});

test("A4 export dimensions are exact", () => {
  assert.deepEqual(A4_PIXELS[150], { width: 1240, height: 1754 }); assert.deepEqual(A4_PIXELS[300], { width: 2480, height: 3508 }); assert.deepEqual(A4_PIXELS[600], { width: 4961, height: 7016 });
});

test("asset positions are distinct and 5000 states stay interactive", () => {
  assert.equal(new Set(FONT_SLOTS.map((entry) => entry.id)).size, 30); assert.equal(new Set(BACKGROUND_PRESETS.map((entry) => entry.id)).size, 30);
  const text = "患者舌淡苔薄脉弦治疗以疏肝理气健脾和胃为法。".repeat(250).slice(0, 5000); const started = performance.now();
  assert.equal(generateCharacterStates(text, nextSeed("1001"), DEFAULT_RANDOMIZATION, 84).length, 5000);
  assert.ok(performance.now() - started < 500);
});
