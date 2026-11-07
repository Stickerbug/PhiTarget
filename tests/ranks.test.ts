import { describe, expect, it } from "vitest";
import { rankForScore } from "../src/core/ranks";

describe("score rank thresholds", () => {
  it("includes threshold boundaries", () => {
    expect(rankForScore(0)).toBe("F");
    expect(rankForScore(700_000)).toBe("C");
    expect(rankForScore(820_000)).toBe("B");
    expect(rankForScore(880_000)).toBe("A");
    expect(rankForScore(920_000)).toBe("S");
    expect(rankForScore(960_000)).toBe("V");
    expect(rankForScore(1_000_000)).toBe("phi");
  });

  it("gives blue V priority to full combo scores below Phi", () => {
    expect(rankForScore(700_000, true)).toBe("blueV");
    expect(rankForScore(999_999, true)).toBe("blueV");
    expect(rankForScore(1_000_000, true)).toBe("phi");
  });
});

