import rawDataset from "./charts.json";
import type { ChartDataset } from "./types";

export const dataset = rawDataset as ChartDataset;
export const charts = dataset.charts;
