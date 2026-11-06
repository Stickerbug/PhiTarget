import { describe, expect, it } from "vitest";
import { solveChallengeTarget } from "../src/core/challenge";

describe("challenge mode core", () => {
  it("solves the accuracy-only formula without combo points", () => {
    const result = solveChallengeTarget(1000, 965000, "exact");
    expect(result[0]?.good).toBe(100);
    expect(result[0]?.perfect).toBe(900);
    expect(result[0]?.badMiss).toBe(0);
  });

  it("respects the Tap + Hold Good cap", () => {
    const result = solveChallengeTarget(1000, 965000, "nearest", "nearest", 40);
    expect(result.every((item) => item.good <= 40)).toBe(true);
  });
});
