/** A drawing spy: records actual fillText calls, not layout metadata. */
export function recordingCanvas() {
  const glyphs: string[] = [];
  const context = {
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    strokeRect() {}, fillRect() {}, beginPath() {}, rect() {}, fill() {}, stroke() {},
    measureText: () => ({ width: 17 }),
    fillText(text: string) { if (Array.from(text).length === 1) glyphs.push(text); },
  } as unknown as CanvasRenderingContext2D;
  return { context, glyphs };
}
