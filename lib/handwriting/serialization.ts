import { DEFAULT_BACKGROUND_ADJUSTMENTS } from "./background-library.ts";
import { DEFAULT_DOCUMENT_LAYOUT_SETTINGS } from "./types.ts";
import type { DocumentBlock, FieldMapping, LineLayout, ProjectState, ProjectStateV1, ProjectStateV2 } from "./types.ts";
import { mapSourceCharacters } from "./source-character-map.ts";
import { applyLineSnapping, DEFAULT_LINE_DETECTION, normalizeLineDetection } from "../background/line-detection.ts";
import { normalizeCorrectionStyle } from "./correction-style.ts";
import { normalizeInkStyle } from "./ink-style.ts";

export function serializeProject(state: ProjectState): string {
  return JSON.stringify(disableLegacyTemplateState({ ...state, updatedAt: new Date().toISOString() }), null, 2);
}

function disableLegacyTemplateState(state: ProjectState): ProjectState {
  return {
    ...state,
    projectVersion: "4.2.0",
    layoutMode: "no-template",
    templateId: null,
    mappedBlockIds: [],
    unmappedBlockIds: [],
    inkStyle: normalizeInkStyle(state.inkStyle, state.handwriting.inkColor),
    correctionStyle: normalizeCorrectionStyle(state.correctionStyle),
    footerMode: state.footerMode ?? "auto",
    pages: state.pages.map((page) => applyLineSnapping(page, normalizeLineDetection(page.lineDetection ?? DEFAULT_LINE_DETECTION))),
  };
}

