export const PLUTCHIK_8 = [
    "Joy",
    "Trust",
    "Fear",
    "Surprise",
    "Sadness",
    "Disgust",
    "Anger",
    "Anticipation",
  ] as const;
  
  export type PlutchikPrimary = (typeof PLUTCHIK_8)[number];
  
  // 8 families × 4 modern sub-emotions = 32 total
  export const TIER2_BY_TIER1: Record<PlutchikPrimary, readonly string[]> = {
    Joy: ["Gratitude", "Pride", "Relief", "Calm"],
    Trust: ["Acceptance", "Love", "Safety", "Admiration"],
    Fear: ["Anxiety", "Insecurity", "Dread", "Panic"],
    Surprise: ["Awe", "Shock", "Confusion", "Wonder"],
    Sadness: ["Grief", "Loneliness", "Disappointment", "Guilt"],
    Disgust: ["Shame", "Embarrassment", "Aversion", "Contempt"],
    Anger: ["Frustration", "Resentment", "Irritation", "Rage"],
    Anticipation: ["Hope", "Curiosity", "Determination", "Nervousness"],
  } as const;
  
  export const EMOTIONS_32 = Object.values(TIER2_BY_TIER1).flat() as readonly string[];
  
  export const TIER1_BY_TIER2: Record<string, PlutchikPrimary> = Object.fromEntries(
    Object.entries(TIER2_BY_TIER1).flatMap(([tier1, tier2s]) =>
      (tier2s as readonly string[]).map((t2) => [t2, tier1 as PlutchikPrimary])
    )
  ) as Record<string, PlutchikPrimary>;
  