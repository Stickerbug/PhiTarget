import { mkdir, writeFile } from "node:fs/promises";

const phi = "https://raw.githubusercontent.com/Catrong/phi-plugin/main/resources/info";
const kyouBase = "https://rranker-phigros-data.cn-nb1.rains3.com/";
const getJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
};
const getText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
};
const parseTsv = (text) => {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(header.split("\t").map((key, i) => [key, values[i] ?? ""]));
  });
};
const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const normalizeSearch = (value) => value.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, "");
const response = await fetch(`${phi}/info.csv`);
if (!response.ok) throw new Error(`Unable to fetch info.csv: ${response.status}`);
const infoRows = parseTsv(await response.text());
const notesInfo = await getJson(`${phi}/notesInfo.json`);
const latest = await getJson(`${kyouBase}kyou/latest.json`);
const manifest = await getJson(`${kyouBase}${latest.manifestPath}`);
const songsFile = manifest.files.find((file) => file.name === "songs.json");
const kyouSongs = await getJson(`${kyouBase}${songsFile.path}`);
const packByName = new Map(kyouSongs.map((song) => [song.name, song.pack]));
const normalizedKyouSongs = kyouSongs.map((song) => ({ ...song, normalizedName: normalizeSearch(song.name) }));
const findKyouSong = (title) => {
  const normalizedTitle = normalizeSearch(title);
  const exact = normalizedKyouSongs.find((song) => song.normalizedName === normalizedTitle);
  if (exact) return exact;
  return normalizedKyouSongs.filter((song) => song.normalizedName.includes(normalizedTitle) || normalizedTitle.includes(song.normalizedName)).sort((a, b) => Math.abs(a.normalizedName.length - normalizedTitle.length) - Math.abs(b.normalizedName.length - normalizedTitle.length))[0];
};
const aliasesFile = manifest.files.find((file) => file.name === "aliases.json");
const aliases = aliasesFile ? await getJson(`${kyouBase}${aliasesFile.path}`) : [];
const aliasesByKyouId = new Map();
for (const item of aliases) {
  const list = aliasesByKyouId.get(item.song_id) ?? [];
  if (item.alias) list.push(item.alias);
  aliasesByKyouId.set(item.song_id, list);
}
const resourceInfoRows = (await getText("https://raw.githubusercontent.com/7aGiven/Phigros_Resource/info/info.tsv"))
  .split(/\r?\n/).filter(Boolean).map((line, index) => ({ id: line.split("\t", 1)[0], order: index }));
const songOrderById = new Map(resourceInfoRows.map((row) => [row.id, row.order]));
const difficulties = ["EZ", "HD", "IN", "AT"];
const charts = [];
const songMeta = {};
for (const [rowIndex, row] of infoRows.entries()) {
  const kyouSong = findKyouSong(row.song);
  const kyouId = kyouSong?.song_id;
  const aliasesForSong = kyouId ? aliasesByKyouId.get(kyouId) ?? [] : [];
  const searchKeywords = [...new Set([row.song, row.composer, row.illustrator, row.id, ...aliasesForSong, ...difficulties.flatMap((difficulty) => [row[difficulty], row[`${difficulty}C`]]).filter(Boolean)])].filter(Boolean);
  songMeta[row.id] = { songOrder: songOrderById.get(row.id) ?? rowIndex, searchKeywords };
  const notesByDifficulty = notesInfo[row.id] ?? {};
  for (const difficulty of difficulties) {
    const constant = numberOrNull(row[difficulty]);
    if (constant === null) continue;
    const counts = notesByDifficulty[difficulty]?.t ?? null;
    const noteCounts = counts ? { tap: counts[0] ?? null, hold: counts[1] ?? null, flick: counts[2] ?? null, drag: counts[3] ?? null } : { tap: null, hold: null, flick: null, drag: null };
    const noteCount = counts ? counts.reduce((sum, count) => sum + count, 0) : null;
    charts.push({
      chartId: `${row.id}::${difficulty.toLowerCase()}`,
      songId: row.id,
      title: row.song,
      chapter: kyouSong?.pack ?? packByName.get(row.song) ?? "未归类",
      difficulty: difficulty.toLowerCase(),
      level: constant,
      constant,
      composer: row.composer,
      illustrator: row.illustrator,
      charter: row[`${difficulty}C`] ?? "",
      noteCounts,
      noteCount,
      sourceVersion: latest.resourceVersion,
    });
  }
}
charts.sort((a, b) => songMeta[a.songId].songOrder - songMeta[b.songId].songOrder || a.difficulty.localeCompare(b.difficulty));
const dataset = {
  schemaVersion: "0.5",
  chartVersion: latest.resourceVersion,
  generatedAt: new Date().toISOString(),
  source: [
    { name: "phi-plugin info.csv + notesInfo.json", url: "https://github.com/Catrong/phi-plugin", license: "GPL-3.0", note: "公开社区维护的曲目/谱面元数据；未复制曲绘或代码。" },
    { name: "Kyou song packs", url: "https://kyou.net.cn", license: "source terms pending review", note: "仅用于章节/曲包映射，发布前应继续核对数据条款。" },
    { name: "Kyou community aliases + Phigros_Resource order", url: "https://kyou.net.cn; https://github.com/7aGiven/Phigros_Resource", license: "source terms pending review", note: "搜索别名来自 Kyou 社区别名表；默认歌曲顺序来自 Phigros_Resource info.tsv 的资源排列。" },
    { name: "Phigros_Resource illustrations", url: "https://github.com/7aGiven/Phigros_Resource", license: "GPL-3.0 repository; game artwork rights require separate review", note: "仅引用 illustration / illustrationLowRes / illustrationBlur 分支的远程图片，不复制完整仓库。" },
  ],
  songMeta,
  charts,
};
await mkdir("src/data", { recursive: true });
await writeFile("src/data/charts.json", `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`Imported ${charts.length} charts from ${infoRows.length} songs.`);
