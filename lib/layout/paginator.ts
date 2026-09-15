import type { BackgroundAdjustments, BackgroundTransform, LineLayout, PageState } from "../handwriting/types.ts";
import type { LayoutTemplate } from "./types.ts";
import { DEFAULT_LINE_DETECTION, normalizeLineDetection } from "../background/line-detection.ts";

export const DEFAULT_TRANSFORM: BackgroundTransform = { fitMode: "cover", scale: 1, offsetX: 0, offsetY: 0 };
export const DEFAULT_ADJUSTMENTS: BackgroundAdjustments = { brightness: 100, contrast: 100, saturation: 100, blur: 0, noise: 0, rotation: 0 };

export function paginateLines(lines: Omit<LineLayout, "pageId" | "autoY">[], template: LayoutTemplate, backgroundId: string, previous: PageState[] = []): PageState[] {
  const pages: PageState[] = [];
  let pageIndex = 0;
  let y = template.firstPageTop;
  const pageFor = (index: number): PageState => {
    const old = previous[index];
    const pageId = old?.pageId ?? `page-${index + 1}`;
    return {
      pageId, pageIndex: index,
      templateId: index === 0 ? template.id : template.continuationTemplateId,
      widthMm: 210, heightMm: 297, backgroundId: old?.backgroundId ?? backgroundId,
      backgroundAdjustments: old?.backgroundAdjustments ?? { ...DEFAULT_ADJUSTMENTS },
      backgroundTransform: old?.backgroundTransform ?? { ...DEFAULT_TRANSFORM },
      lineDetection: normalizeLineDetection(old?.lineDetection ?? DEFAULT_LINE_DETECTION), lines: [],
    };
  };
  pages.push(pageFor(0));
  for (const input of lines) {
    if (y + input.lineHeight > template.bottom) {
      pageIndex += 1; pages.push(pageFor(pageIndex)); y = template.continuationTop;
    }
    const page = pages[pageIndex];
    page.lines.push({ ...input, pageId: page.pageId, autoY: y });
    y += input.lineHeight;
  }
  return pages;
}
