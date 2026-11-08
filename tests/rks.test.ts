import { describe, expect, it } from "vitest";
import { buildB30Model, normalizeAccuracy, singleRks } from "../src/core/rks";
import type { ChartRecord } from "../src/data/types";
import type { PhigrosCloudRecord } from "../src/core/phigrosCloud";

const chart = (id: string, constant: number): ChartRecord => ({
  chartId: id,
  songId: id,
  title: id,
  chapter: "Single",
  difficulty: "in",
  level: Math.floor(constant),
  constant,
  composer: "",
  illustrator: "",
  charter: "",
  noteCounts: { tap: 1, hold: 1, drag: 1, flick: 1 },
  noteCount: 4,
  bpm: null,
  duration: null,
  sourceVersion: "test",
});

const record = (chartId: string, score: number, accuracy: number | null, fc = false): PhigrosCloudRecord => ({
  id: chartId,
  chartId,
  songId: chartId,
  difficulty: "in",
  score,
  accuracy,
  fc,
  playedAt: "2026-11-07T00:00:00Z",
  source: "taptap",
});

describe("RKS and B30 model", () => {
  it("normalizes fraction and percentage accuracy", () => {
    expect(normalizeAccuracy(0.9876)).toBeCloseTo(98.76);
    expect(normalizeAccuracy(98.76)).toBeCloseTo(98.76);
  });

  it("uses the community RKS curve", () => {
    expect(singleRks(16, 100)).toBe(16);
    expect(singleRks(16, 69.99)).toBe(0);
    expect(singleRks(16, 77.5)).toBeCloseTo(4, 5);
  });

  it("selects Phi 3 plus the best remaining 27 and marks incomplete data", () => {
    const charts = Array.from({ length: 31 }, (_, index) => chart(`song-${index}`, 10 + index / 10));
    const records = charts.map((item, index) => record(item.chartId, index < 4 ? 1_000_000 : 980_000, index < 4 ? null : 98, index < 4));
    const model = buildB30Model(charts, records);
    expect(model.phiEntries).toHaveLength(3);
    expect(model.selectedEntries).toHaveLength(30);
    expect(model.b27Entries).toHaveLength(27);
    expect(model.complete).toBe(true);
    expect(model.b30Rks).not.toBeNull();
    expect(model.overflowEntries).toHaveLength(1);
  });

  it("supports a configurable B count while keeping Phi separate", () => {
    const charts = Array.from({ length: 12 }, (_, index) => chart(`custom-${index}`, 12 + index / 10));
    const records = charts.map((item, index) => record(item.chartId, index < 3 ? 1_000_000 : 990_000 - index * 100, index < 3 ? 100 : 99, index < 3));
    const model = buildB30Model(charts, records, 5);
    expect(model.bestCount).toBe(5);
    expect(model.phiEntries).toHaveLength(3);
    expect(model.bestEntries).toHaveLength(5);
    expect(model.selectedEntries).toHaveLength(8);
    expect(model.b30Rks).toBeCloseTo(model.selectedEntries.reduce((sum, entry) => sum + entry.singleRks, 0) / 8);
  });
});

