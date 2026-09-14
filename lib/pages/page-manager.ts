import type { PageState } from "../handwriting/types.ts";
import { DEFAULT_ADJUSTMENTS, DEFAULT_TRANSFORM } from "../layout/paginator.ts";

function reindex(pages: PageState[]): PageState[] {
  return pages.map((page, pageIndex) => ({ ...page, pageIndex }));
}

function nextPageId(pages: PageState[]): string {
  let index = pages.length + 1;
  while (pages.some((page) => page.pageId === `page-manual-${index}`)) index += 1;
  return `page-manual-${index}`;
}

export function addBlankPage(pages: PageState[], afterIndex = pages.length - 1): PageState[] {
  const reference = pages[Math.max(0, Math.min(afterIndex, pages.length - 1))];
  const pageId = nextPageId(pages);
  const page: PageState = {
    pageId, pageIndex: afterIndex + 1, pageType: "blank", pageTemplateId: null,
    templateId: "no-template-a4", widthMm: 210, heightMm: 297,
    backgroundId: reference?.backgroundId ?? "white-clean",
    backgroundAdjustments: reference?.backgroundAdjustments ? { ...reference.backgroundAdjustments } : { ...DEFAULT_ADJUSTMENTS },
    backgroundTransform: reference?.backgroundTransform ? { ...reference.backgroundTransform } : { ...DEFAULT_TRANSFORM },
    blockIds: [], lines: [],
  };
  const result = [...pages]; result.splice(afterIndex + 1, 0, page); return reindex(result);
}

export function duplicatePage(pages: PageState[], pageId: string): PageState[] {
  const index = pages.findIndex((page) => page.pageId === pageId);
  if (index < 0) return pages;
  const source = pages[index]; const duplicateId = nextPageId(pages);
  const duplicate: PageState = {
    ...source, pageId: duplicateId, pageType: "custom", pageTemplateId: source.pageTemplateId ?? null,
    backgroundAdjustments: { ...source.backgroundAdjustments }, backgroundTransform: { ...source.backgroundTransform },
    blockIds: [...(source.blockIds ?? [])],
    lines: source.lines.map((line) => ({ ...line, id: `${line.id}:copy:${duplicateId}`, pageId: duplicateId })),
  };
  const result = [...pages]; result.splice(index + 1, 0, duplicate); return reindex(result);
}

export function movePage(pages: PageState[], pageId: string, targetIndex: number): PageState[] {
  const index = pages.findIndex((page) => page.pageId === pageId);
  if (index < 0 || targetIndex < 0 || targetIndex >= pages.length || index === targetIndex) return pages;
  const result = [...pages]; const [page] = result.splice(index, 1); result.splice(targetIndex, 0, page); return reindex(result);
}

export interface DeletePageInspection {
  pageId: string; blockCount: number; lineCount: number; protected: boolean;
}

export function inspectPageDeletion(pages: PageState[], pageId: string): DeletePageInspection {
  const page = pages.find((item) => item.pageId === pageId);
  const blockCount = new Set(page?.blockIds ?? page?.lines.map((line) => line.blockId).filter(Boolean)).size;
  const lineCount = page?.lines.length ?? 0;
  return { pageId, blockCount, lineCount, protected: Boolean(blockCount || lineCount) };
}

export function deletePageContent(pages: PageState[], pageId: string): PageState[] {
  if (pages.length <= 1) return pages;
  return reindex(pages.filter((page) => page.pageId !== pageId));
}
