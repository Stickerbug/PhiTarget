import rawDataset from "./charts.json";
import rawConstraints from "./chartConstraints.json";
import type { ChartConstraintDataset, ChartDataset } from "./types";

export const dataset = rawDataset as ChartDataset;
export const charts = dataset.charts;
export const constraintDataset = rawConstraints as ChartConstraintDataset;
export const chartConstraints = constraintDataset.charts;
