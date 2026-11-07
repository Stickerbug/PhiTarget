import { describe, expect, it } from "vitest";
import { challengeScore, formatRational, normalRawScore, score, validateScoreInput } from "../src/core/scoring";
import { solveFcTarget, solveNormalTarget, solveNormalUnrestrictedTarget } from "../src/core/solver";

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
    expect(() => validateScoreInput({ notes: 4, perfect: 0, good: 0, bad: 4, miss: 0, maxCombo: 4 })).toThrow(/Perfect \+ Good/);
    expect(() => validateScoreInput({ notes: 4, perfect: 4, good: 0, bad: 0, miss: 0, maxCombo: 0 })).toThrow(/theoretical minimum/);
  });

  it("solves an FC target", () => {
    const exact = solveFcTarget(1000, 968500, "exact");
    expect(exact[0]?.good).toBe(100);
    expect(exact[0]?.perfect).toBe(900);
  });

  it("respects a Tap+Hold Good cap", () => {
    const fc = solveFcTarget(1000, 968500, "nearest", "nearest", 50);
    expect(fc.every((item) => item.good <= 50)).toBe(true);
    const normal = solveNormalTarget(1000, 800, 830000, "nearest", "nearest", 50);
    expect(normal.every((item) => item.good <= 50)).toBe(true);
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

  it("keeps the unrestricted normal-mode search bounded", () => {
    const result = solveNormalUnrestrictedTarget(2000, 950000, "nearest");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.maxCombo).toBeGreaterThanOrEqual(0);
  });

  it("does not assign combo to an all-Bad/Miss result", () => {
    const result = solveNormalUnrestrictedTarget(4, 100000, "nearest");
    expect(result.some((item) => item.badMiss === 4 && item.maxCombo > 0)).toBe(false);
    const perfectWithoutCombo = solveNormalUnrestrictedTarget(4, 900000, "exact");
    expect(perfectWithoutCombo.some((item) => item.perfect === 4 && item.maxCombo === 0)).toBe(false);
  });
});
