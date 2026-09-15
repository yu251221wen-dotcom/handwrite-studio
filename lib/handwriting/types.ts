export type HandwritingPreset = "neat" | "natural" | "messy";
export type BackgroundFitMode = "fit" | "cover" | "stretch";
export type ExportFormat = "png" | "jpg" | "pdf";
export type ExportDpi = 150 | 300 | 600;
/** `template` is accepted only while loading legacy V3 JSON and is normalized to `no-template`. */
export type LayoutMode = "no-template" | "template";
export type NoTemplateMode = "preserve-structure" | "simplified";
export type DocumentBlockType = "heading" | "paragraph" | "key-value" | "list" | "table" | "prescription" | "signature";
export type PageType = "first" | "continuation" | "blank" | "custom";

export interface FontAsset {
  id: string; name: string; previewName: string; family: string;
  kind: "system" | "uploaded" | "slot"; enabled: boolean; slot: number;
  fileUrl?: string; filePath?: string; license?: string; loadError?: string;
}

export type BackgroundPattern = "solid" | "ruled" | "grid" | "dots" | "ledger";
export interface BackgroundAsset {
  id: string; name: string; kind: "preset" | "uploaded"; enabled: boolean;
  baseColor: string; pattern: BackgroundPattern; lineColor?: string; spacing?: number;
  marginLine?: boolean; texture?: number; shadow?: number; vignette?: number;
  unevenLight?: number; fileUrl?: string; filePath?: string;
}

export interface BackgroundAdjustments {
  brightness: number; contrast: number; saturation: number; blur: number;
  noise: number; rotation: number;
}
export interface BackgroundTransform {
  fitMode: BackgroundFitMode; scale: number; offsetX: number; offsetY: number;
}

export interface HorizontalLineDetection {
  enabled: boolean; lineY: number[]; averageSpacing: number; confidence: number;
  snapEnabled: boolean; offsetY: number; showLines: boolean;
  source: "none" | "preset" | "detected" | "manual";
}

export interface RandomizationConfig {
  characterOffsetX: number; characterOffsetY: number; characterRotation: number;
  characterScaleX: number; characterScaleY: number; characterFontSizeVariation: number;
  characterBaselineOffset: number; characterOpacityVariation: number; correlation: number;
}
export interface HandwritingStyle {
  preset: HandwritingPreset; naturality: number; randomization: RandomizationConfig;
  inkColor: string; fixed: boolean;
}

export interface FieldMapping {
  id: string; label: string; value: string; sourceText: string; confidence: number;
  confirmed: boolean; role: "patient" | "body";
  sourceBlockIds?: string[];
}

interface DocumentBlockBase {
  blockId: string; type: DocumentBlockType; sourceOrder: number; sourceStart: number;
  sourceEnd: number; sourceText: string; keepWithNext?: boolean; allowSplit?: boolean;
}
export interface HeadingBlock extends DocumentBlockBase {
  type: "heading"; text: string; level: number; alignment: "left" | "center" | "right";
  fontSize: number; fontWeight: number; spacingBefore: number; spacingAfter: number;
  minLinesAfterHeading: number;
}
export interface ParagraphBlock extends DocumentBlockBase {
  type: "paragraph"; label?: string; content: string; firstLineIndent: number;
  lineHeight: number; paragraphSpacing: number;
}
export interface KeyValueItem { key: string; value: string; raw: string }
export interface KeyValueBlock extends DocumentBlockBase {
  type: "key-value"; items: KeyValueItem[]; columns: 1 | 2 | "auto";
}
export interface ListBlock extends DocumentBlockBase {
  type: "list"; items: Array<{ marker: string; text: string; raw: string }>;
}
export interface TableBlock extends DocumentBlockBase {
  type: "table"; rows: string[][]; columns: number; columnWidths: number[];
  alignment: "left" | "center"; borderStyle: "subtle" | "none";
}
export interface PrescriptionBlock extends DocumentBlockBase {
  type: "prescription"; items: Array<{ name: string; dose: string; raw: string }>;
  columns: 2 | 3 | 4 | "auto";
}
export interface SignatureBlock extends DocumentBlockBase {
  type: "signature"; entries: Array<{ role: string; name: string; raw: string }>;
  alignment: "left" | "right" | "two-column";
}
export type DocumentBlock = HeadingBlock | ParagraphBlock | KeyValueBlock | ListBlock | TableBlock | PrescriptionBlock | SignatureBlock;

