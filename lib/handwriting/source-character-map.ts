/** Map displayed characters to their original code-point indices, excluding layout whitespace. */
export function mapSourceCharacters<T extends { text: string }>(lines: T[], source: string): Array<T & { sourceCharacterIndices: number[] }> {
  const original = Array.from(source);
  let cursor = 0;
  return lines.map((line) => ({
    ...line,
    sourceCharacterIndices: Array.from(line.text).map((character) => {
      if (/\s/u.test(character)) return -1;
      while (cursor < original.length && /\s/u.test(original[cursor])) cursor += 1;
      if (original[cursor] !== character) throw new Error("排版字符与原文不一致，无法建立字迹索引");
      return cursor++;
    }),
  }));
}
