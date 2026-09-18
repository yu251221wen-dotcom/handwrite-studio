import type { BackgroundAsset, PageState, TableLineMode, TableLineStyle } from "./types.ts";

export const DEFAULT_TABLE_LINE_STYLE: TableLineStyle = { color: "#495b65", alpha: 0.24, width: 0.65 };

export type ResolvedTableLines = "none" | "horizontal" | "grid";

export function resolveTableLines(mode: TableLineMode | undefined, page: PageState, background: BackgroundAsset): ResolvedTableLines {
  const current = mode ?? "auto";
  if (current === "hidden") return "none";
  if (current === "visible") return "grid";
  const structuredPaper = background.pattern !== "solid" || Boolean(page.lineDetection?.enabled);
  if (current === "auto") return structuredPaper ? "none" : "grid";
  return structuredPaper ? "none" : "horizontal";
}

export function normalizeTableLineStyle(style?: Partial<TableLineStyle>): TableLineStyle {
  return {
    color: style?.color ?? DEFAULT_TABLE_LINE_STYLE.color,
    alpha: Math.max(0, Math.min(1, style?.alpha ?? DEFAULT_TABLE_LINE_STYLE.alpha)),
    width: Math.max(0.1, Math.min(4, style?.width ?? DEFAULT_TABLE_LINE_STYLE.width)),
  };
}

