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

export type NormalSolution = {
  good: number;
  perfect: number;
  badMiss: number;
  maxCombo: number;
  result: ScoreResult;
  delta: number;
};

export function solveFcTarget(notes: number, target: number, match: TargetMatch, rounding: RoundingMode = "nearest", goodCap = notes): FcSolution[] {
  if (!Number.isInteger(notes) || notes <= 0) throw new Error("Notes must be a positive integer");
  if (!Number.isInteger(target) || target < 0) throw new Error("Target must be a non-negative integer");
  if (!Number.isInteger(goodCap) || goodCap < 0 || goodCap > notes) throw new Error("Good cap must be between zero and notes");
  const candidate = (good: number): FcSolution => {
    const result = score({ notes, perfect: notes - good, good, bad: 0, miss: 0, maxCombo: notes }, rounding);
    const achieved = Number(result.display);
    return { good, perfect: notes - good, bad: 0, miss: 0, maxCombo: notes, result, delta: achieved - target };
  };
  const achievedAt = (good: number) => Number(candidate(good).result.display);
  let low = 0;
  let high = goodCap;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (achievedAt(mid) >= target) low = mid + 1;
    else high = mid;
  }
  const boundary = Math.max(0, Math.min(goodCap, low));
  const nearby = [...new Set([boundary - 2, boundary - 1, boundary, boundary + 1, boundary + 2])]
    .filter((good) => good >= 0 && good <= goodCap)
    .map(candidate)
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.good - b.good);
  if (match === "nearest") return nearby.slice(0, 3);
  if (match === "exact") return nearby.filter((item) => item.delta === 0).slice(0, 10);
  return nearby.filter((item) => item.delta >= 0).sort((a, b) => b.good - a.good).slice(0, 1);
}

/** Solve a normal-mode target while grouping Bad and Miss into one score-equivalent error count. */
export function solveNormalTarget(notes: number, maxCombo: number, target: number, match: TargetMatch, rounding: RoundingMode = "nearest", goodCap = notes): NormalSolution[] {
  if (!Number.isInteger(notes) || notes <= 0) throw new Error("Notes must be a positive integer");
  if (!Number.isInteger(maxCombo) || maxCombo < 0 || maxCombo > notes) throw new Error("Max Combo must be between zero and notes");
  if (!Number.isInteger(target) || target < 0) throw new Error("Target must be a non-negative integer");
  if (!Number.isInteger(goodCap) || goodCap < 0 || goodCap > notes) throw new Error("Good cap must be between zero and notes");
  const candidate = (good: number, badMiss: number): NormalSolution => {
    const result = score({ notes, perfect: notes - good - badMiss, good, bad: badMiss, miss: 0, maxCombo }, rounding);
    const achieved = Number(result.display);
    return { good, perfect: notes - good - badMiss, badMiss, maxCombo, result, delta: achieved - target };
  };
  const candidates: NormalSolution[] = [];
  // The score is affine in Good and in the grouped Bad+Miss count. For each error count,
  // calculate the Good value nearest the target instead of enumerating Good × errors.
  const base = 900000 * notes + 100000 * maxCombo - target * notes;
  for (let badMiss = 0; badMiss <= notes; badMiss += 1) {
    const idealGood = Math.round((base - 900000 * badMiss) / 315000);
    for (const good of [idealGood - 1, idealGood, idealGood + 1]) {
      if (good < 0 || good > goodCap || good + badMiss > notes) continue;
      candidates.push(candidate(good, badMiss));
    }
  }
  candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.badMiss - b.badMiss || a.good - b.good);
  if (match === "nearest") return candidates.slice(0, 5);
  if (match === "exact") return candidates.filter((item) => item.delta === 0).slice(0, 10);
  return candidates.filter((item) => item.delta >= 0).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta)).slice(0, 5);
}

/**
 * Solve a normal-mode target without forcing FC or one fixed Max Combo.
 * This is a fast theoretical search: it samples the combo range evenly and
 * solves the affine Good value for every grouped Bad+Miss count. It is useful
 * for the default reachability view; exact sequence validation still needs a
 * full chart event model.
 */
export function solveNormalUnrestrictedTarget(notes: number, target: number, match: TargetMatch, rounding: RoundingMode = "nearest", goodCap = notes): NormalSolution[] {
  if (!Number.isInteger(notes) || notes <= 0) throw new Error("Notes must be a positive integer");
  if (!Number.isInteger(target) || target < 0) throw new Error("Target must be a non-negative integer");
  if (!Number.isInteger(goodCap) || goodCap < 0 || goodCap > notes) throw new Error("Good cap must be between zero and notes");
  const candidate = (good: number, badMiss: number, maxCombo: number): NormalSolution => {
    const result = score({ notes, perfect: notes - good - badMiss, good, bad: badMiss, miss: 0, maxCombo }, rounding);
    const achieved = Number(result.display);
    return { good, perfect: notes - good - badMiss, badMiss, maxCombo, result, delta: achieved - target };
  };
  const candidates: NormalSolution[] = [];
  const step = Math.max(1, Math.floor(notes / 80));
  const combos = new Set<number>();
  for (let combo = 0; combo <= notes; combo += step) combos.add(combo);
  combos.add(notes);
  for (let badMiss = 0; badMiss <= notes; badMiss += 1) {
    for (const maxCombo of combos) {
      const base = 900000 * notes + 100000 * maxCombo - target * notes;
      const idealGood = Math.round((base - 900000 * badMiss) / 315000);
      for (const good of [idealGood - 1, idealGood, idealGood + 1]) {
        if (good < 0 || good > goodCap || good + badMiss > notes) continue;
        candidates.push(candidate(good, badMiss, maxCombo));
      }
    }
  }
  candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.badMiss - b.badMiss || a.maxCombo - b.maxCombo);
  if (match === "nearest") return candidates.slice(0, 5);
  if (match === "exact") return candidates.filter((item) => item.delta === 0).slice(0, 10);
  return candidates.filter((item) => item.delta >= 0).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta)).slice(0, 5);
}
