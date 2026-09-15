import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLineSnapping,
  DEFAULT_LINE_DETECTION,
  detectHorizontalLines,
  presetHorizontalLines,
  respaceHorizontalLines,
} from "../lib/background/line-detection.ts";
import { BACKGROUND_PRESETS } from "../lib/handwriting/background-library.ts";
import { characterStateKey, type RenderOptions } from "../lib/handwriting/canvas-renderer.ts";
import { FONT_SLOTS } from "../lib/handwriting/font-library.ts";
import { DEFAULT_RANDOMIZATION } from "../lib/handwriting/randomization.ts";
import { deserializeProject, serializeProject } from "../lib/handwriting/serialization.ts";
import { DEFAULT_DOCUMENT_LAYOUT_SETTINGS, lineY, type LineLayout, type PageState, type ProjectState } from "../lib/handwriting/types.ts";
import { applyFontToPages } from "../lib/layout/project-layout.ts";
import { layoutDocumentBlocks } from "../lib/layout/block-layout-engine.ts";
import { createApproximateTextMeasurer } from "../lib/layout/text-measure.ts";

function syntheticRuled(width: number, height: number, spacing: number, noisy = false, doubleEdge = false) {
  const data = new Uint8ClampedArray(width * height * 4); data.fill(255);
  const pixel = (x: number, y: number, value: number) => {
    const offset = (y * width + x) * 4; data[offset] = value; data[offset + 1] = Math.min(255, value + 18); data[offset + 2] = Math.min(255, value + 28); data[offset + 3] = 255;
  };
  for (let y = spacing; y < height - 4; y += spacing) {
    for (let x = 18; x < width - 18; x += 1) {
      pixel(x, y, 166);
      if (doubleEdge && y + 4 < height) pixel(x, y + 4, 172);
    }
  }
  if (noisy) {
    let state = 712367821;
    for (let index = 0; index < width * height / 35; index += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const x = state % width; state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const y = state % height; pixel(x, y, 105 + state % 90);
    }
  }
  return { data, width, height };
}

const line: LineLayout = {
  id: "line-1", pageId: "page-1", fieldId: "block-1", blockId: "block-1", label: "", text: "横线吸附测试",
  startIndex: 0, endIndex: 6, autoX: 58, autoY: 92, manualOffsetX: 0, manualOffsetY: 7,
  rotation: 0, fontSize: 17, letterSpacing: 1, lineHeight: 34, fontId: FONT_SLOTS[0].id, locked: false,
};
const page: PageState = {
  pageId: "page-1", pageIndex: 0, templateId: "no-template-a4", widthMm: 210, heightMm: 297,
  backgroundId: "ruled-blue-40", backgroundAdjustments: { brightness: 100, contrast: 100, saturation: 100, blur: 0, noise: 0, rotation: 0 },
  backgroundTransform: { fitMode: "cover", scale: 1, offsetX: 0, offsetY: 0 }, lines: [line],
};

test("uniform and noisy horizontal paper lines are detected without OpenCV", () => {
  for (const noisy of [false, true]) {
    const result = detectHorizontalLines(syntheticRuled(595, 842, 42, noisy));
    assert.ok(result.lineY.length >= 17, `expected ruled lines with noisy=${noisy}`);
    assert.ok(Math.abs(result.averageSpacing - 42) <= 1);
    assert.ok(result.confidence >= 0.7);
  }
});

test("plain paper does not falsely enable horizontal snapping", () => {
  const data = new Uint8ClampedArray(595 * 842 * 4); data.fill(255);
  const result = detectHorizontalLines({ data, width: 595, height: 842 });
  assert.deepEqual(result.lineY, []);
  assert.equal(result.confidence, 0);
});

test("two visible edges of one thick rule are merged into one detected line", () => {
  const result = detectHorizontalLines(syntheticRuled(595, 842, 48, true, true));
  const gaps = result.lineY.slice(1).map((value, index) => value - result.lineY[index]);
  assert.ok(result.lineY.length >= 15);
  assert.ok(gaps.every((gap) => gap >= 14), `unexpected duplicate rules: ${result.lineY.join(",")}`);
  assert.ok(Math.abs(result.averageSpacing - 48) <= 1);
});

test("preset ruled paper exposes exact line coordinates and adjustable spacing", () => {
  const asset = BACKGROUND_PRESETS.find((item) => item.id === "ruled-blue-40")!;
  const result = presetHorizontalLines(asset);
  assert.equal(result.averageSpacing, 40);
  assert.deepEqual(result.lineY.slice(0, 3), [40, 80, 120]);
  assert.deepEqual(respaceHorizontalLines(result.lineY, 36).slice(0, 3), [40, 76, 112]);
});

