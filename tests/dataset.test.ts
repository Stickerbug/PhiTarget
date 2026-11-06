import { describe, expect, it } from "vitest";
import rawDataset from "../src/data/charts.json";
import rawConstraints from "../src/data/chartConstraints.json";

describe("chart library metadata", () => {
  it("keeps game order and community search aliases", () => {
    const dataset = rawDataset as typeof rawDataset & { songMeta: Record<string, { songOrder: number; searchKeywords: string[] }> };
    expect(dataset.charts[0]?.title).toBe("Glaciaxion");
    const destruction = dataset.songMeta["DESTRUCTION321.Normal1zervsBrokenNerdz"];
    expect(destruction?.searchKeywords).toContain("321");
    expect(destruction?.searchKeywords).toContain("8.5");
  });

  it("keeps note types in Tap/Drag/Hold/Flick order and matches the offline profiles", () => {
    const dataset = rawDataset as typeof rawDataset;
    const constraints = rawConstraints as typeof rawConstraints;
    const glaciaxion = dataset.charts.find((chart) => chart.chartId === "Glaciaxion.SunsetRay::ez");
    const profile = constraints.charts["Glaciaxion.SunsetRay::ez"];
    expect(glaciaxion?.noteCounts).toEqual({ tap: 34, drag: 1, hold: 25, flick: 6 });
    expect(profile.matchesDeclaredNoteCounts).toBe(true);
    expect(constraints.complete).toBe(true);
  });
});
