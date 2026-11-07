import type { ChartRecord } from "../data/types";

export type ChartNoteType = "tap" | "drag" | "hold" | "flick" | "unknown";
export type ChartNoteSide = "above" | "below";

export type ChartEvent = {
  index: number;
  type: ChartNoteType;
  time: number;
  timeMs: number;
  positionX: number;
  holdTime: number;
  holdTimeMs: number;
  lineIndex: number;
  side: ChartNoteSide;
  sourceIndex: number;
  bpm: number;
};

export type ChartTimeline = {
  formatVersion: number | null;
  offsetMs: number;
  ticksPerBeat: number;
  bpm: number;
  events: ChartEvent[];
  durationMs: number;
  hasLineTransforms: boolean;
};

export type TimelineOptions = {
  ticksPerBeat?: number;
  fallbackBpm?: number;
};

type RawNote = {
  type?: unknown;
  time?: unknown;
  positionX?: unknown;
  holdTime?: unknown;
};

type RawJudgeLine = {
  bpm?: unknown;
  notesAbove?: unknown;
  notesBelow?: unknown;
  judgeLineMoveEvents?: unknown;
  judgeLineRotateEvents?: unknown;
  judgeLineDisappearEvents?: unknown;
};

type RawChart = {
  formatVersion?: unknown;
  offset?: unknown;
  judgeLineList?: unknown;
};

const noteType: Record<number, ChartNoteType> = {
  1: "tap",
  2: "drag",
  3: "hold",
  4: "flick",
};

const asFiniteNumber = (value: unknown, fallback: number): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

/**
 * Convert a Phigros chart JSON file into a deterministic event timeline.
 *
 * The chart format stores time in beat subdivisions. 32 subdivisions per beat
 * is the convention used by Phigros_Resource and is configurable for future
 * chart versions. This parser intentionally keeps line/side/source ordering
 * so simultaneous notes can be analyzed without a render loop.
 */
export function parseChartTimeline(input: unknown, options: TimelineOptions = {}): ChartTimeline {
  if (!input || typeof input !== "object") throw new Error("谱面 JSON 格式无效");
  const chart = input as RawChart;
  const ticksPerBeat = options.ticksPerBeat ?? 32;
  if (!Number.isFinite(ticksPerBeat) || ticksPerBeat <= 0) throw new Error("谱面时间分辨率必须大于 0");
  const fallbackBpm = options.fallbackBpm ?? 120;
  const offsetMs = asFiniteNumber(chart.offset, 0);
  const rawLines = asArray(chart.judgeLineList) as RawJudgeLine[];
  const provisional: Omit<ChartEvent, "index">[] = [];

  rawLines.forEach((line, lineIndex) => {
    const bpm = asFiniteNumber(line.bpm, fallbackBpm);
    const beatMs = 60_000 / bpm;
    for (const [side, rawNotes] of [["above", line.notesAbove], ["below", line.notesBelow]] as const) {
      asArray(rawNotes).forEach((rawValue, sourceIndex) => {
        const rawNote = (rawValue && typeof rawValue === "object" ? rawValue : {}) as RawNote;
        const time = asFiniteNumber(rawNote.time, Number.NaN);
        if (!Number.isFinite(time)) return;
        const holdTime = Math.max(0, asFiniteNumber(rawNote.holdTime, 0));
        const typeValue = Number(rawNote.type);
        const type = noteType[typeValue] ?? "unknown";
        provisional.push({
          type,
          time,
          timeMs: offsetMs + (time / ticksPerBeat) * beatMs,
          positionX: asFiniteNumber(rawNote.positionX, 0),
          holdTime,
          holdTimeMs: (holdTime / ticksPerBeat) * beatMs,
          lineIndex,
          side,
          sourceIndex,
          bpm,
        });
      });
    }
  });

  provisional.sort((a, b) => a.time - b.time || a.lineIndex - b.lineIndex || (a.side === "above" ? -1 : 1) - (b.side === "above" ? -1 : 1) || a.sourceIndex - b.sourceIndex);
  const events = provisional.map((event, index) => ({ ...event, index: index + 1 }));
  const lastEvent = events.at(-1);
  const durationMs = events.reduce((duration, event) => Math.max(duration, event.timeMs + event.holdTimeMs), 0);
  const bpm = events[0]?.bpm ?? fallbackBpm;
  const hasLineTransforms = rawLines.some((line) => asArray(line.judgeLineMoveEvents).length > 0 || asArray(line.judgeLineRotateEvents).length > 0 || asArray(line.judgeLineDisappearEvents).length > 0);

  return {
    formatVersion: Number.isFinite(Number(chart.formatVersion)) ? Number(chart.formatVersion) : null,
    offsetMs,
    ticksPerBeat,
    bpm,
    events,
    durationMs: Math.max(durationMs, lastEvent?.timeMs ?? 0),
    hasLineTransforms,
  };
}

const RESOURCE_REPO = "https://raw.githubusercontent.com/7aGiven/Phigros_Resource";
const RESOURCE_BRANCH = "chart";
export const RESOURCE_COMMIT = "5d40bfdf05bee53f5107a6ea5620ca0e953de815";

const encodePath = (path: string) => path.split("/").map((part) => encodeURIComponent(part)).join("/");

export function chartSourcePath(chart: Pick<ChartRecord, "songId" | "difficulty">): string {
  return `${chart.songId}.0/${chart.difficulty.toUpperCase()}.json`;
}

export function chartSourceUrl(chart: Pick<ChartRecord, "songId" | "difficulty">): string {
  return `${RESOURCE_REPO}/${RESOURCE_BRANCH}/${encodePath(chartSourcePath(chart))}`;
}

const timelineCache = new Map<string, Promise<ChartTimeline>>();

/** Load and parse only the selected chart; the full repository is never downloaded. */
export function loadChartTimeline(chart: Pick<ChartRecord, "songId" | "difficulty">, options: TimelineOptions = {}): Promise<ChartTimeline> {
  const key = `${chartSourcePath(chart)}|${options.ticksPerBeat ?? 32}|${options.fallbackBpm ?? 120}`;
  const cached = timelineCache.get(key);
  if (cached) return cached;
  const request = fetch(chartSourceUrl(chart), { cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`谱面下载失败（HTTP ${response.status}）`);
      return parseChartTimeline(await response.json(), options);
    })
    .catch((error) => {
      timelineCache.delete(key);
      throw error;
    });
  timelineCache.set(key, request);
  return request;
}

export function clearChartTimelineCache(): void {
  timelineCache.clear();
}
