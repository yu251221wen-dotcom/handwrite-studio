import type { BrokenLine, TextMeasurer, TextStyle } from "./types.ts";

const FORBIDDEN_START = new Set(["，", "。", "！", "？", "；", "：", "、", "）", "》", "】", "〕", "〉", "”", "’", "…", ",", ".", "!", "?", ";", ":", "%", "％", ")", "]", "}", "\"", "'"]);
const FORBIDDEN_END = new Set(["（", "《", "【", "〔", "〈", "“", "‘", "(", "[", "{", "\"", "'"]);

export function breakTextByWidth(text: string, maxWidth: number, measurer: TextMeasurer, style: TextStyle): BrokenLine[] {
  if (!text) return [];
  const chars = Array.from(text.replace(/\r\n?/g, "\n"));
  const result: BrokenLine[] = [];
  let current: string[] = [];
  let start = 0;
  const push = () => {
    if (!current.length) return;
    result.push({ text: current.join(""), startIndex: start, endIndex: start + current.length });
    start += current.length; current = [];
  };

  for (const char of chars) {
    if (char === "\n") { push(); start += 1; continue; }
    const candidate = current.join("") + char;
    if (current.length && measurer.measure(candidate, style) > maxWidth) {
      if (FORBIDDEN_START.has(char)) { current.push(char); push(); continue; }
      if (FORBIDDEN_END.has(current[current.length - 1])) {
        const opener = current.pop()!;
        push(); current = [opener, char]; continue;
      }
      push(); current.push(char);
    } else current.push(char);
  }
  push();
  return result;
}
