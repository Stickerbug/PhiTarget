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
  const solutions: FcSolution[] = [];
  for (let good = 0; good <= notes; good += 1) {
    const result = score({ notes, perfect: notes - good, good, bad: 0, miss: 0, maxCombo: notes }, rounding);
    const achieved = Number(result.display);
    const candidate: FcSolution = { good, perfect: notes - good, bad: 0, miss: 0, maxCombo: notes, result, delta: achieved - target };
    if ((match === "exact" && achieved === target) || (match === "atLeast" && achieved >= target)) solutions.push(candidate);
    if (match === "nearest") solutions.push(candidate);
  }
  if (match === "nearest") {
    solutions.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.good - b.good);
    return solutions.slice(0, 3);
  }
  return solutions.sort((a, b) => a.good - b.good).slice(0, 10);
}
