import type { PlutchikPrimary } from "./emotions";
import { TIER2_BY_TIER1 } from "./emotions";

const BASE_HUE: Record<PlutchikPrimary, number> = {
  Joy: 45,          // softer golden
  Trust: 150,       // mint/seafoam
  Fear: 265,        // lavender-purple
  Surprise: 205,    // powder blue
  Sadness: 225,     // periwinkle
  Disgust: 105,     // sage
  Anger: 12,        // coral
  Anticipation: 315 // mauve/pink
};

  // how wide each family’s arc is on the hue wheel
  const HUE_SPAN = 50; // degrees (±14)  

function hsl(h: number, s: number, l: number) {
  return `hsl(${h} ${s}% ${l}%)`;
}

/**
 * Tier1 hue + Tier2 shade.
 * - Tier1: consistent base hue
 * - Tier2: same hue, small sat/lightness adjustments by index
 */
export function emotionColor(tier1?: string, tier2?: string) {
    const t1 = tier1 as PlutchikPrimary | undefined;
    if (!t1 || !(t1 in BASE_HUE)) {
      return "hsl(220 10% 60%)";
    }
  
    const baseHue = BASE_HUE[t1];
    const list = TIER2_BY_TIER1[t1] as readonly string[];
  
    const idx = tier2 ? list.indexOf(tier2) : 0;
    const count = list.length || 1;
  
    // spread tier-2 emotions across the arc
    const offset =
      count > 1
        ? ((idx / (count - 1)) - 0.5) * HUE_SPAN
        : 0;

    const hue = (baseHue + offset + 360) % 360;
  
    return `hsl(${hue} 72% 58%)`;
  }
  

export function emotionBg(tier1?: string, tier2?: string) {
  // translucent background for pills
  const c = emotionColor(tier1, tier2);
  // convert "hsl(h s% l%)" to "hsla(h s% l% / a)" by string surgery
  return c.replace("hsl(", "hsla(").replace(")", " / 0.16)");
}