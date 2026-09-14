/** @deprecated V3.1 production layout uses block-layout-engine.ts exclusively. */
import { breakTextByWidth } from "./line-breaker.ts";
import { paginateLines } from "./paginator.ts";
import type { LayoutInput, LayoutResult } from "./types.ts";

const PATIENT_FIELDS = new Set(["name", "sex", "age", "occupation", "admission_time", "medical_record_number"]);

export function layoutDocument(input: LayoutInput): LayoutResult {
  const previous = new Map(input.previousPages?.flatMap((page) => page.lines.map((line) => [line.id, line])) ?? []);
  const sourceTextByField: Record<string, string> = {};
  const unpaged = input.fields.filter((field) => field.role === "body" && field.value).flatMap((field) => {
    const source = `${field.label ? `${field.label}：` : ""}${field.value}`;
    sourceTextByField[field.id] = source;
    return breakTextByWidth(source, input.template.contentRight - input.template.contentLeft, input.measurer, {
      fontFamily: input.fontFamily, fontSize: input.fontSize, letterSpacing: input.letterSpacing,
    }).map((broken, index) => {
      const id = `${field.id}:${broken.startIndex}`;
      const old = previous.get(id);
      return {
        id, fieldId: field.id, label: index === 0 ? field.label : "", text: broken.text,
        startIndex: broken.startIndex, endIndex: broken.endIndex, autoX: input.template.contentLeft,
        manualOffsetX: old?.manualOffsetX ?? 0, manualOffsetY: old?.manualOffsetY ?? 0,
        rotation: old?.rotation ?? 0, fontSize: old?.fontSize ?? input.fontSize,
        letterSpacing: old?.letterSpacing ?? input.letterSpacing, lineHeight: old?.lineHeight ?? input.template.lineHeight,
        fontId: old?.fontId ?? input.fontId, locked: old?.locked ?? false,
      };
    });
  });
  const pages = paginateLines(unpaged, input.template, input.backgroundId, input.previousPages);
  for (const field of input.fields.filter((item) => PATIENT_FIELDS.has(item.id))) sourceTextByField[field.id] = field.value;
  return { pages, sourceTextByField, lines: pages.flatMap((page) => page.lines) };
}
