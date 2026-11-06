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
  bpm: string | null;
  duration: string | null;
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

export type ConstraintGroup = {
  time: number;
  positionX: number;
  tapHold: number;
  dragFlick: number;
};

export type ChartConstraintProfile = {
  chartId: string;
  songId: string;
  difficulty: string;
  sourcePath: string;
  sourceFormatVersion: number | null;
  noteCount: number;
  noteCounts: NoteCounts & { unknown: number };
  declaredNoteCount: number | null;
  declaredNoteCounts: NoteCounts;
  matchesDeclaredNoteCounts: boolean;
  holdCount: number;
  maxHoldTime: number;
  simultaneousGroupCount: number;
  crossTypeConflictGroupCount: number;
  crossTypeConflictPairCount: number;
  crossTypeGroups: ConstraintGroup[];
  model: string;
  error?: string;
};

export type ChartConstraintDataset = {
  schemaVersion: string;
  generatedAt: string;
  source: { repository: string; branch: string; commit: string; url: string };
  complete: boolean;
  charts: Record<string, ChartConstraintProfile>;
};
