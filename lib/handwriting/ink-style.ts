import { createSeededRandom } from "./seeded-random.ts";
import type { InkStyle } from "./types.ts";

export const DEFAULT_INK_STYLE: InkStyle = {
  enabled: true,
  color: "#163d64",
  variation: 0.18,
  bleed: 0.08,
  dryBrush: 0.04,
  brokenInk: 0.025,
  darknessTrend: 0.18,
};

export interface CharacterInkState {
  brightness: number; saturation: number; alpha: number;
  bleed: number; dryBrush: boolean; brokenInk: boolean; textureOffset: number;
}

export function normalizeInkStyle(style?: Partial<InkStyle>, legacyColor = DEFAULT_INK_STYLE.color): InkStyle {
  return { ...DEFAULT_INK_STYLE, color: legacyColor, ...style };
}

export function generateInkStates(length: number, stableKey: string, style?: Partial<InkStyle>): CharacterInkState[] {
  const current = normalizeInkStyle(style);
  if (!current.enabled) return Array.from({ length }, () => ({ brightness: 1, saturation: 1, alpha: 1, bleed: 0, dryBrush: false, brokenInk: false, textureOffset: 0 }));
  const random = createSeededRandom(`${stableKey}:ink`);
  const correlation = 0.9;
  let brightnessTrend = 0; let saturationTrend = 0; let alphaTrend = 0; let textureTrend = 0;
  return Array.from({ length }, () => {
    brightnessTrend = brightnessTrend * correlation + random.signed() * (1 - correlation);
    saturationTrend = saturationTrend * correlation + random.signed() * (1 - correlation);
    alphaTrend = alphaTrend * correlation + random.signed() * (1 - correlation);
    textureTrend = textureTrend * correlation + random.signed() * (1 - correlation);
    const local = random.signed() * 0.18;
    return {
      brightness: Math.max(0.78, Math.min(1.12, 1 + (brightnessTrend + local) * current.variation * 0.55 - current.darknessTrend * 0.06)),
      saturation: Math.max(0.82, Math.min(1.18, 1 + saturationTrend * current.variation * 0.45)),
      alpha: Math.max(0.76, Math.min(1, 0.985 - Math.abs(alphaTrend + local) * current.variation * 0.34)),
      bleed: current.bleed * (0.45 + random.next() * 0.55),
      dryBrush: random.next() < current.dryBrush,
      brokenInk: random.next() < current.brokenInk,
      textureOffset: textureTrend + random.signed() * 0.22,
    };
  });
}
