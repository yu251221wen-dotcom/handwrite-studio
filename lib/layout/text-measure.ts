import type { TextMeasurer } from "./types.ts";

export function createCanvasTextMeasurer(context: CanvasRenderingContext2D): TextMeasurer {
  return { measure(text, style) {
    context.save(); context.font = `${style.fontSize}px ${style.fontFamily}`;
    const chars = Array.from(text);
    const width = chars.reduce((sum, char) => sum + context.measureText(char).width, 0)
      + Math.max(0, chars.length - 1) * style.letterSpacing;
    context.restore(); return width;
  } };
}

/** Deterministic fallback used by tests and during server-side project migration. */
export function createApproximateTextMeasurer(): TextMeasurer {
  return { measure(text, style) {
    return Array.from(text).reduce((sum, char) => {
      const narrow = /[\s.,;:!?，。；：！？、]/u.test(char) ? 0.55 : /[\x00-\xff]/u.test(char) ? 0.62 : 1;
      return sum + style.fontSize * narrow + style.letterSpacing;
    }, 0);
  } };
}
