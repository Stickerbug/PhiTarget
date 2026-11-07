import { describe, expect, it } from "vitest";
import { parsePhigrosCloudSave } from "../src/core/phigrosCloud";
import type { ChartRecord } from "../src/data/types";

const charts = [
  { chartId: "Demo.Author::ez", songId: "Demo.Author", title: "Demo", chapter: "Single", difficulty: "ez", level: 4, constant: 4, composer: "Author", illustrator: "Artist", charter: "Chart", noteCounts: { tap: 1, drag: 1, hold: 1, flick: 1 }, noteCount: 4, bpm: "120", duration: "1:00", sourceVersion: "test" },
  { chartId: "Demo.Author::in", songId: "Demo.Author", title: "Demo", chapter: "Single", difficulty: "in", level: 13, constant: 13, composer: "Author", illustrator: "Artist", charter: "Chart", noteCounts: { tap: 1, drag: 1, hold: 1, flick: 1 }, noteCount: 4, bpm: "120", duration: "1:00", sourceVersion: "test" },
] satisfies ChartRecord[];

describe("TapTap cloud save mapping", () => {
  it("maps gameRecord difficulty slots to known charts", () => {
    const result = parsePhigrosCloudSave({ data: { saveInfo: { PlayerId: "TestPlayer", summary: { rankingScore: 13.37, challengeModeRank: 302, updatedAt: "2026-11-06T00:00:00Z" } }, gameRecord: { "Demo.Author.0": [{ score: 1_000_000, acc: 100, fc: true }, null, { score: 987_654, acc: 98.76, fc: false }] } } }, charts, "2026-11-06T00:00:00Z");
    expect(result.profile).toMatchObject({ playerId: "TestPlayer", playerName: "", rks: 13.37, challengeModeRank: 302 });
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({ chartId: "Demo.Author::ez", songId: "Demo.Author", score: 1_000_000, fc: true, source: "taptap" });
    expect(result.records[1]).toMatchObject({ chartId: "Demo.Author::in", score: 987_654, accuracy: 98.76 });
  });

  it("does not treat empty zero-score slots as played records", () => {
    const result = parsePhigrosCloudSave({ saveInfo: { PlayerId: "TestPlayer" }, gameRecord: { "Demo.Author.0": [{ score: 0, acc: 0, fc: false }, null, null] } }, charts, "2026-11-06T00:00:00Z");
    expect(result.records).toHaveLength(0);
    expect(result.profile.playerId).toBe("TestPlayer");
  });
});
