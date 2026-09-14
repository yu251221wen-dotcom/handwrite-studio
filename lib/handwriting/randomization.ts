import type { CharacterRenderState, HandwritingPreset, RandomizationConfig } from "./types.ts";
import { createSeededRandom } from "./seeded-random.ts";

export const DEFAULT_RANDOMIZATION: RandomizationConfig = {
  characterOffsetX: 1.7,
  characterOffsetY: 1.9,
  characterRotation: 1.8,
  characterScaleX: 0.035,
  characterScaleY: 0.024,
  characterFontSizeVariation: 0.03,
  characterBaselineOffset: 1.35,
  characterOpacityVariation: 0.045,
  correlation: 0.82,
};

export const PRESET_NATURALITY: Record<HandwritingPreset, number> = {
  neat: 12,
  natural: 52,
  messy: 84,
};

const punctuation = new Set("，。！？；：、,.!?;:（）()《》“”‘’【】[]".split(""));

export function scaledRandomization(config: RandomizationConfig, naturality: number): RandomizationConfig {
  const amount = Math.max(0, Math.min(100, naturality)) / 100;
  return {
    ...config,
    characterOffsetX: config.characterOffsetX * amount,
    characterOffsetY: config.characterOffsetY * amount,
    characterRotation: config.characterRotation * amount,
    characterScaleX: config.characterScaleX * amount,
    characterScaleY: config.characterScaleY * amount,
    characterFontSizeVariation: config.characterFontSizeVariation * amount,
    characterBaselineOffset: config.characterBaselineOffset * amount,
    characterOpacityVariation: config.characterOpacityVariation * amount,
  };
}

export function generateCharacterStates(text: string, seed: string, config: RandomizationConfig, naturality: number): CharacterRenderState[] {
  if (naturality <= 0) {
    return Array.from(text).map((character, index) => ({
      index,
      character,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      fontSizeScale: 1,
      baselineOffset: 0,
      opacity: 1,
    }));
  }
  const random = createSeededRandom(seed);
  const strength = scaledRandomization(config, naturality);
  const correlation = Math.max(0, Math.min(0.97, strength.correlation));
  let xTrend = 0;
  let yTrend = 0;
  let baselineTrend = 0;
  let rotationTrend = 0;
  let widthTrend = 0;
  let heightTrend = 0;
  let opacityTrend = 0;

  return Array.from(text).map((character, index) => {
    const innovation = 1 - correlation;
    xTrend = xTrend * correlation + random.signed() * innovation;
    yTrend = yTrend * correlation + random.signed() * innovation;
    baselineTrend = baselineTrend * correlation + random.signed() * innovation;
    rotationTrend = rotationTrend * correlation + random.signed() * innovation;
    widthTrend = widthTrend * correlation + random.signed() * innovation;
    heightTrend = heightTrend * correlation + random.signed() * innovation;
    opacityTrend = opacityTrend * correlation + random.signed() * innovation;
    const punctuationWeight = punctuation.has(character) ? 0.48 : 1;
    const localWeight = 0.28;
    const x = (xTrend + random.signed() * localWeight) * punctuationWeight;
    const y = (yTrend + random.signed() * localWeight) * punctuationWeight;
    const baseline = (baselineTrend + random.signed() * localWeight) * punctuationWeight;
    const rotation = (rotationTrend + random.signed() * localWeight) * punctuationWeight;
    const width = (widthTrend + random.signed() * localWeight) * punctuationWeight;
    const height = (heightTrend + random.signed() * localWeight) * punctuationWeight;
    const opacity = (opacityTrend + random.signed() * localWeight) * punctuationWeight;
    return {
      index,
      character,
      offsetX: x * strength.characterOffsetX,
      offsetY: y * strength.characterOffsetY,
      rotation: rotation * strength.characterRotation,
      scaleX: 1 + width * strength.characterScaleX,
      scaleY: 1 + height * strength.characterScaleY,
      fontSizeScale: 1 + ((width + height) / 2) * strength.characterFontSizeVariation,
      baselineOffset: baseline * strength.characterBaselineOffset,
      opacity: Math.max(0.72, Math.min(1, 1 - Math.abs(opacity) * strength.characterOpacityVariation)),
    };
  });
}
