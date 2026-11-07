import { describe, expect, it } from "vitest";
import { findControlPlans, simulateControlPlan } from "../src/core/controlAnalysis";
import { parseChartTimeline } from "../src/core/chartTimeline";

describe("chart timeline and control analysis", () => {
  it("keeps deterministic order and converts Phigros chart time", () => {
    const timeline = parseChartTimeline({
      formatVersion: 3,
      offset: 0,
      judgeLineList: [{
        bpm: 120,
        notesAbove: [{ type: 1, time: 32, positionX: 1 }, { type: 2, time: 16, positionX: 2 }],
        notesBelow: [{ type: 4, time: 16, positionX: -1 }],
      }],
    });
    expect(timeline.events.map((event) => event.type)).toEqual(["drag", "flick", "tap"]);
    expect(timeline.events[0]?.timeMs).toBe(250);
    expect(timeline.events[2]?.timeMs).toBe(500);
  });

  it("counts notes hit before a delayed Miss in the same Combo", () => {
    const timeline = {
      formatVersion: 3,
      offsetMs: 0,
      ticksPerBeat: 32,
      bpm: 223,
      durationMs: 300,
      hasLineTransforms: false,
      events: [0, 100, 130, 160, 200, 240, 270, 300].map((timeMs, index) => ({
        index: index + 1,
        type: index === 1 ? "tap" as const : "drag" as const,
        time: timeMs,
        timeMs,
        positionX: 0,
        holdTime: 0,
        holdTimeMs: 0,
        lineIndex: 0,
        side: "above" as const,
        sourceIndex: index,
        bpm: 223,
      })),
    };
    const result = simulateControlPlan(timeline, { breakIndex: 2, releaseAfter: 8 }, "nearest");
    expect(result.perfect).toBe(7);
    expect(result.miss).toBe(1);
    expect(result.delayedPerfectCount).toBe(5);
    expect(result.maxCombo).toBe(6);
    expect(result.firstEventAfterMissCommit?.index).toBe(8);
  });

  it("searches for a target with zero Good before considering harder breaks", () => {
    const timeline = {
      formatVersion: 3,
      offsetMs: 0,
      ticksPerBeat: 32,
      bpm: 223,
      durationMs: 1000,
      hasLineTransforms: false,
      events: Array.from({ length: 10 }, (_, index) => ({
        index: index + 1,
        type: index === 2 ? "tap" as const : "drag" as const,
        time: index * 100,
        timeMs: index * 100,
        positionX: 0,
        holdTime: 0,
        holdTimeMs: 0,
        lineIndex: 0,
        side: "above" as const,
        sourceIndex: index,
        bpm: 223,
      })),
    };
    const target = Number(simulateControlPlan(timeline, { breakIndex: 3, releaseAfter: 8 }).result.display);
    const plans = findControlPlans(timeline, { target, match: "exact", maxPlans: 3 });
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0]?.good).toBe(0);
    expect(plans[0]?.delta).toBe(0);
  });

  it("can search a Drag break when the strategy explicitly allows it", () => {
    const timeline = {
      formatVersion: 3,
      offsetMs: 0,
      ticksPerBeat: 32,
      bpm: 223,
      durationMs: 1000,
      hasLineTransforms: false,
      events: Array.from({ length: 10 }, (_, index) => ({
        index: index + 1,
        type: "drag" as const,
        time: index * 100,
        timeMs: index * 100,
        positionX: 0,
        holdTime: 0,
        holdTimeMs: 0,
        lineIndex: 0,
        side: "above" as const,
        sourceIndex: index,
        bpm: 223,
      })),
    };
    const target = Number(simulateControlPlan(timeline, { breakIndex: 4, releaseAfter: 8 }).result.display);
    const plans = findControlPlans(timeline, { target, match: "exact", maxPlans: 3, candidateTypes: ["drag"] });
    expect(plans.some((plan) => plan.breakNote.type === "drag")).toBe(true);
  });
});
