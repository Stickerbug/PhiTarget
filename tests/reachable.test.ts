import { describe, expect, it } from "vitest";
import { analyzeReachableScores } from "../src/core/reachable";

function bruteNormal(notes: number, maxCombo: number | null, goodCap = notes) {
  const scores = new Set<number>();
  for (let badMiss = 0; badMiss <= notes; badMiss += 1) {
    for (let good = 0; good <= Math.min(goodCap, notes - badMiss); good += 1) {
      const combos = maxCombo === null ? Array.from({ length: notes + 1 }, (_, value) => value) : [maxCombo];
      for (const combo of combos) {
        const numerator = 900000 * (notes - good - badMiss) + 585000 * good + 100000 * combo;
        scores.add(Math.floor((2 * numerator + notes) / (2 * notes)));
      }
    }
  }
  return [...scores].sort((a, b) => a - b);
}

describe("reachable score analysis", () => {
  it("matches brute force for unrestricted normal mode", () => {
    for (const notes of [1, 2, 3, 5, 8]) {
      const actual = analyzeReachableScores(notes, "normal").scores;
      expect(actual).toEqual(bruteNormal(notes, null));
    }
  });

  it("matches brute force for fixed combo and exposes a compact summary", () => {
    const actual = analyzeReachableScores(8, "fixedCombo", 5);
    expect(actual.scores).toEqual(bruteNormal(8, 5));
    expect(actual.total).toBe(actual.scores.length);
    expect(actual.buckets.length).toBeGreaterThan(0);
  });

  it("excludes Good results beyond the Tap+Hold cap", () => {
    const actual = analyzeReachableScores(8, "normal", null, 3);
    expect(actual.scores).toEqual(bruteNormal(8, null, 3));
    expect(analyzeReachableScores(8, "fc", null, 3).total).toBe(4);
  });

  it("counts FC scores without requiring the normal error model", () => {
    const actual = analyzeReachableScores(1000, "fc");
    expect(actual.total).toBe(1001);
    expect(actual.min).toBe(685000);
    expect(actual.max).toBe(1000000);
  });

  it("produces a bounded normal-mode result for a typical chart", () => {
    const actual = analyzeReachableScores(1000, "normal");
    expect(actual.total).toBe(198310);
    expect(actual.max).toBe(1000000);
  });
});
