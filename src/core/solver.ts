import { score, type RoundingMode, type ScoreResult } from "./scoring";

export type TargetMatch = "exact" | "atLeast" | "nearest";

export type FcSolution = {
  good: number;
  perfect: number;
  bad: 0;
  miss: 0;
  maxCombo: number;
  result: ScoreResult;
  delta: number;
};

export function solveFcTarget(notes: number, target: number, match: TargetMatch, rounding: RoundingMode = "nearest"): FcSolution[] {
  if (!Number.isInteger(notes) || notes <= 0) throw new Error("Notes must be a positive integer");
  if (!Number.isInteger(target) || target < 0) throw new Error("Target must be a non-negative integer");
  const candidate = (good: number): FcSolution => {
    const result = score({ notes, perfect: notes - good, good, bad: 0, miss: 0, maxCombo: notes }, rounding);
    const achieved = Number(result.display);
    return { good, perfect: notes - good, bad: 0, miss: 0, maxCombo: notes, result, delta: achieved - target };
  };
  const achievedAt = (good: number) => Number(candidate(good).result.display);
  let low = 0;
  let high = notes;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (achievedAt(mid) >= target) low = mid + 1;
    else high = mid;
  }
  const boundary = Math.max(0, Math.min(notes, low));
  const nearby = [...new Set([boundary - 2, boundary - 1, boundary, boundary + 1, boundary + 2])]
    .filter((good) => good >= 0 && good <= notes)
    .map(candidate)
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.good - b.good);
  if (match === "nearest") return nearby.slice(0, 3);
  if (match === "exact") return nearby.filter((item) => item.delta === 0).slice(0, 10);
  return nearby.filter((item) => item.delta >= 0).sort((a, b) => b.good - a.good).slice(0, 1);
}
