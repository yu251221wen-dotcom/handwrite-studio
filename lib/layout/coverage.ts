import type { DocumentBlock, FieldMapping, PageState } from "../handwriting/types.ts";

export interface CoverageReport {
  valid: boolean; sourceCharacterCount: number; laidOutCharacterCount: number;
  missingFieldIds: string[]; duplicateOrCorruptFieldIds: string[];
  rawCharacters: number; recognizedCharacters: number; explicitlyIgnoredCharacters: number;
  missingCharacters: number; missingBlockIds: string[];
}

interface BlockCoverageOptions {
  blocks?: DocumentBlock[]; ignoredBlockIds?: string[];
}

const normalized = (value: string) => Array.from(value.replace(/\s+/gu, "")).join("");

export function validateDocumentCoverage(fields: FieldMapping[], pages: PageState[], options: BlockCoverageOptions = {}): CoverageReport {
  if (options.blocks?.length) {
    const ignored = new Set(options.ignoredBlockIds ?? []);
    const automaticLines = pages.filter((page) => page.pageType !== "blank" && page.pageType !== "custom").flatMap((page) => page.lines);
    const actualText = normalized(automaticLines.map((line) => line.text).join(""));
    let rawCharacters = 0; let laidOutCharacterCount = 0; let explicitlyIgnoredCharacters = 0;
    const missingBlockIds: string[] = []; const duplicateOrCorruptFieldIds: string[] = [];
    for (const block of options.blocks) {
      const source = normalized(block.sourceText); rawCharacters += source.length;
      if (ignored.has(block.blockId)) { explicitlyIgnoredCharacters += source.length; continue; }
      const blockLines = automaticLines.filter((line) => line.blockId === block.blockId).sort((a, b) => a.startIndex - b.startIndex);
      const sourceCharacters = Array.from(block.sourceText);
      const invalidIndices = blockLines.some((line) => {
        if (!line.sourceCharacterIndices) return false; // Legacy files are upgraded when opened.
        const characters = Array.from(line.text);
        return line.sourceCharacterIndices.length !== characters.length || characters.some((character, index) => {
          const sourceIndex = line.sourceCharacterIndices![index];
          return sourceIndex === -1 ? !/\s/u.test(character) : sourceCharacters[sourceIndex] !== character;
        });
      });
      if (invalidIndices) duplicateOrCorruptFieldIds.push(block.blockId);
      const arranged = normalized(blockLines.map((line) => line.text).join(""));
      if (arranged === source || (!blockLines.length && actualText.includes(source))) {
        laidOutCharacterCount += source.length; continue;
      }
      laidOutCharacterCount += Math.min(arranged.length, source.length);
      if (!arranged) missingBlockIds.push(block.blockId);
      else if (arranged !== source) duplicateOrCorruptFieldIds.push(block.blockId);
    }
    const missingCharacters = Math.max(0, rawCharacters - explicitlyIgnoredCharacters - laidOutCharacterCount);
    return {
      valid: missingCharacters === 0 && !missingBlockIds.length && !duplicateOrCorruptFieldIds.length,
      sourceCharacterCount: rawCharacters, laidOutCharacterCount, missingFieldIds: [], duplicateOrCorruptFieldIds,
      rawCharacters, recognizedCharacters: rawCharacters, explicitlyIgnoredCharacters, missingCharacters, missingBlockIds,
    };
  }
  const body = fields.filter((field) => field.role === "body" && field.value);
  const lines = pages.flatMap((page) => page.lines);
  let sourceCharacterCount = 0; let laidOutCharacterCount = 0;
  const missingFieldIds: string[] = []; const duplicateOrCorruptFieldIds: string[] = [];
  for (const field of body) {
    const source = `${field.label ? `${field.label}：` : ""}${field.value}`.replace(/\r\n?/g, "\n");
    const arranged = lines.filter((line) => line.fieldId === field.id).sort((a, b) => a.startIndex - b.startIndex).map((line) => line.text).join("");
    const normalizedSource = source.replace(/\n/g, "");
    sourceCharacterCount += Array.from(normalizedSource).length;
    laidOutCharacterCount += Array.from(arranged).length;
    if (!arranged) missingFieldIds.push(field.id);
    else if (arranged !== normalizedSource) duplicateOrCorruptFieldIds.push(field.id);
  }
  const missingCharacters = Math.max(0, sourceCharacterCount - laidOutCharacterCount);
  return { valid: !missingFieldIds.length && !duplicateOrCorruptFieldIds.length && sourceCharacterCount === laidOutCharacterCount,
    sourceCharacterCount, laidOutCharacterCount, missingFieldIds, duplicateOrCorruptFieldIds,
    rawCharacters: sourceCharacterCount, recognizedCharacters: sourceCharacterCount, explicitlyIgnoredCharacters: 0,
    missingCharacters, missingBlockIds: [] };
}
