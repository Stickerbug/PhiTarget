export type NoteCounts = { tap: number | null; hold: number | null; flick: number | null; drag: number | null };

export type ChartRecord = {
  chartId: string;
  songId: string;
  title: string;
  chapter: string;
  difficulty: string;
  level: number | null;
  constant: number | null;
  composer: string;
  illustrator: string;
  charter: string;
  noteCounts: NoteCounts;
  noteCount: number | null;
  sourceVersion: string;
};

export type SongMetadata = { songOrder: number; searchKeywords: string[] };

export type ChartDataset = {
  schemaVersion: string;
  chartVersion: string;
  generatedAt: string;
  source: { name: string; url: string; license: string; note: string }[];
  songMeta: Record<string, SongMetadata>;
  charts: ChartRecord[];
};
