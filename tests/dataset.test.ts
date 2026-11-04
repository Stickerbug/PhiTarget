import { describe, expect, it } from "vitest";
import rawDataset from "../src/data/charts.json";

describe("chart library metadata", () => {
  it("keeps game order and community search aliases", () => {
    const dataset = rawDataset as typeof rawDataset & { songMeta: Record<string, { songOrder: number; searchKeywords: string[] }> };
    expect(dataset.charts[0]?.title).toBe("Glaciaxion");
    const destruction = dataset.songMeta["DESTRUCTION321.Normal1zervsBrokenNerdz"];
    expect(destruction?.searchKeywords).toContain("321");
    expect(destruction?.searchKeywords).toContain("8.5");
  });
});
