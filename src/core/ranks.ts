export type ScoreRank = "F" | "C" | "B" | "A" | "S" | "V" | "blueV" | "phi";

/**
 * Phigros-style score labels used by the calculator and B30 preview.
 * Blue V is checked before the ordinary score thresholds because a full
 * combo takes precedence over C/B/A/S/V for every non-Phi score.
 */
export const rankForScore = (score: number, fullCombo = false): ScoreRank => {
  if (score >= 1_000_000) return "phi";
  if (fullCombo) return "blueV";
  if (score >= 960_000) return "V";
  if (score >= 920_000) return "S";
  if (score >= 880_000) return "A";
  if (score >= 820_000) return "B";
  if (score >= 700_000) return "C";
  return "F";
};

export const rankLabel: Record<ScoreRank, string> = {
  F: "F",
  C: "C",
  B: "B",
  A: "A",
  S: "S",
  V: "V",
  blueV: "蓝V",
  phi: "Phi",
};

