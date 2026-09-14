import type { FieldMapping, LineLayout, PageState } from "../handwriting/types.ts";

export interface TextStyle { fontFamily: string; fontSize: number; letterSpacing: number }
export interface TextMeasurer { measure(text: string, style: TextStyle): number }
export interface BrokenLine { text: string; startIndex: number; endIndex: number }
export interface LayoutTemplate {
  id: string; continuationTemplateId: string; width: number; height: number;
  contentLeft: number; contentRight: number; firstPageTop: number;
  continuationTop: number; bottom: number; lineHeight: number;
}
export interface LayoutInput {
  documentId: string; fields: FieldMapping[]; measurer: TextMeasurer; template: LayoutTemplate;
  fontId: string; fontFamily: string; fontSize: number; letterSpacing: number;
  backgroundId: string; previousPages?: PageState[];
}
export interface LayoutResult { pages: PageState[]; sourceTextByField: Record<string, string>; lines: LineLayout[] }

export const DEFAULT_A4_TEMPLATE: LayoutTemplate = {
  id: "tcm-inpatient-first-v2", continuationTemplateId: "tcm-inpatient-continuation-v2",
  width: 595, height: 842, contentLeft: 61, contentRight: 535,
  firstPageTop: 286, continuationTop: 168, bottom: 752, lineHeight: 36,
};
