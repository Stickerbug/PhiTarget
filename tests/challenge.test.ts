import { describe, expect, it } from "vitest";
import { findChallengeCombinations, solveChallengeTarget } from "../src/core/challenge";

const chart = (songId: string, constant: number): import("../src/data/types").ChartRecord => ({
  chartId: `${songId}::in`,
  songId,
  title: songId,
  chapter: "Chapter 5",
  difficulty: "in",
  level: Math.floor(constant),
  constant,
  composer: "",
  illustrator: "",
  charter: "",
  noteCounts: { tap: 50, hold: 20, drag: 20, flick: 10 },
  noteCount: 100,
  bpm: "140",
  duration: "2:00",
  sourceVersion: "test",
});

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

  it("finds three distinct songs from personal scores", () => {
    const charts = [chart("a", 14), chart("b", 14.2), chart("c", 14.4), chart("d", 15)];
    const personal = new Map([["a::in", 950000], ["b::in", 950000], ["c::in", 950000], ["d::in", 900000]]);
    const plans = findChallengeCombinations(charts, 2_850_000, "atLeast", { personalBest: personal, usePersonal: true });
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0]?.personal).toBe(true);
    expect(plans[0]?.totalScore).toBeGreaterThanOrEqual(2_850_000);
    expect(new Set(plans[0]?.charts.map((item) => item.songId)).size).toBe(3);
  });

  it("returns formula combinations without personal records", () => {
    const plans = findChallengeCombinations([chart("a", 14), chart("b", 14.2), chart("c", 14.4), chart("d", 15)], 2_940_000, "nearest");
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0]?.personal).toBe(false);
    expect(plans[0]?.charts).toHaveLength(3);
  });

  it("keeps at-least and exact combination modes honest", () => {
    const charts = [chart("a", 14), chart("b", 14.2), chart("c", 14.4)];
    const atLeast = findChallengeCombinations(charts, 2_850_000, "atLeast", {
      personalBest: new Map([["a::in", 950_000], ["b::in", 950_000], ["c::in", 950_000]]),
      usePersonal: true,
    });
    expect(atLeast.every((plan) => plan.totalScore >= 2_850_000)).toBe(true);
    const exact = findChallengeCombinations(charts, 2_850_001, "exact", {
      personalBest: new Map([["a::in", 950_000], ["b::in", 950_000], ["c::in", 950_000]]),
      usePersonal: true,
    });
    expect(exact).toHaveLength(0);
  });
});
