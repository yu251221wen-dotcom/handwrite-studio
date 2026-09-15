import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { FONT_SLOTS } from "../lib/handwriting/font-library.ts";
import { DEFAULT_RANDOMIZATION } from "../lib/handwriting/randomization.ts";
import { DEFAULT_DOCUMENT_LAYOUT_SETTINGS, type DocumentBlock, type ProjectState } from "../lib/handwriting/types.ts";
import { validateDocumentCoverage } from "../lib/layout/coverage.ts";
import { layoutProjectPages } from "../lib/layout/project-layout.ts";
import { createApproximateTextMeasurer } from "../lib/layout/text-measure.ts";
import { renderTextLayer } from "../lib/handwriting/canvas-renderer.ts";
import { BACKGROUND_PRESETS } from "../lib/handwriting/background-library.ts";
import { recordingCanvas } from "./recording-canvas.ts";
import { DEFAULT_LINE_DETECTION, normalizeLineDetection } from "../lib/background/line-detection.ts";

const goldenFixture = "tests/fixtures/cardiology-inpatient-record.docx";

test("Golden DOCX actual rendered text coverage, supported modes, and deletion detection", {
  skip: !existsSync(goldenFixture) ? "private Golden fixture is not included in hosted source repositories" : false,
}, () => {
  const python = process.env.TEST_PYTHON ?? (process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  assert.ok(existsSync(python), "Create .venv and install server/requirements.txt before the cross-language Golden test");
  const started = performance.now();
  const parsed = spawnSync(python, ["-c", `import json; from pathlib import Path; from server.modules.document_parser import parse_docx; p=Path('${goldenFixture}'); d=parse_docx(p.read_bytes(),p.name); print(json.dumps({'document':d}))`], { encoding: "utf8" });
  assert.equal(parsed.status, 0, parsed.stderr);
  const result = JSON.parse(parsed.stdout) as { document: { blocks: DocumentBlock[]; rawCharacterCount: number; blockCounts: Record<string, number> } };
  const parseMs = performance.now() - started;
  const blocks = result.document.blocks;
  const base: ProjectState = { schemaVersion: 3, projectVersion: "3.1.0", id: "golden", document: { id: "golden", name: "cardiology-inpatient-record.docx", rawTexts: blocks.map((b) => b.sourceText), sourceCharacterCount: result.document.rawCharacterCount },
    layoutMode: "no-template", noTemplateMode: "preserve-structure", templateId: null, documentBlocks: blocks,
    mappedBlockIds: [], unmappedBlockIds: [], explicitlyIgnoredBlockIds: [], documentLayoutSettings: DEFAULT_DOCUMENT_LAYOUT_SETTINGS,
    seed: "1001", selectedFontId: FONT_SLOTS[0].id, fieldMappings: [], pages: [], handwriting: { preset: "natural", naturality: 52, randomization: DEFAULT_RANDOMIZATION, inkColor: "#163d64", fixed: false },
    exportSettings: { pageSize: "A4", dpi: 300, format: "png", jpgQuality: 0.9 }, updatedAt: "2026-09-13T00:00:00Z" };
  for (const mode of ["preserve-structure", "simplified"] as const) {
    const state = { ...base, noTemplateMode: mode };
    const begin = performance.now();
    const pages = layoutProjectPages(state, createApproximateTextMeasurer(), FONT_SLOTS[0]);
    const layoutMs = performance.now() - begin;
    const coverage = validateDocumentCoverage([], pages, { blocks });
    assert.equal(coverage.valid, true, JSON.stringify(coverage));
    assert.equal(coverage.laidOutCharacterCount, result.document.rawCharacterCount);
    assert.equal(coverage.missingCharacters, 0);
    assert.ok(pages.length >= 3);
    const fieldTextById = Object.fromEntries([
      ...blocks.map((block) => [block.blockId, block.sourceText]),
    ]);
    for (const page of pages) {
      const { context, glyphs } = recordingCanvas();
      renderTextLayer(context, { page, pageCount: pages.length, font: FONT_SLOTS[0], background: BACKGROUND_PRESETS[0],
        handwriting: base.handwriting, seed: base.seed, documentId: base.document.id, fieldTextById });
      assert.equal(glyphs.join("").replace(/\s/gu, ""), page.lines.map((line) => line.text).join("").replace(/\s/gu, ""),
        `${mode}, page ${page.pageIndex}: fillText must draw every laid-out character`);
    }
    console.log(JSON.stringify({ mode, raw: result.document.rawCharacterCount, laidOut: coverage.laidOutCharacterCount, blocks: result.document.blockCounts, blockCount: blocks.length, pages: pages.length, missing: coverage.missingCharacters, parseProcessMs: +parseMs.toFixed(2), layoutAndPaginationMs: +layoutMs.toFixed(2) }));
    assert.equal(validateDocumentCoverage([], [], { blocks }).valid, false);
    if (mode === "preserve-structure") {
      const copy = structuredClone(pages);
      const tablePage = copy.find((p) => p.lines.some((l) => l.blockType === "table"))!;
      const row = tablePage.lines.findIndex((l) => l.blockType === "table" && l.rowIndex === 2);
      tablePage.lines.splice(row, 1);
      assert.equal(validateDocumentCoverage([], copy, { blocks }).valid, false);
    }
  }

  const ruledDetection = normalizeLineDetection({ ...DEFAULT_LINE_DETECTION, enabled: true, snapEnabled: true,
    source: "detected", lineY: Array.from({ length: 22 }, (_, index) => 72 + index * 32), averageSpacing: 32,
    firstUsableLine: 1, lastUsableLine: 20, writableLeft: 66, writableRight: 522, offsetY: -2 });
  const ruledState: ProjectState = { ...base, pages: [{
    pageId: "page-1", pageIndex: 0, templateId: "no-template-a4", pageType: "first", pageTemplateId: null,
    widthMm: 210, heightMm: 297, backgroundId: "golden-ruled",
    backgroundAdjustments: { brightness: 100, contrast: 100, saturation: 100, blur: 0, noise: 0, rotation: 0 },
    backgroundTransform: { fitMode: "cover", scale: 1, offsetX: 0, offsetY: 0 },
    lineDetection: ruledDetection, blockIds: [], lines: [],
  }] };
  const ruledPages = layoutProjectPages(ruledState, createApproximateTextMeasurer(), FONT_SLOTS[0]);
  const ruledCoverage = validateDocumentCoverage([], ruledPages, { blocks });
  assert.equal(ruledCoverage.missingCharacters, 0);
  assert.ok(ruledPages.length >= 3);
  for (const page of ruledPages) {
    assert.ok(page.lines.length <= 20);
    const assignments = page.lines.map((line) => line.assignedPaperLineIndex);
    assert.equal(new Set(assignments).size, assignments.length);
    assert.ok(assignments.every((index) => index !== undefined && index >= 1 && index <= 20));
  }
  console.log(JSON.stringify({ mode: "background-aware", raw: result.document.rawCharacterCount,
    laidOut: ruledCoverage.laidOutCharacterCount, pages: ruledPages.length, usableLinesPerPage: 20,
    missing: ruledCoverage.missingCharacters }));
});
