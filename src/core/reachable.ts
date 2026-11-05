import type { RoundingMode } from "./scoring";

export type ReachabilityMode = "normal" | "fc" | "fixedCombo";

export type ReachableBucket = { start: number; end: number; count: number };

export type ReachableScoreAnalysis = {
  notes: number;
  goodCap: number;
  mode: ReachabilityMode;
  maxCombo: number | null;
  scores: number[];
  total: number;
  min: number;
  max: number;
  buckets: ReachableBucket[];
  confidence: "formula";
};

const scoreFromK = (notes: number, k: number): number => {
  // RawScore = (900000*N - 5000*K) / N. The integer expression preserves
  // nearest-with-half-up rounding without creating a floating-point score.
  const numerator = 900000 * notes - 5000 * k;
  return Math.floor((2 * numerator + notes) / (2 * notes));
};

const scoreFromCounts = (notes: number, good: number, badMiss: number, maxCombo: number): number => {
  const k = 63 * good + 180 * badMiss - 20 * maxCombo;
  return scoreFromK(notes, k);
};

const validateNotes = (notes: number) => {
  if (!Number.isInteger(notes) || notes <= 0) throw new Error("Notes must be a positive integer");
  if (notes > 10000) throw new Error("This reachability view is limited to 10,000 notes for responsiveness");
};

const mergeIntervals = (values: Set<number>[], notes: number): [number, number][][] => values.map((set) => {
  const sorted = [...set].sort((a, b) => a - b);
  const merged: [number, number][] = [];
  for (const value of sorted) {
    const start = value - notes;
    const end = value;
    const previous = merged[merged.length - 1];
    if (previous && start <= previous[1] + 1) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
});

/**
 * Build the exact theoretical normal-mode K set with 0 <= C <= N and no FC
 * restriction. B and M are grouped because they have the same score weight.
 */
const normalKIntervals = (notes: number, goodCap: number): [number, number][][] => {
  const quotientByResidue = Array.from({ length: 20 }, () => new Set<number>());
  for (let badMiss = 0; badMiss <= notes; badMiss += 1) {
    for (let good = 0; good <= Math.min(goodCap, notes - badMiss); good += 1) {
      const base = 63 * good + 180 * badMiss;
      const residue = ((base % 20) + 20) % 20;
      quotientByResidue[residue].add((base - residue) / 20);
    }
  }
  return mergeIntervals(quotientByResidue, notes);
};

const hasReachableK = (intervals: [number, number][], residue: number, minK: number, maxK: number): boolean => {
  const minQ = Math.ceil((minK - residue) / 20);
  const maxQ = Math.floor((maxK - residue) / 20);
  if (minQ > maxQ) return false;
  let low = 0;
  let high = intervals.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const interval = intervals[middle];
    if (interval[1] < minQ) low = middle + 1;
    else if (interval[0] > maxQ) high = middle - 1;
    else return true;
  }
  return false;
};

const scoresFromNormalIntervals = (notes: number, intervals: [number, number][][]): number[] => {
  const scores = new Set<number>();
  for (let residue = 0; residue < 20; residue += 1) {
    for (const [minQ, maxQ] of intervals[residue]) {
      for (let quotient = minQ; quotient <= maxQ; quotient += 1) scores.add(scoreFromK(notes, residue + quotient * 20));
    }
  }
  return [...scores].sort((a, b) => a - b);
};

const scoresFromCounts = (notes: number, maxCombo: number | null, goodCap: number): number[] => {
  const scores = new Set<number>();
  if (maxCombo === null) return scoresFromNormalIntervals(notes, normalKIntervals(notes, goodCap));
  for (let badMiss = 0; badMiss <= notes; badMiss += 1) {
    for (let good = 0; good <= Math.min(goodCap, notes - badMiss); good += 1) scores.add(scoreFromCounts(notes, good, badMiss, maxCombo));
  }
  return [...scores].sort((a, b) => a - b);
};

const addBuckets = (scores: number[], bucketSize = 5000): ReachableBucket[] => {
  const counts = new Map<number, number>();
  for (const score of scores) {
    const start = Math.floor(score / bucketSize) * bucketSize;
    counts.set(start, (counts.get(start) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([start, count]) => ({ start, end: Math.min(1_000_000, start + bucketSize - 1), count }));
};

export function nearestReachableScores(scores: number[], target: number, limit = 9): number[] {
  if (!scores.length) return [];
  let low = 0;
  let high = scores.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (scores[middle] < target) low = middle + 1;
    else high = middle;
  }
  const start = Math.max(0, low - Math.floor(limit / 2));
  return scores.slice(start, start + limit).sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
}

export function analyzeReachableScores(notes: number, mode: ReachabilityMode = "normal", maxCombo: number | null = null, goodCap = notes, _rounding: RoundingMode = "nearest"): ReachableScoreAnalysis {
  validateNotes(notes);
  const effectiveGoodCap = Math.max(0, Math.min(notes, Math.trunc(goodCap)));
  const effectiveCombo = mode === "fixedCombo" ? Math.max(0, Math.min(notes, Math.trunc(maxCombo ?? notes))) : null;
  let scores: number[];
  if (mode === "fc") {
    const values = new Set<number>();
    for (let good = 0; good <= effectiveGoodCap; good += 1) values.add(scoreFromCounts(notes, good, 0, notes));
    scores = [...values].sort((a, b) => a - b);
  } else scores = scoresFromCounts(notes, effectiveCombo, effectiveGoodCap);
  return { notes, goodCap: effectiveGoodCap, mode, maxCombo: effectiveCombo, scores, total: scores.length, min: scores[0] ?? 0, max: scores[scores.length - 1] ?? 0, buckets: addBuckets(scores), confidence: "formula" };
}
