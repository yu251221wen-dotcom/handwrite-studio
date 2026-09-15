import { normalizeLineDetection } from "../background/line-detection.ts";
import type { HorizontalLineDetection } from "../handwriting/types.ts";

export interface BackgroundLayoutGrid {
  detection: HorizontalLineDetection;
  firstUsableLine: number;
  lastUsableLine: number;
  usableLineCount: number;
  writableTop: number;
  writableBottom: number;
  writableLeft: number;
  writableRight: number;
  lineY: number[];
  averageSpacing: number;
}

const A4_WIDTH = 595;

/** Resolve the physical paper rules that may receive text on one page. */
export function resolveBackgroundLayoutGrid(
  value?: Partial<HorizontalLineDetection>,
  pageWidth = A4_WIDTH,
): BackgroundLayoutGrid | undefined {
  const detection = normalizeLineDetection(value);
  if (!detection.enabled || !detection.snapEnabled || !detection.lineY.length) return undefined;
  const first = Math.max(0, Math.min(detection.lineY.length - 1, Math.round(detection.firstUsableLine)));
  const requestedLast = detection.lastUsableLine < 0 ? detection.lineY.length - 1 : Math.round(detection.lastUsableLine);
  const last = Math.max(first, Math.min(detection.lineY.length - 1, requestedLast));
  const writableLeft = Math.max(0, Math.min(pageWidth - 61, detection.writableLeft));
  const writableRight = Math.max(writableLeft + 60, Math.min(pageWidth, detection.writableRight));
  const lineY = detection.lineY.slice(first, last + 1);
  return {
    detection,
    firstUsableLine: first,
    lastUsableLine: last,
    usableLineCount: lineY.length,
    writableTop: lineY[0],
    writableBottom: lineY.at(-1)!,
    writableLeft,
    writableRight,
    lineY,
    averageSpacing: detection.averageSpacing,
  };
}

/** V4.1 expresses block spacing as whole paper-line slots, never free pixels. */
export function paperSlotGap(pixelSpacing: number, averageSpacing: number): number {
  if (!Number.isFinite(pixelSpacing) || pixelSpacing <= 0) return 0;
  return Math.max(0, Math.round(pixelSpacing / Math.max(12, averageSpacing)));
}
