import type { ChartRecord } from "../data/types";
import type { PhigrosCloudRecord } from "./phigrosCloud";

export type B30AnalysisRecord = {
  chart: ChartRecord;
  record: PhigrosCloudRecord;
  slot: string;
  kind: "phi" | "best";
  rks: number;
};

export type B30Histogram = {
  slots: { label: string; rks: number; kind: "phi" | "best"; height: number }[];
  ticks: { label: string; position: number }[];
  average: number;
  averagePosition: number;
  count: number;
  domainMin: number;
  domainMax: number;
};

export type B30TagCategory = {
  name: string;
  rks: number;
  pointX: number;
  pointY: number;
  labelX: number;
  labelY: number;
  anchor: string;
  displayRks?: string;
};

export type B30TagAnalysis = {
  threshold?: number;
  recordCount: number;
  totalVotes: number;
  insufficient: boolean;
  radar: {
    grids: string[];
    axes: { x: number; y: number }[];
    points: string;
    categories: B30TagCategory[];
  };
  strong: { name: string; rks: number }[];
  weak: { name: string; rks: number }[];
};

const API = "https://phib19.top:8080";

export function getB30AnalysisRecords(model: {
  phiEntries: { chart: ChartRecord; record: PhigrosCloudRecord; singleRks: number }[];
  b27Entries: { chart: ChartRecord; record: PhigrosCloudRecord; singleRks: number }[];
}): B30AnalysisRecord[] {
  const phi = model.phiEntries.slice(0, 3).map((entry, index) => ({
    chart: entry.chart,
    record: entry.record,
    rks: entry.singleRks,
    kind: "phi" as const,
    slot: `P${index + 1}`,
  }));
  const best = model.b27Entries.slice(0, 27).map((entry, index) => ({
    chart: entry.chart,
    record: entry.record,
    rks: entry.singleRks,
    kind: "best" as const,
    slot: `B${index + 1}`,
  }));
  return [...phi, ...best].filter((entry) => Number.isFinite(entry.rks));
}

function niceAxisStep(value: number) {
  return [0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1].find((candidate) => candidate >= value) ?? Math.ceil(value);
}

export function buildRksHistogram(records: B30AnalysisRecord[], targetTickCount = 4): B30Histogram {
  const valid = records.filter((record) => Number.isFinite(record.rks));
  if (!valid.length) return { slots: [], ticks: [], average: 0, averagePosition: 0, count: 0, domainMin: 0, domainMax: 1 };
  const values = valid.map((record) => record.rks);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const step = niceAxisStep(Math.max(maximum - minimum, 0.2) / targetTickCount);
  const domainMin = Math.floor((minimum - step * 0.1) / step) * step;
  let domainMax = Math.ceil((maximum + step * 0.1) / step) * step;
  if (domainMax <= domainMin) domainMax = domainMin + step;
  const domainRange = domainMax - domainMin;
  const tickCount = Math.max(1, Math.round(domainRange / step));
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => ({
    label: (domainMin + index * step).toFixed(2),
    position: index / tickCount * 100,
  }));
  const slots = valid.map((record) => ({
    label: record.slot,
    rks: record.rks,
    kind: record.kind,
    height: Math.min(100, Math.max(0, (record.rks - domainMin) / domainRange * 100)),
  }));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    slots,
    ticks,
    average,
    averagePosition: Math.min(100, Math.max(0, (average - domainMin) / domainRange * 100)),
    count: valid.length,
    domainMin,
    domainMax,
  };
}

function buildGameRecordPayload(records: PhigrosCloudRecord[]) {
  const levels: Record<string, number> = { ez: 0, hd: 1, in: 2, at: 3 };
  const payload: Record<string, (object | null)[]> = {};
  records.forEach((record) => {
    const index = levels[record.difficulty];
    if (index === undefined) return;
    // PhiPlugin sends the canonical `<song>.<composer>.0` chart id to the
    // tag service.  The public chart index omits the variant suffix, so add
    // the default Phigros variant here.
    const gameRecordKey = /\.\d+$/.test(record.songId) ? record.songId : `${record.songId}.0`;
    const slots = payload[gameRecordKey] ?? [null, null, null, null];
    slots[index] = { score: record.score, acc: record.accuracy ?? 0, fc: record.fc };
    payload[gameRecordKey] = slots;
  });
  return payload;
}

/** Fetches the same Kyou/phi-plugin tag analysis used by the original B30 image. */
export async function fetchB30TagAnalysis(records: PhigrosCloudRecord[], signal?: AbortSignal): Promise<B30TagAnalysis | null> {
  if (!records.length) return null;
  try {
    const response = await fetch(`${API}/chartsTag/get/b30Analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameRecord: buildGameRecordPayload(records) }),
      signal,
    });
    if (!response.ok) return null;
    const json = await response.json() as { data?: B30TagAnalysis };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export type B30AverageMap = Map<string, number>;

/** Community ACC averages used by PhiPlugin's small comparison pill. */
export async function fetchB30AccAverages(records: PhigrosCloudRecord[], signal?: AbortSignal): Promise<B30AverageMap> {
  if (!records.length) return new Map();
  try {
    const songIds = [...new Set(records.map((record) => /\.\d+$/.test(record.songId) ? record.songId : `${record.songId}.0`))];
    const response = await fetch(`${API}/get/scoreList/allAccAvgB30`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songIds }),
      signal,
    });
    if (!response.ok) return new Map();
    const json = await response.json() as { data?: Record<string, Record<string, { accAvg?: number | null }>> };
    const result: B30AverageMap = new Map();
    Object.entries(json.data ?? {}).forEach(([songId, byDifficulty]) => {
      Object.entries(byDifficulty ?? {}).forEach(([difficulty, value]) => {
        // PhiPlugin's API has returned both `{ accAvg, count }` objects and
        // compact `[accAvg, count]` tuples over time. Accept both forms so the
        // original green/red comparison pill is preserved when the endpoint
        // uses the compact response.
        const compact = Array.isArray(value) ? Number(value[0]) : null;
        const average = compact !== null && Number.isFinite(compact) ? compact : typeof value?.accAvg === "number" ? value.accAvg : null;
        if (average !== null && Number.isFinite(average)) result.set(`${songId}:${difficulty.toLowerCase()}`, average);
      });
    });
    return result;
  } catch {
    return new Map();
  }
}
