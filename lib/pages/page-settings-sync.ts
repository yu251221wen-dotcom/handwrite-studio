import { normalizeLineDetection } from "../background/line-detection.ts";
import type { PageState, ProjectState } from "../handwriting/types.ts";

export interface PageSettingsOverride {
  backgroundId: string;
  backgroundAdjustments: PageState["backgroundAdjustments"];
  backgroundTransform: PageState["backgroundTransform"];
  backgroundHasNativePageFooter?: boolean;
  lineDetection: NonNullable<PageState["lineDetection"]>;
}

export function capturePageSettings(page: PageState): PageSettingsOverride {
  return {
    backgroundId: page.backgroundId,
    backgroundAdjustments: { ...page.backgroundAdjustments },
    backgroundTransform: { ...page.backgroundTransform },
    backgroundHasNativePageFooter: page.backgroundHasNativePageFooter,
    lineDetection: normalizeLineDetection(page.lineDetection),
  };
}

/** Copy only the paper coordinate system and page presentation policy. */
export function applyPageSettingsOverride(project: ProjectState, override: PageSettingsOverride): ProjectState {
  return {
    ...project,
    pages: project.pages.map((page) => page.pageType === "blank" || page.pageType === "custom" ? page : {
      ...page,
      backgroundId: override.backgroundId,
      backgroundAdjustments: { ...override.backgroundAdjustments },
      backgroundTransform: { ...override.backgroundTransform },
      backgroundHasNativePageFooter: override.backgroundHasNativePageFooter,
      lineDetection: normalizeLineDetection(override.lineDetection),
    }),
  };
}

