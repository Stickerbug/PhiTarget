import { describe, expect, it } from "vitest";
import { challengeScore, formatRational, normalRawScore, score, validateScoreInput } from "../src/core/scoring";
import { solveFcTarget, solveNormalTarget } from "../src/core/solver";

describe("scoring core", () => {
  it("calculates a perfect normal score", () => {
    const result = score({ notes: 1000, perfect: 1000, good: 0, bad: 0, miss: 0, maxCombo: 1000 });
    expect(result.display).toBe(1000000n);
    expect(formatRational(result.raw)).toBe("1000000.000");
  });

  it("keeps the normal formula exact as a rational", () => {
    const raw = normalRawScore({ notes: 1000, perfect: 900, good: 100, bad: 0, miss: 0, maxCombo: 1000 });
    expect(raw.numerator).toBe(968500n);
    expect(raw.denominator).toBe(1n);
  });

  it("does not add combo points in challenge mode", () => {
    const result = challengeScore({ notes: 1000, perfect: 900, good: 100, bad: 0, miss: 0 });
    expect(result.display).toBe(965000n);
  });

  it("rejects inconsistent judgement counts", () => {
    expect(() => validateScoreInput({ notes: 10, perfect: 9, good: 0, bad: 0, miss: 0, maxCombo: 10 })).toThrow(/equal notes/);
  });

  it("solves an FC target", () => {
    const exact = solveFcTarget(1000, 968500, "exact");
    expect(exact[0]?.good).toBe(100);
    expect(exact[0]?.perfect).toBe(900);
  });

  it("solves very large custom note counts without enumerating every Good count", () => {
    const result = solveFcTarget(10_000_000, 999999, "nearest");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.good).toBeGreaterThanOrEqual(0);
  });

  it("groups Bad and Miss for normal-mode target solving", () => {
    const result = solveNormalTarget(1000, 800, 830000, "nearest");
    expect(result[0]?.badMiss).toBeGreaterThanOrEqual(0);
    expect(result[0]?.perfect + result[0]?.good + result[0]?.badMiss).toBe(1000);
  });
});
