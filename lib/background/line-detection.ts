import type { BackgroundAsset, HorizontalLineDetection, PageState } from "../handwriting/types.ts";

export const DEFAULT_LINE_DETECTION: HorizontalLineDetection = {
  enabled: false,
  lineY: [],
  averageSpacing: 40,
  confidence: 0,
  snapEnabled: false,
  offsetY: -2,
  showLines: false,
  firstUsableLine: 0,
  lastUsableLine: -1,
  writableLeft: 58,
  writableRight: 537,
  source: "none",
};

export interface PixelBuffer {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export interface HorizontalLineResult {
  lineY: number[];
  averageSpacing: number;
  confidence: number;
  writableLeft?: number;
  writableRight?: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function luminance(data: ArrayLike<number>, offset: number): number {
  return Number(data[offset]) * 0.2126 + Number(data[offset + 1]) * 0.7152 + Number(data[offset + 2]) * 0.0722;
}

function averageSpacing(lines: number[]): number {
  const gaps = lines.slice(1).map((value, index) => value - lines[index]).filter((gap) => gap >= 14 && gap <= 120);
  return gaps.length ? median(gaps) : 40;
}

function mergeNearbyCandidates(candidates: Array<{ y: number; score: number }>): Array<{ y: number; score: number }> {
  if (candidates.length < 2) return candidates;
  const estimatedSpacing = averageSpacing(candidates.map((candidate) => candidate.y));
  const mergeDistance = Math.max(5, Math.min(12, estimatedSpacing * 0.28));
  const merged: Array<{ y: number; score: number }> = [];
  for (const candidate of candidates) {
    const previous = merged.at(-1);
    if (previous && candidate.y - previous.y <= mergeDistance) {
      if (candidate.score > previous.score) merged[merged.length - 1] = candidate;
    } else {
      merged.push(candidate);
    }
  }
  return merged;
}

function detectWritableBounds(image: PixelBuffer, lines: number[]): { writableLeft: number; writableRight: number } {
  const { data, width, height } = image;
  const votes = Array.from({ length: width }, () => 0);
  for (const value of lines) {
    const y = Math.max(2, Math.min(height - 3, Math.round(value)));
    for (let x = 2; x < width - 2; x += 1) {
      const row = luminance(data, (y * width + x) * 4);
      const around = (luminance(data, ((y - 2) * width + x) * 4) + luminance(data, ((y + 2) * width + x) * 4)) / 2;
      if (around - row > 1.6) votes[x] += 1;
    }
  }
  const minimumVotes = Math.max(2, Math.ceil(lines.length * 0.3));
  const active = votes.flatMap((count, x) => count >= minimumVotes ? [x] : []);
  if (active.length < width * 0.2) return { writableLeft: 58, writableRight: width - 58 };
  const left = active[0];
  const right = active.at(-1)!;
  return {
    writableLeft: Math.max(24, Math.min(width - 84, left + 6)),
    writableRight: Math.max(84, Math.min(width - 24, right - 6)),
  };
}

/**
 * Detect straight horizontal rules with a row-projection score. Horizontal paper
 * lines are coherent across most of the page, while text and scan speckles are not.
 * This intentionally handles only the non-perspective V4 scope.
 */
export function detectHorizontalLines(image: PixelBuffer): HorizontalLineResult {
  const { data, width, height } = image;
  if (width < 24 || height < 24 || data.length < width * height * 4) return { lineY: [], averageSpacing: 40, confidence: 0 };
  const left = Math.floor(width * 0.05);
  const right = Math.max(left + 1, Math.ceil(width * 0.95));
  const step = Math.max(1, Math.floor(width / 720));
  const scores = Array.from({ length: height }, () => 0);
  const coherences = Array.from({ length: height }, () => 0);

  for (let y = 2; y < height - 2; y += 1) {
    let difference = 0;
    let coherent = 0;
    let samples = 0;
    let rowSum = 0;
    let rowSquareSum = 0;
    for (let x = left; x < right; x += step) {
      const row = luminance(data, (y * width + x) * 4);
      const around = (luminance(data, ((y - 2) * width + x) * 4) + luminance(data, ((y + 2) * width + x) * 4)) / 2;
      const darker = around - row;
      difference += Math.max(0, darker);
      if (darker > 2.2) coherent += 1;
      rowSum += row;
      rowSquareSum += row * row;
      samples += 1;
    }
    const meanDifference = difference / Math.max(1, samples);
    const rowMean = rowSum / Math.max(1, samples);
    const deviation = Math.sqrt(Math.max(0, rowSquareSum / Math.max(1, samples) - rowMean * rowMean));
    const coherence = coherent / Math.max(1, samples);
    coherences[y] = coherence;
    scores[y] = meanDifference * (0.45 + coherence) / (1 + deviation / 55);
  }

  const usefulScores = scores.slice(2, -2);
  const scoreMedian = median(usefulScores);
  const mad = median(usefulScores.map((score) => Math.abs(score - scoreMedian)));
  const maximum = Math.max(...usefulScores);
  const threshold = Math.max(0.7, scoreMedian + Math.max(0.45, mad * 5), maximum * 0.28);
  const candidates: Array<{ y: number; score: number }> = [];
  let start = -1;
  for (let y = 2; y < height - 2; y += 1) {
    const active = scores[y] >= threshold && coherences[y] >= 0.22;
    if (active && start < 0) start = y;
    if ((!active || y === height - 3) && start >= 0) {
      const end = active ? y : y - 1;
      let bestY = start;
      for (let row = start + 1; row <= end; row += 1) if (scores[row] > scores[bestY]) bestY = row;
      if (bestY > 7 && bestY < height - 7) candidates.push({ y: bestY, score: scores[bestY] });
      start = -1;
    }
  }

  const mergedCandidates = mergeNearbyCandidates(candidates);
  if (mergedCandidates.length < 2) return { lineY: [], averageSpacing: 40, confidence: 0 };
  const rawLines = mergedCandidates.map((candidate) => candidate.y);
  const spacing = averageSpacing(rawLines);
  const tolerance = Math.max(3, spacing * 0.16);
  const regular = mergedCandidates.filter((candidate, index) => {
    const previous = index > 0 ? candidate.y - mergedCandidates[index - 1].y : Infinity;
    const next = index + 1 < mergedCandidates.length ? mergedCandidates[index + 1].y - candidate.y : Infinity;
    return Math.abs(previous - spacing) <= tolerance || Math.abs(next - spacing) <= tolerance;
  });
  const selected = regular.length >= 2 ? regular : mergedCandidates;
  const lines = selected.map((candidate) => candidate.y);
  const finalSpacing = averageSpacing(lines);
  const deviations = lines.slice(1).map((value, index) => Math.abs(value - lines[index] - finalSpacing));
  const regularity = deviations.length ? Math.max(0, 1 - median(deviations) / Math.max(1, finalSpacing * 0.22)) : 0;
  const signal = Math.min(1, median(selected.map((candidate) => candidate.score)) / Math.max(1, threshold * 1.4));
  const countScore = Math.min(1, (lines.length - 1) / 5);
  const confidence = Math.round(Math.max(0, Math.min(1, regularity * 0.5 + signal * 0.25 + countScore * 0.25)) * 100) / 100;
  if (lines.length < 3 || confidence < 0.35) return { lineY: [], averageSpacing: finalSpacing, confidence };
  return { lineY: lines, averageSpacing: finalSpacing, confidence, ...detectWritableBounds(image, lines) };
}

export function presetHorizontalLines(asset: BackgroundAsset, height = 842): HorizontalLineResult {
  if (asset.pattern !== "ruled") return { lineY: [], averageSpacing: asset.spacing ?? 40, confidence: 0 };
  const spacing = asset.spacing ?? 40;
  return {
    lineY: Array.from({ length: Math.floor((height - 1) / spacing) }, (_, index) => spacing * (index + 1)),
    averageSpacing: spacing,
    confidence: 1,
    writableLeft: 58,
    writableRight: 537,
  };
}

export function normalizeLineDetection(value?: Partial<HorizontalLineDetection>): HorizontalLineDetection {
  const lines = [...new Set((value?.lineY ?? []).filter(Number.isFinite).map(Number))].sort((left, right) => left - right);
  return {
    ...DEFAULT_LINE_DETECTION,
    ...value,
    lineY: lines,
    averageSpacing: Math.max(12, Math.min(120, Number(value?.averageSpacing) || averageSpacing(lines))),
    confidence: Math.max(0, Math.min(1, Number(value?.confidence) || 0)),
    firstUsableLine: Math.max(0, Math.round(Number(value?.firstUsableLine) || 0)),
    lastUsableLine: Number.isFinite(value?.lastUsableLine) ? Math.round(Number(value?.lastUsableLine)) : -1,
    writableLeft: Math.max(0, Math.min(534, Number.isFinite(value?.writableLeft) ? Number(value?.writableLeft) : DEFAULT_LINE_DETECTION.writableLeft)),
    writableRight: Math.max(60, Math.min(595, Number.isFinite(value?.writableRight) ? Number(value?.writableRight) : DEFAULT_LINE_DETECTION.writableRight)),
  };
}

export function respaceHorizontalLines(lines: number[], spacing: number, height = 842): number[] {
  const safeSpacing = Math.max(12, Math.min(120, spacing));
  const anchor = lines[0] ?? safeSpacing;
  const result: number[] = [];
  for (let y = anchor; y < height - 4; y += safeSpacing) if (y > 4) result.push(Math.round(y * 10) / 10);
  for (let y = anchor - safeSpacing; y > 4; y -= safeSpacing) result.unshift(Math.round(y * 10) / 10);
  return result;
}

export function snapOffsetForLine(autoY: number, detection?: HorizontalLineDetection): number {
  if (!detection?.enabled || !detection.snapEnabled || !detection.lineY.length) return 0;
  const target = detection.lineY.reduce((nearest, line) => Math.abs(line + detection.offsetY - autoY) < Math.abs(nearest + detection.offsetY - autoY) ? line : nearest);
  return target + detection.offsetY - autoY;
}

export interface LineSnapDiagnostic {
  lineId: string;
  automaticY: number;
  paperLineY: number;
  baselineY: number;
  difference: number;
  paperLineIndex: number;
}

interface PaperLineCandidate {
  y: number;
  index: number;
}

function completePaperGrid(detection: HorizontalLineDetection): PaperLineCandidate[] {
  if (!detection.lineY.length) return [];
  const first = Math.max(0, Math.min(detection.lineY.length - 1, detection.firstUsableLine));
  const requestedLast = detection.lastUsableLine < 0 ? detection.lineY.length - 1 : detection.lastUsableLine;
  const last = Math.max(first, Math.min(detection.lineY.length - 1, requestedLast));
  return detection.lineY.slice(first, last + 1).map((y, offset) => ({ y, index: first + offset }));
}

/**
 * Globally assigns ordered document rows to ordered paper rules. Dynamic
 * programming minimizes total movement while strictly increasing the selected
 * rule index, so two rows can never collapse onto one physical rule.
 */
function monotonicPaperAssignment(automaticY: number[], detection: HorizontalLineDetection): PaperLineCandidate[] {
  const candidates = completePaperGrid(detection);
  const rowCount = automaticY.length;
  const candidateCount = candidates.length;
  if (!rowCount || candidateCount < rowCount) return [];
  const costs = Array.from({ length: rowCount + 1 }, () => Array(candidateCount + 1).fill(Number.POSITIVE_INFINITY));
  const choices = Array.from({ length: rowCount + 1 }, () => Array(candidateCount + 1).fill(false));
  for (let candidate = 0; candidate <= candidateCount; candidate += 1) costs[0][candidate] = 0;
  for (let row = 1; row <= rowCount; row += 1) {
    for (let candidate = 1; candidate <= candidateCount; candidate += 1) {
      const skip = costs[row][candidate - 1];
      const distance = candidates[candidate - 1].y + detection.offsetY - automaticY[row - 1];
      const assign = costs[row - 1][candidate - 1] + distance * distance;
      if (assign <= skip) {
        costs[row][candidate] = assign;
        choices[row][candidate] = true;
      } else {
        costs[row][candidate] = skip;
      }
    }
  }
  const result = Array<PaperLineCandidate>(rowCount);
  let row = rowCount;
  let candidate = candidateCount;
  while (row > 0 && candidate > 0) {
    if (choices[row][candidate]) {
      result[row - 1] = candidates[candidate - 1];
      row -= 1;
    }
    candidate -= 1;
  }
  return row === 0 ? result : [];
}

export function applyLineSnapping(page: PageState, value: HorizontalLineDetection): PageState {
  const lineDetection = normalizeLineDetection(value);
  const enabled = lineDetection.enabled && lineDetection.snapEnabled && lineDetection.lineY.length > 0;
  const ordered = page.lines.map((line, index) => ({ index, line }))
    .sort((left, right) => left.line.autoY - right.line.autoY || left.index - right.index);
  const assignments = enabled ? monotonicPaperAssignment(ordered.map(({ line }) => line.autoY), lineDetection) : [];
  const byIndex = new Map<number, PaperLineCandidate>();
  assignments.forEach((assignment, index) => byIndex.set(ordered[index].index, assignment));
  return {
    ...page,
    lineDetection,
    lines: page.lines.map((line, index) => {
      const assignment = byIndex.get(index);
      if (!assignment) {
        return { ...line, lineSnapOffset: 0, assignedPaperLineY: undefined, assignedPaperLineIndex: undefined };
      }
      return {
        ...line,
        lineSnapOffset: assignment.y + lineDetection.offsetY - line.autoY,
        assignedPaperLineY: assignment.y,
        assignedPaperLineIndex: assignment.index,
      };
    }),
  };
}

export function lineSnapDiagnostics(page: PageState): LineSnapDiagnostic[] {
  return page.lines.flatMap((line) => line.assignedPaperLineY === undefined || line.assignedPaperLineIndex === undefined ? [] : [{
    lineId: line.id,
    automaticY: line.autoY,
    paperLineY: line.assignedPaperLineY,
    baselineY: lineYValue(line),
    difference: lineYValue(line) - line.assignedPaperLineY,
    paperLineIndex: line.assignedPaperLineIndex,
  }]);
}

function lineYValue(line: PageState["lines"][number]): number {
  return line.autoY + (line.lineSnapOffset ?? 0) + line.manualOffsetY;
}
