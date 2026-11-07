import type { ChartRecord } from "../data/types";
import type { PhigrosCloudRecord } from "./phigrosCloud";

export type RksEntry = {
  chart: ChartRecord;
  record: PhigrosCloudRecord;
  accuracy: number;
  singleRks: number;
  phi: boolean;
};

export type B30Model = {
  entries: RksEntry[];
  phiEntries: RksEntry[];
  b27Entries: RksEntry[];
  selectedEntries: RksEntry[];
  overflowEntries: RksEntry[];
  b30Rks: number | null;
  partialAverage: number | null;
  complete: boolean;
  missingAccuracy: number;
};

/** Normalize common cloud-save formats to a percentage in [0, 100]. */
export function normalizeAccuracy(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const percentage = value >= 0 && value <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, percentage));
}

/**
 * Current community RKS curve: below 70% contributes zero; 70–100% uses
 * constant * ((ACC - 55) / 45)^2 and a perfect score contributes constant.
 */
export function singleRks(constant: number | null, accuracy: number | null): number | null {
  const acc = normalizeAccuracy(accuracy);
  if (constant === null || acc === null || !Number.isFinite(constant)) return null;
  if (acc < 70) return 0;
  if (acc >= 100) return constant;
  return constant * ((acc - 55) / 45) ** 2;
}

export function recordAccuracy(record: PhigrosCloudRecord): number | null {
  // A 1,000,000 result is unambiguously a perfect score even when an older
  // cloud endpoint omitted the ACC field.
  return record.accuracy ?? (record.score >= 1_000_000 ? 100 : null);
}

export function buildB30Model(charts: ChartRecord[], records: PhigrosCloudRecord[]): B30Model {
  const chartById = new Map(charts.map((chart) => [chart.chartId, chart]));
  const entries: RksEntry[] = [];
  let missingAccuracy = 0;
  for (const record of records) {
    const chart = chartById.get(record.chartId);
    const accuracy = recordAccuracy(record);
    if (!chart || chart.constant === null || accuracy === null) {
      if (chart && chart.constant !== null && accuracy === null) missingAccuracy += 1;
      continue;
    }
    const value = singleRks(chart.constant, accuracy);
    if (value === null) continue;
    entries.push({ chart, record, accuracy: normalizeAccuracy(accuracy) ?? accuracy, singleRks: value, phi: record.score >= 1_000_000 || accuracy >= 100 });
  }
  entries.sort((a, b) => b.singleRks - a.singleRks || b.record.score - a.record.score || a.chart.title.localeCompare(b.chart.title));
  const phiEntries = entries.filter((entry) => entry.phi).slice(0, 3);
  const phiIds = new Set(phiEntries.map((entry) => entry.record.chartId));
  const b27Entries = entries.filter((entry) => !phiIds.has(entry.record.chartId)).slice(0, 27);
  const selectedEntries = [...phiEntries, ...b27Entries];
  const selectedSum = selectedEntries.reduce((sum, entry) => sum + entry.singleRks, 0);
  const overflowEntries = entries.filter((entry) => !selectedEntries.includes(entry));
  return {
    entries,
    phiEntries,
    b27Entries,
    selectedEntries,
    overflowEntries,
    b30Rks: selectedEntries.length >= 30 ? selectedSum / 30 : null,
    partialAverage: selectedEntries.length ? selectedSum / selectedEntries.length : null,
    complete: selectedEntries.length >= 30,
    missingAccuracy,
  };
}

