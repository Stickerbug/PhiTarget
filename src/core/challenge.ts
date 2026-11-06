import { challengeScore, type RoundingMode } from "./scoring";

export type ChallengeMatch = "exact" | "atLeast" | "nearest";

export type ChallengeSolution = {
  perfect: number;
  good: number;
  badMiss: number;
  score: number;
  delta: number;
};

/**
 * Community candidate thresholds used by the planner. Keep these separate
 * from normal score ranks: challenge mode sums three accuracy-only scores.
 * The target game version should still be calibrated with real result screens.
 */
export const challengeBadgeRules = [
  { id: "green", label: "绿", threshold: 2_460_000, color: "#76bd42" },
  { id: "blue", label: "蓝", threshold: 2_700_000, color: "#40a9e8" },
  { id: "red", label: "红", threshold: 2_850_000, color: "#e52a32" },
  { id: "gold", label: "金", threshold: 2_940_000, color: "#e2aa42" },
  { id: "rainbow", label: "彩", threshold: 3_000_000, color: "#d7d1ff" },
] as const;

export type ChallengeBadgeId = (typeof challengeBadgeRules)[number]["id"];

const candidate = (notes: number, target: number, good: number, badMiss: number, rounding: RoundingMode): ChallengeSolution => {
  const result = challengeScore({ notes, perfect: notes - good - badMiss, good, bad: badMiss, miss: 0 }, rounding);
  const score = Number(result.display);
  return { perfect: notes - good - badMiss, good, badMiss, score, delta: score - target };
};

/**
 * In challenge mode there is no combo contribution. Bad and Miss are grouped
 * here because they have the same score weight in the count-level model.
 */
export function solveChallengeTarget(notes: number, target: number, match: ChallengeMatch, rounding: RoundingMode = "nearest", goodCap = notes): ChallengeSolution[] {
  if (!Number.isInteger(notes) || notes <= 0) throw new Error("Notes must be a positive integer");
  if (!Number.isInteger(target) || target < 0 || target > 1_000_000) throw new Error("Challenge target must be between 0 and 1,000,000");
  if (!Number.isInteger(goodCap) || goodCap < 0 || goodCap > notes) throw new Error("Good cap must be between zero and notes");

  const candidates: ChallengeSolution[] = [];
  // Raw = 1,000,000 - (350,000 * Good + 1,000,000 * BadMiss) / N.
  // Solve the affine Good value for each error count instead of enumerating
  // every Good × BadMiss pair.
  for (let badMiss = 0; badMiss <= notes; badMiss += 1) {
    const numerator = (1_000_000 * notes) - (1_000_000 * badMiss) - (target * notes);
    const idealGood = Math.round(numerator / 350_000);
    for (const good of [idealGood - 1, idealGood, idealGood + 1]) {
      if (good < 0 || good > goodCap || good + badMiss > notes) continue;
      candidates.push(candidate(notes, target, good, badMiss, rounding));
    }
  }
  candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.badMiss - b.badMiss || a.good - b.good);
  if (match === "nearest") return candidates.slice(0, 5);
  if (match === "exact") return candidates.filter((item) => item.delta === 0).slice(0, 10);
  return candidates.filter((item) => item.delta >= 0).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.badMiss - b.badMiss).slice(0, 5);
}
