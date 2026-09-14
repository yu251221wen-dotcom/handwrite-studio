import type { FontAsset, PageState, ProjectState } from "../handwriting/types.ts";
import { layoutDocumentBlocks } from "./block-layout-engine.ts";
import type { TextMeasurer } from "./types.ts";

export function layoutProjectPages(project: ProjectState, measurer: TextMeasurer, font: FontAsset): PageState[] {
  const activeBlocks = project.documentBlocks.filter((block) => !project.explicitlyIgnoredBlockIds.includes(block.blockId));
  // V3.1 has one production layout path. A legacy `layoutMode: "template"` value may
  // still exist in an old JSON file, but it must never reactivate the field mapper.
  return layoutDocumentBlocks({
    documentId: project.document.id, blocks: activeBlocks, measurer, fontId: font.id,
    fontFamily: font.family, settings: project.documentLayoutSettings,
    backgroundId: project.pages[0]?.backgroundId ?? "white-clean", mode: project.noTemplateMode,
    previousPages: project.pages,
  }).pages;
}
