import { describe, expect, it } from "vitest";
import { parsePlayerCsv, parsePlayerJson } from "../src/core/playerImport";
import type { ChartRecord } from "../src/data/types";

const chart = { chartId: "Demo.Author::in", songId: "Demo.Author", title: "Demo", chapter: "Single", difficulty: "in", level: 13, constant: 13, composer: "Author", illustrator: "Artist", charter: "Chart", noteCounts: { tap: 1, drag: 1, hold: 1, flick: 1 }, noteCount: 4, bpm: "120", duration: "1:00", sourceVersion: "test" } satisfies ChartRecord;

describe("local score imports", () => {
  it("maps generic JSON records to known chart ids", () => {
    const records = parsePlayerJson(JSON.stringify({ records: [{ songId: "Demo.Author", difficulty: "IN", score: 987654, fc: true }] }), [chart]);
    expect(records[0]).toMatchObject({ chartId: chart.chartId, score: 987654, fc: true, source: "json" });
  });

  it("accepts CSV headers and ignores unknown rows", () => {
    const records = parsePlayerCsv("chartId,score,fc\nDemo.Author::in,900000,1\nUnknown::in,800000,0\n", [chart]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ chartId: chart.chartId, score: 900000, fc: true, source: "csv" });
  });
});
