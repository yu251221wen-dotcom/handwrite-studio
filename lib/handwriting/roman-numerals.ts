import type { CharacterRenderState, LineLayout } from "./types.ts";
import { createSeededRandom } from "./seeded-random.ts";

export function romanNumeralCharacterIndexes(text: string): Set<number> {
  const indexes = new Set<number>();
  const characters = Array.from(text);
  let start = 0;
  for (const cell of text.split("\t")) {
    const trimmed = cell.trim();
    if (/^[IVX]{1,6}$/u.test(trimmed)) {
      const offset = Array.from(cell).findIndex((character) => !/\s/u.test(character));
      for (let index = 0; index < Array.from(trimmed).length; index += 1) indexes.add(start + Math.max(0, offset) + index);
    }
    start += Array.from(cell).length + 1;
  }
  // A whole standalone line may not contain a tab.
  if (/^[IVX]{1,6}$/u.test(text.trim())) {
    characters.forEach((character, index) => { if (/[IVX]/u.test(character)) indexes.add(index); });
  }
  return indexes;
}

export function naturalizeRomanGlyph(state: CharacterRenderState, line: LineLayout, sourceIndex: number, seed: string, documentId: string): CharacterRenderState {
  if (line.visualKind !== "table") return state;
  const random = createSeededRandom(`${documentId}|${line.fieldId}|${sourceIndex}|${seed}|roman`);
  return {
    ...state,
    rotation: state.rotation + random.signed() * 0.75,
    scaleX: state.scaleX * (1 + random.signed() * 0.035),
    scaleY: state.scaleY * (1 + random.signed() * 0.022),
    baselineOffset: state.baselineOffset + random.signed() * 0.7,
    opacity: Math.max(0.78, Math.min(1, state.opacity * (0.985 + random.signed() * 0.012))),
  };
}

