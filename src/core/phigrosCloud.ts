import type { ChartRecord } from "../data/types";

const PHIB19_API = "https://phib19.top:8080";
// PhiHub deployments in the wild currently use both 24- and 25-character
// session tokens. Accept either form; the server remains the authority.
const tokenPattern = /^[0-9A-Za-z]{24,25}$/;
const difficulties = ["ez", "hd", "in", "at"] as const;

export type PhigrosCloudRecord = {
  id: string;
  chartId: string;
  songId: string;
  difficulty: string;
  score: number;
  accuracy: number | null;
  fc: boolean;
  playedAt: string;
  source: "taptap";
};

export type PhigrosCloudProfile = {
  playerId: string;
  playerName: string;
  rks: number | null;
  challengeModeRank: number | null;
  updatedAt: string | null;
  avatar: string | null;
  data: string | null;
  /** Numeric save version used by PhiPlugin for the "later than" badge. */
  gameVersionCode: number | null;
  gameVersion: string | null;
};

export type PhigrosCloudData = {
  records: PhigrosCloudRecord[];
  profile: PhigrosCloudProfile;
  fetchedAt: string;
};

type CloudRecord = { score?: unknown; acc?: unknown; accuracy?: unknown; fc?: unknown };

const asNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asBoolean = (value: unknown) => value === true || value === 1 || value === "1";

const text = (value: unknown) => typeof value === "string" ? value : "";

const formatGameData = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  const units = ["KiB", "MiB", "GiB", "TiB", "PiB"];
  const parts = value.map((item, index) => {
    const amount = Number(item);
    return Number.isFinite(amount) && amount > 0 && units[index] ? `${amount}${units[index]}` : "";
  }).filter(Boolean);
  return parts.length ? parts.reverse().join(" ") : null;
};

function normalizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const root = value as Record<string, unknown>;
  return root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
}

/**
 * Convert the public PhiHub/phi-plugin cloud-save shape into PhiTarget records.
 * The function is pure so the mapping can be tested without a token or network.
 */
export function parsePhigrosCloudSave(value: unknown, charts: ChartRecord[], fetchedAt = new Date().toISOString()): PhigrosCloudData {
  const payload = normalizePayload(value);
  const gameRecord = payload.gameRecord && typeof payload.gameRecord === "object" ? payload.gameRecord as Record<string, unknown> : {};
  const saveInfo = payload.saveInfo && typeof payload.saveInfo === "object" ? payload.saveInfo as Record<string, unknown> : {};
  const summary = saveInfo.summary && typeof saveInfo.summary === "object" ? saveInfo.summary as Record<string, unknown> : {};
  const modifiedAt = saveInfo.modifiedAt && typeof saveInfo.modifiedAt === "object" ? saveInfo.modifiedAt as Record<string, unknown> : {};
  const gameUser = payload.gameuser && typeof payload.gameuser === "object" ? payload.gameuser as Record<string, unknown> : {};
  const gameProgress = payload.gameProgress && typeof payload.gameProgress === "object" ? payload.gameProgress as Record<string, unknown> : {};
  const chartBySongDifficulty = new Map(charts.map((chart) => [`${chart.songId}:${chart.difficulty}`, chart]));
  const recordsByChart = new Map<string, PhigrosCloudRecord>();
  for (const [rawSongId, rawLevels] of Object.entries(gameRecord)) {
    if (!Array.isArray(rawLevels)) continue;
    // PhiHub stores gameRecord keys as `<songId>.<variant>`, while the
    // public chart index uses the stable songId without that suffix.
    const songIds = [rawSongId, rawSongId.replace(/\.\d+$/, "")];
    for (const [index, rawRecord] of rawLevels.entries()) {
      if (index >= difficulties.length || !rawRecord || typeof rawRecord !== "object") continue;
      const record = rawRecord as CloudRecord;
      const chart = songIds.map((songId) => chartBySongDifficulty.get(`${songId}:${difficulties[index]}`)).find((item): item is ChartRecord => Boolean(item));
      const score = asNumber(record.score);
      // A zero score is the default empty slot in a cloud save, not a played record.
      if (!chart || score === null || score <= 0 || score > 1_000_000) continue;
      const mapped: PhigrosCloudRecord = {
        id: `${chart.chartId}:${fetchedAt}`,
        chartId: chart.chartId,
        songId: chart.songId,
        difficulty: difficulties[index],
        score: Math.trunc(score),
        accuracy: asNumber(record.acc ?? record.accuracy),
        fc: asBoolean(record.fc) || score === 1_000_000,
        playedAt: text(modifiedAt.iso) || fetchedAt,
        source: "taptap",
      };
      const existing = recordsByChart.get(chart.chartId);
      if (!existing || mapped.score >= existing.score) recordsByChart.set(chart.chartId, mapped);
    }
  }
  const records = [...recordsByChart.values()];
  records.sort((a, b) => b.score - a.score || a.songId.localeCompare(b.songId));
  const gameVersionCode = asNumber(summary.gameVersion) ?? asNumber(saveInfo.gameVersion) ?? asNumber(payload.gameVersion);
  const gameVersion = text(summary.version)
    || text(summary.clientVersion)
    || text(saveInfo.version)
    || text(payload.version)
    || text(summary.gameVersion)
    || text(saveInfo.gameVersion)
    || text(payload.gameVersion)
    // Current PhiPlugin resources identify the current client as 4.0.1.1;
    // old cloud saves keep only the numeric code (for example 150).
    || (gameVersionCode !== null ? "4.0.1.1" : null);
  return {
    records,
    profile: {
      playerId: text(saveInfo.PlayerId),
      playerName: text(saveInfo.PlayerName) || text(saveInfo.playerName) || text(saveInfo.nickname) || text(summary.name) || text(summary.nickname) || text(gameUser.PlayerId),
      rks: asNumber(summary.rankingScore),
      challengeModeRank: asNumber(summary.challengeModeRank),
      updatedAt: text(summary.updatedAt) || text(modifiedAt.iso) || null,
      avatar: text(summary.avatar) || text(gameUser.avatar) || null,
      data: formatGameData(gameProgress.money),
      gameVersionCode,
      gameVersion,
    },
    fetchedAt,
  };
}

export async function fetchPhigrosCloudSave(token: string, isGlobal: boolean, charts: ChartRecord[], signal?: AbortSignal): Promise<PhigrosCloudData> {
  const normalizedToken = token.trim();
  if (!tokenPattern.test(normalizedToken)) throw new Error("sessionToken 应为 24 或 25 位字母数字字符串");
  const response = await fetch(`${PHIB19_API}/get/cloud/saves`, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: normalizedToken, isGlobal }),
    signal,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`PhiHub API 返回了无法解析的响应（HTTP ${response.status}）`);
  }
  if (!response.ok || (payload && typeof payload === "object" && "error" in payload)) {
    const error = payload && typeof payload === "object" ? text((payload as Record<string, unknown>).error) : "";
    throw new Error(error || `获取 TapTap 云存档失败（HTTP ${response.status}）`);
  }
  const fetchedAt = new Date().toISOString();
  const data = parsePhigrosCloudSave(payload, charts, fetchedAt);
  if (!data.records.length && !data.profile.playerId) throw new Error("云存档已返回，但没有找到可匹配到当前曲库的成绩。请检查服务器区域或曲库版本。");
  return data;
}
