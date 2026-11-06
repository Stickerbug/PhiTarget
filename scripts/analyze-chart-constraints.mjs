import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const RESOURCE_REPO = "https://raw.githubusercontent.com/7aGiven/Phigros_Resource";
const RESOURCE_BRANCH = "chart";
const RESOURCE_COMMIT = "5d40bfdf05bee53f5107a6ea5620ca0e953de815";
const DEFAULT_CACHE_DIR = ".cache/phigros-chart-json";
const DEFAULT_OUTPUT = "src/data/chartConstraints.json";
// Phigros chart JSON uses the numeric order documented by phi-plugin:
// 1 Tap, 2 Drag, 3 Hold, 4 Flick.
const typeNames = { 1: "tap", 2: "drag", 3: "hold", 4: "flick" };
const execFileAsync = promisify(execFile);

const argValue = (name) => {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
};
const hasArg = (name) => process.argv.includes(`--${name}`);
const limit = argValue("limit") ? Number(argValue("limit")) : null;
const requestedChart = argValue("chart");
const concurrency = Math.max(1, Math.min(16, Number(argValue("concurrency") ?? 6)));
const cacheDir = argValue("cache") ?? DEFAULT_CACHE_DIR;
const outputPath = argValue("output") ?? DEFAULT_OUTPUT;

if (!hasArg("all") && !limit && !requestedChart) {
  throw new Error("为避免误下载约 2.6 GiB 的原始谱面，请使用 --limit=N、--chart=chartId 或明确传入 --all。");
}
if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) throw new Error("--limit 必须是正整数");

const rawDataset = JSON.parse(await readFile("src/data/charts.json", "utf8"));
const sourceCharts = rawDataset.charts.filter((chart) => !requestedChart || chart.chartId === requestedChart);
if (!sourceCharts.length) throw new Error(`找不到谱面：${requestedChart}`);
const charts = limit ? sourceCharts.slice(0, limit) : sourceCharts;

const pathForChart = (chart) => `${chart.songId}.0/${chart.difficulty.toUpperCase()}.json`;
const encodedPath = (path) => path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
const rawUrl = (path) => `${RESOURCE_REPO}/${RESOURCE_BRANCH}/${encodedPath(path)}`;
const cachePath = (path) => join(cacheDir, path);

async function readChartJson(path) {
  const localPath = cachePath(path);
  try {
    return JSON.parse(await readFile(localPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { stdout } = await execFileAsync("curl", ["--fail", "--silent", "--show-error", "--location", "--compressed", "--retry", "3", "--retry-delay", "1", rawUrl(path)], { maxBuffer: 64 * 1024 * 1024 });
      const text = stdout;
      await mkdir(dirname(localPath), { recursive: true });
      await writeFile(localPath, text);
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

const roundPosition = (value) => Math.round(value * 1000) / 1000;

function summarizeChart(chart, chartJson, sourcePath) {
  const groups = new Map();
  const noteCounts = { tap: 0, hold: 0, drag: 0, flick: 0, unknown: 0 };
  let noteCount = 0;
  let holdCount = 0;
  let maxHoldTime = 0;
  for (const line of chartJson.judgeLineList ?? []) {
    for (const notes of [line.notesAbove ?? [], line.notesBelow ?? []]) {
      for (const note of notes) {
        const type = typeNames[note.type] ?? "unknown";
        noteCounts[type] += 1;
        noteCount += 1;
        const time = Number(note.time);
        const positionX = Number(note.positionX);
        if (type === "hold") {
          holdCount += 1;
          maxHoldTime = Math.max(maxHoldTime, Number(note.holdTime) || 0);
        }
        if (!Number.isFinite(time) || !Number.isFinite(positionX)) continue;
        const key = `${time}|${roundPosition(positionX)}`;
        const group = groups.get(key) ?? { time, positionX: roundPosition(positionX), notes: [] };
        group.notes.push(type);
        groups.set(key, group);
      }
    }
  }
  const simultaneousGroups = [];
  const crossTypeGroups = [];
  for (const group of groups.values()) {
    if (group.notes.length < 2) continue;
    const counts = { tapHold: group.notes.filter((type) => type === "tap" || type === "hold").length, dragFlick: group.notes.filter((type) => type === "drag" || type === "flick").length };
    simultaneousGroups.push({ time: group.time, positionX: group.positionX, count: group.notes.length });
    if (counts.tapHold && counts.dragFlick) crossTypeGroups.push({ time: group.time, positionX: group.positionX, ...counts });
  }
  return {
    chartId: chart.chartId,
    songId: chart.songId,
    difficulty: chart.difficulty,
    sourcePath,
    sourceFormatVersion: chartJson.formatVersion ?? null,
    noteCount,
    noteCounts,
    declaredNoteCount: chart.noteCount,
    declaredNoteCounts: chart.noteCounts,
    matchesDeclaredNoteCounts: chart.noteCount === noteCount && Object.entries(chart.noteCounts).every(([type, count]) => count === null || count === noteCounts[type]),
    holdCount,
    maxHoldTime,
    simultaneousGroupCount: simultaneousGroups.length,
    crossTypeConflictGroupCount: crossTypeGroups.length,
    crossTypeConflictPairCount: crossTypeGroups.reduce((sum, group) => sum + group.tapHold * group.dragFlick, 0),
    crossTypeGroups,
    model: "same-time + same-positionX; structural theory only; no judgement-window or path simulation",
  };
}

const results = {};
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= charts.length) return;
    const chart = charts[index];
    const sourcePath = pathForChart(chart);
    try {
      const chartJson = await readChartJson(sourcePath);
      results[chart.chartId] = summarizeChart(chart, chartJson, sourcePath);
      console.log(`[${index + 1}/${charts.length}] ${chart.chartId} conflicts=${results[chart.chartId].crossTypeConflictGroupCount}`);
    } catch (error) {
      results[chart.chartId] = { chartId: chart.chartId, songId: chart.songId, difficulty: chart.difficulty, sourcePath, error: String(error?.message ?? error) };
      console.error(`[${index + 1}/${charts.length}] failed ${chart.chartId}: ${results[chart.chartId].error}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, charts.length) }, () => worker()));

const output = {
  schemaVersion: "0.1",
  generatedAt: new Date().toISOString(),
  source: {
    repository: "7aGiven/Phigros_Resource",
    branch: RESOURCE_BRANCH,
    commit: RESOURCE_COMMIT,
    url: "https://github.com/7aGiven/Phigros_Resource/tree/chart",
  },
  complete: charts.length === sourceCharts.length && Object.values(results).every((result) => !result.error),
  charts: results,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${Object.keys(results).length} chart constraint profiles to ${outputPath}.`);