export interface DocumentLayoutSettings {
  pageSize: "A4"; marginTop: number; marginRight: number; marginBottom: number; marginLeft: number;
  bodyFontSize: number; lineHeight: number; letterSpacing: number; paragraphSpacingBefore: number;
  paragraphSpacingAfter: number; firstLineIndent: number; headingFontSize: number;
  headingSpacingBefore: number; headingSpacingAfter: number; keyValueColumns: 1 | 2 | "auto";
  prescriptionColumns: 2 | 3 | 4 | "auto"; minLinesAtPageBottom: number; minLinesAtPageTop: number;
}

export interface LineLayout {
  id: string; pageId: string; fieldId: string; label: string; text: string;
  startIndex: number; endIndex: number; autoX: number; autoY: number;
  manualOffsetX: number; manualOffsetY: number; lineSnapOffset?: number; rotation: number; fontSize: number;
  letterSpacing: number; lineHeight: number; fontId: string; locked: boolean;
  blockId?: string; blockType?: DocumentBlockType; visualKind?: "text" | "heading" | "columns" | "table";
  columnWidths?: number[]; rowIndex?: number; coverageText?: string;
  /** Original code-point index for each displayed character; -1 denotes layout whitespace. */
  sourceCharacterIndices?: number[];
}

export interface PageState {
  pageId: string; pageIndex: number; templateId: string; widthMm: number; heightMm: number;
  backgroundId: string; backgroundAdjustments: BackgroundAdjustments;
  backgroundTransform: BackgroundTransform; lines: LineLayout[];
  lineDetection?: HorizontalLineDetection;
  pageType?: PageType; pageTemplateId?: string | null; blockIds?: string[];
}

export interface CharacterRenderState {
  index: number; character: string; offsetX: number; offsetY: number; rotation: number;
  scaleX: number; scaleY: number; fontSizeScale: number; baselineOffset: number; opacity: number;
}

export interface ExportSettings {
  pageSize: "A4"; dpi: ExportDpi; format: ExportFormat; jpgQuality: number;
}
export interface SourceDocumentState {
  id: string; name: string; rawTexts: string[]; sourceCharacterCount: number;
}
export const DEFAULT_DOCUMENT_LAYOUT_SETTINGS: DocumentLayoutSettings = {
  pageSize: "A4", marginTop: 54, marginRight: 58, marginBottom: 58, marginLeft: 58,
  bodyFontSize: 17, lineHeight: 34, letterSpacing: 1.1, paragraphSpacingBefore: 3,
  paragraphSpacingAfter: 8, firstLineIndent: 34, headingFontSize: 21,
  headingSpacingBefore: 14, headingSpacingAfter: 9, keyValueColumns: "auto",
  prescriptionColumns: "auto", minLinesAtPageBottom: 2, minLinesAtPageTop: 2,
};

export interface ProjectStateV3 {
  schemaVersion: 3; projectVersion: string; id: string; document: SourceDocumentState;
  layoutMode: LayoutMode; noTemplateMode: NoTemplateMode; templateId: string | null;
  documentBlocks: DocumentBlock[];
  /** @deprecated V3.1 keeps these empty only for schema compatibility with older project files. */
  mappedBlockIds: string[];
  /** @deprecated V3.1 keeps these empty only for schema compatibility with older project files. */
  unmappedBlockIds: string[];
  explicitlyIgnoredBlockIds: string[]; documentLayoutSettings: DocumentLayoutSettings;
  seed: string; selectedFontId: string; fieldMappings: FieldMapping[]; pages: PageState[];
  handwriting: HandwritingStyle; exportSettings: ExportSettings; updatedAt: string;
}
export interface ProjectStateV2 {
  schemaVersion: 2; projectVersion: string; id: string; document: SourceDocumentState;
  seed: string; selectedFontId: string; fieldMappings: FieldMapping[]; pages: PageState[];
  handwriting: HandwritingStyle; exportSettings: ExportSettings; updatedAt: string;
}
export type ProjectState = ProjectStateV3;

/** The legacy flat-page state is accepted only by the migration layer. */
export interface ProjectStateV1 {
  schemaVersion: 1; id: string; documentName: string; documentFingerprint: string;
  seed: string; selectedFontId: string; selectedBackgroundId: string;
  background: BackgroundAdjustments; handwriting: HandwritingStyle;
  lines: Array<{ id: string; label: string; text: string; x: number; y: number;
    rotation?: number; fontSize?: number; letterSpacing?: number; lineHeight?: number;
    fontId?: string; locked?: boolean }>;
  updatedAt: string;
}

export function lineX(line: LineLayout) { return line.autoX + line.manualOffsetX; }
export function lineY(line: LineLayout) { return line.autoY + (line.lineSnapOffset ?? 0) + line.manualOffsetY; }