test("snapping preserves manual offsets and cannot alter deterministic handwriting key", () => {
  const detection = { ...DEFAULT_LINE_DETECTION, enabled: true, snapEnabled: true, lineY: [40, 80, 120], averageSpacing: 40, offsetY: -2, confidence: 1, source: "preset" as const };
  const snapped = applyLineSnapping(page, detection);
  assert.equal(snapped.lines[0].manualOffsetY, 7);
  assert.equal(snapped.lines[0].lineSnapOffset, -14);
  assert.equal(lineY(snapped.lines[0]), 85);
  const options: RenderOptions = { page, pageCount: 1, font: FONT_SLOTS[0], background: BACKGROUND_PRESETS[0], seed: "1001", documentId: "doc",
    handwriting: { preset: "natural", naturality: 52, randomization: DEFAULT_RANDOMIZATION, inkColor: "#123", fixed: true } };
  assert.equal(characterStateKey(line, options), characterStateKey(snapped.lines[0], { ...options, page: snapped }));
});

test("applying an uploaded font changes real line font ids without moving line coordinates", () => {
  const updated = applyFontToPages([page], "font-uploaded-test");
  assert.equal(updated[0].lines[0].fontId, "font-uploaded-test");
  assert.equal(updated[0].lines[0].autoX, line.autoX);
  assert.equal(updated[0].lines[0].autoY, line.autoY);
  assert.equal(updated[0].lines[0].manualOffsetY, line.manualOffsetY);
});

test("project JSON restores page-level detection, snapping and manual offset", () => {
  const detection = { ...DEFAULT_LINE_DETECTION, enabled: true, snapEnabled: true, showLines: true, lineY: [40, 80, 120], averageSpacing: 40, offsetY: -2, confidence: 1, source: "manual" as const };
  const snapped = applyLineSnapping(page, detection);
  const project: ProjectState = {
    schemaVersion: 3, projectVersion: "4.0.0", id: "line-project",
    document: { id: "doc", name: "line.docx", rawTexts: [], sourceCharacterCount: 0 },
    layoutMode: "no-template", noTemplateMode: "preserve-structure", templateId: null, documentBlocks: [],
    mappedBlockIds: [], unmappedBlockIds: [], explicitlyIgnoredBlockIds: [], documentLayoutSettings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    seed: "1001", selectedFontId: FONT_SLOTS[0].id, fieldMappings: [], pages: [snapped],
    handwriting: { preset: "natural", naturality: 52, randomization: DEFAULT_RANDOMIZATION, inkColor: "#123", fixed: true },
    exportSettings: { pageSize: "A4", dpi: 300, format: "png", jpgQuality: 0.9 }, updatedAt: "2026-09-15T00:00:00Z",
  };
  const restored = deserializeProject(serializeProject(project));
  assert.deepEqual(restored.pages[0].lineDetection, detection);
  assert.equal(restored.pages[0].lines[0].lineSnapOffset, -14);
  assert.equal(restored.pages[0].lines[0].manualOffsetY, 7);
});

test("list blocks are tightened without compressing paragraph body lines", () => {
  const source = "1. 冠心病\n2. 心律失常";
  const blocks: ProjectState["documentBlocks"] = [
    { blockId: "list", type: "list", sourceOrder: 0, sourceStart: 0, sourceEnd: Array.from(source).length, sourceText: source,
      items: [{ marker: "1.", text: "冠心病", raw: "1. 冠心病" }, { marker: "2.", text: "心律失常", raw: "2. 心律失常" }] },
    { blockId: "paragraph", type: "paragraph", sourceOrder: 1, sourceStart: 0, sourceEnd: 4, sourceText: "普通正文", content: "普通正文",
      firstLineIndent: 0, lineHeight: 34, paragraphSpacing: 8 },
  ];
  const result = layoutDocumentBlocks({ documentId: "spacing", blocks, measurer: createApproximateTextMeasurer(), fontId: FONT_SLOTS[0].id,
    fontFamily: FONT_SLOTS[0].family, settings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS, backgroundId: "white-clean", mode: "preserve-structure" });
  const listLine = result.lines.find((item) => item.blockId === "list")!;
  const paragraphLine = result.lines.find((item) => item.blockId === "paragraph")!;
  assert.equal(listLine.lineHeight, 29);
  assert.equal(paragraphLine.lineHeight, 34);
});
