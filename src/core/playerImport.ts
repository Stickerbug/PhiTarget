import type { ChartRecord } from "../data/types";
import type { PlayerScoreRecord } from "../storage/playerStore";

const numberValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const booleanValue = (value: unknown) => /^(1|true|yes|y|fc|phi|full.?combo)$/i.test(String(value ?? "").trim());

const normalizeRow = (row: Record<string, unknown>, charts: ChartRecord[], source: PlayerScoreRecord["source"]): PlayerScoreRecord | null => {
  const rawChartId = String(row.chartId ?? row.chart_id ?? row.id ?? "").trim();
  const rawSongId = String(row.songId ?? row.song_id ?? row.song ?? "").trim();
  const rawDifficulty = String(row.difficulty ?? row.rank ?? "").trim().toLowerCase();
  const chart = charts.find((item) => item.chartId === rawChartId) ?? charts.find((item) => item.songId === rawSongId && item.difficulty === rawDifficulty);
  if (!chart) return null;
  const score = numberValue(row.score ?? row.Score ?? row.points);
  if (score === null || score < 0 || score > 1_000_000) return null;
  return { id: crypto.randomUUID(), chartId: chart.chartId, score: Math.trunc(score), fc: booleanValue(row.fc ?? row.FC ?? row.fullCombo ?? row.phi), playedAt: String(row.playedAt ?? row.played_at ?? row.date ?? new Date().toISOString()), source };
};

export function parsePlayerJson(text: string, charts: ChartRecord[]): PlayerScoreRecord[] {
  const value = JSON.parse(text) as unknown;
  const rows = Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as { records?: unknown }).records) ? (value as { records: unknown[] }).records : [];
  return rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")).map((row) => normalizeRow(row, charts, "json")).filter((row): row is PlayerScoreRecord => Boolean(row));
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

export function parsePlayerCsv(text: string, charts: ChartRecord[]): PlayerScoreRecord[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return normalizeRow(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])), charts, "csv");
  }).filter((row): row is PlayerScoreRecord => Boolean(row));
}
