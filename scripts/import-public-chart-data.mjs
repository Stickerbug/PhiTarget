import { mkdir, writeFile } from "node:fs/promises";

const phi = "https://raw.githubusercontent.com/Catrong/phi-plugin/main/resources/info";
const kyouBase = "https://rranker-phigros-data.cn-nb1.rains3.com/";
const getJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
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
const response = await fetch(`${phi}/info.csv`);
if (!response.ok) throw new Error(`Unable to fetch info.csv: ${response.status}`);
const infoRows = parseTsv(await response.text());
const notesInfo = await getJson(`${phi}/notesInfo.json`);
const latest = await getJson(`${kyouBase}kyou/latest.json`);
const manifest = await getJson(`${kyouBase}${latest.manifestPath}`);
const songsFile = manifest.files.find((file) => file.name === "songs.json");
const kyouSongs = await getJson(`${kyouBase}${songsFile.path}`);
const packByName = new Map(kyouSongs.map((song) => [song.name, song.pack]));
const difficulties = ["EZ", "HD", "IN", "AT"];
const charts = [];
for (const row of infoRows) {
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
      chapter: packByName.get(row.song) ?? "未归类",
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
charts.sort((a, b) => a.title.localeCompare(b.title) || a.difficulty.localeCompare(b.difficulty));
const dataset = {
  schemaVersion: "0.2",
  chartVersion: latest.resourceVersion,
  generatedAt: new Date().toISOString(),
  source: [
    { name: "phi-plugin info.csv + notesInfo.json", url: "https://github.com/Catrong/phi-plugin", license: "GPL-3.0", note: "公开社区维护的曲目/谱面元数据；未复制曲绘或代码。" },
    { name: "Kyou song packs", url: "https://kyou.net.cn", license: "source terms pending review", note: "仅用于章节/曲包映射，发布前应继续核对数据条款。" },
  ],
  charts,
};
await mkdir("src/data", { recursive: true });
await writeFile("src/data/charts.json", `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`Imported ${charts.length} charts from ${infoRows.length} songs.`);
