import { createSeededRandom } from "./seeded-random.ts";
import type { CorrectionMark, CorrectionStyle, LineLayout } from "./types.ts";

export const DEFAULT_CORRECTION_STYLE: CorrectionStyle = {
  enabled: true, automatic: false, automaticProbability: 0.008, marks: [],
};

export function normalizeCorrectionStyle(style?: Partial<CorrectionStyle>): CorrectionStyle {
  return { ...DEFAULT_CORRECTION_STYLE, ...style, marks: style?.marks ?? [] };
}

const correctionIndexCache = new WeakMap<CorrectionMark[], Map<string, CorrectionMark[]>>();

/** Index manual marks once per immutable marks array instead of scanning every mark for every glyph line. */
export function correctionMarksByBlock(style?: Partial<CorrectionStyle>): Map<string, CorrectionMark[]> {
  const marks = style?.marks ?? [];
  const cached = correctionIndexCache.get(marks);
  if (cached) return cached;
  const index = new Map<string, CorrectionMark[]>();
  for (const mark of marks) index.set(mark.blockId, [...(index.get(mark.blockId) ?? []), mark]);
  correctionIndexCache.set(marks, index);
  return index;
}

const unsafeText = /\d|姓名|性别|年龄|日期|时间|病案号|诊断|处方|医师|老师|签名|mg|ml|\bg\b/iu;

/** Conservative, deterministic auto-corrections: narrative prose only, never clinical identifiers/results. */
export function automaticCorrectionMarks(
  line: LineLayout, sourceText: string, style: CorrectionStyle, seed: string, documentId: string,
): CorrectionMark[] {
  if (!style.enabled || !style.automatic || style.automaticProbability <= 0 || line.blockType !== "paragraph" || unsafeText.test(line.text)) return [];
  const indices = line.sourceCharacterIndices ?? [];
  const chars = Array.from(line.text);
  const marks: CorrectionMark[] = [];
  for (let index = 2; index < chars.length - 2; index += 1) {
    const sourceIndex = indices[index];
    if (sourceIndex === undefined || sourceIndex < 0 || /\s|[，。！？；：、,.!?;:（）()《》“”‘’【】\[\]]/u.test(chars[index])) continue;
    // One PRNG per original character keeps the decision stable when wrapping,
    // pagination or paper calibration moves that character to another line.
    const random = createSeededRandom(`${documentId}|${line.blockId ?? line.fieldId}|${sourceIndex}|${seed}|auto-correction`);
    if (random.next() >= style.automaticProbability) continue;
    marks.push({ id: `auto:${line.blockId ?? line.fieldId}:${sourceIndex}`, blockId: line.blockId ?? line.fieldId,
      sourceStart: sourceIndex, sourceEnd: sourceIndex + 1, sourceText: chars[index], type: "single-strike", replacementText: chars[index] });
  }
  return marks;
}