function fingerprintValue(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function documentFingerprint(value: FieldMapping[] | LineLayout[]): string {
  return fingerprintValue(value.map((item) => `${item.id}:${"label" in item ? item.label : ""}:${"value" in item ? item.value : item.text}`).join("|"));
}

export function documentBlockFingerprint(blocks: DocumentBlock[]): string {
  return fingerprintValue(blocks.map((block) => `${block.blockId}:${block.sourceText}`).join("|"));
}

export function migrateProjectV1(old: ProjectStateV1): ProjectStateV2 {
  const fields = old.lines.map((line, index): FieldMapping => ({
    id: `legacy-${index}`, label: line.label, value: line.text, sourceText: line.text,
    confidence: 1, confirmed: true, role: "body",
  }));
  const pageId = "page-1";
  const lines: LineLayout[] = old.lines.map((line, index) => ({
    id: `legacy-${index}:0`, pageId, fieldId: `legacy-${index}`, label: line.label, text: line.text,
    startIndex: 0, endIndex: Array.from(`${line.label ? `${line.label}：` : ""}${line.text}`).length,
    autoX: line.x, autoY: line.y, manualOffsetX: 0, manualOffsetY: 0,
    rotation: line.rotation ?? 0, fontSize: line.fontSize ?? 17, letterSpacing: line.letterSpacing ?? 1.1,
    lineHeight: line.lineHeight ?? 40, fontId: line.fontId ?? old.selectedFontId, locked: line.locked ?? false,
  }));
  return {
    schemaVersion: 2, projectVersion: "2.0.0", id: old.id,
    document: { id: old.documentFingerprint || fingerprintValue(old.documentName), name: old.documentName,
      rawTexts: old.lines.map((line) => line.text), sourceCharacterCount: old.lines.reduce((sum, line) => sum + Array.from(line.text).length, 0) },
    seed: old.seed, selectedFontId: old.selectedFontId, fieldMappings: fields,
    pages: [{ pageId, pageIndex: 0, templateId: "tcm-inpatient-first-v2", widthMm: 210, heightMm: 297,
      backgroundId: old.selectedBackgroundId, backgroundAdjustments: old.background ?? { ...DEFAULT_BACKGROUND_ADJUSTMENTS },
      backgroundTransform: { fitMode: "cover", scale: 1, offsetX: 0, offsetY: 0 },
      lineDetection: { ...DEFAULT_LINE_DETECTION }, lines }],
    handwriting: old.handwriting, exportSettings: { pageSize: "A4", dpi: 300, format: "png", jpgQuality: 0.9 },
    updatedAt: old.updatedAt,
  };
}

export function migrateProjectV2(old: ProjectStateV2): ProjectState {
  const documentBlocks: DocumentBlock[] = old.fieldMappings.filter((field) => field.value).map((field, sourceOrder) => {
    const sourceText = `${field.label ? `${field.label}：` : ""}${field.value}`;
    return {
      blockId: `v2-field-${field.id}`, type: "paragraph", sourceOrder, sourceStart: 0,
      sourceEnd: Array.from(sourceText).length, sourceText, label: field.label || undefined,
      content: field.value, firstLineIndent: 0, lineHeight: 34, paragraphSpacing: 8,
      keepWithNext: false, allowSplit: true,
    };
  });
  const blockByField = new Map(old.fieldMappings.map((field) => [field.id, `v2-field-${field.id}`]));
  return {
    ...old, schemaVersion: 3, projectVersion: "4.2.0", layoutMode: "no-template",
    noTemplateMode: "preserve-structure", templateId: null, documentBlocks,
    mappedBlockIds: [], unmappedBlockIds: [],
    explicitlyIgnoredBlockIds: [], documentLayoutSettings: { ...DEFAULT_DOCUMENT_LAYOUT_SETTINGS },
    inkStyle: normalizeInkStyle(undefined, old.handwriting.inkColor), correctionStyle: normalizeCorrectionStyle(), footerMode: "auto",
    fieldMappings: old.fieldMappings.map((field) => ({ ...field, sourceBlockIds: field.sourceBlockIds ?? [blockByField.get(field.id)!] })),
    pages: old.pages.map((page, pageIndex) => ({ ...page, pageIndex,
      pageType: pageIndex === 0 ? "first" : "continuation", pageTemplateId: page.templateId,
      lineDetection: normalizeLineDetection(page.lineDetection ?? DEFAULT_LINE_DETECTION),
      blockIds: [...new Set(page.lines.map((line) => blockByField.get(line.fieldId)).filter((value): value is string => Boolean(value)))],
      lines: page.lines.map((line) => ({ ...line, blockId: blockByField.get(line.fieldId), blockType: "paragraph", visualKind: "text" })),
    })),
  };
}

export function deserializeProject(value: string): ProjectState {
  const parsed = JSON.parse(value) as ProjectState | ProjectStateV2 | ProjectStateV1;
  if (parsed.schemaVersion === 1) return migrateProjectV2(migrateProjectV1(parsed));
  if (parsed.schemaVersion === 2) return migrateProjectV2(parsed);
  if (parsed.schemaVersion !== 3 || !Array.isArray(parsed.pages) || !Array.isArray(parsed.fieldMappings) ||
      !Array.isArray(parsed.documentBlocks) || typeof parsed.seed !== "string") {
    throw new Error("项目文件格式无效");
  }
  // Upgrade old V3 saves without re-layout: retain page IDs, manual offsets and seed.
  const replacements = new Map<LineLayout, LineLayout>();
  for (const block of parsed.documentBlocks) {
    const lines = parsed.pages.flatMap((page) => page.lines).filter((line) => line.fieldId === block.blockId);
    if (!lines.some((line) => !line.sourceCharacterIndices)) continue;
    const byPosition = new Map<string, LineLayout>();
    const position = (line: LineLayout) => `${line.startIndex}:${line.text}`;
    for (const line of lines) byPosition.set(position(line), line);
    const ordered = [...byPosition.values()].sort((a, b) => a.startIndex - b.startIndex);
    const mapped = new Map(mapSourceCharacters(ordered, block.sourceText).map((line) => [position(line), line.sourceCharacterIndices]));
    for (const line of lines) replacements.set(line, { ...line, sourceCharacterIndices: mapped.get(position(line)) });
  }
  return disableLegacyTemplateState({ ...parsed, pages: parsed.pages.map((page) => ({ ...page, lines: page.lines.map((line) => replacements.get(line) ?? line) })) });
}
