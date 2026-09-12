import type { Platform, SheetDataset, SheetId, SheetProblemMapping } from "./types";
import striverDataset from "../../data/striver.json";

/**
 * Registry of every sheet's static dataset. Adding a new sheet later
 * (NeetCode, Blind75, ...) means dropping a new data/<sheet>.json next to
 * this one and adding one line here — the sync engine never changes.
 */
const DATASETS: Record<SheetId, SheetDataset> = {
  striver: striverDataset as SheetDataset,
};

export const problemMapper = {
  getDataset(sheet: SheetId): SheetDataset {
    return DATASETS[sheet];
  },

  /** Identity is always by platform + stable slug, never by title/topic. */
  findBySlug(
    sheet: SheetId,
    platform: Platform,
    platformSlug: string
  ): SheetProblemMapping | undefined {
    const dataset = DATASETS[sheet];
    return dataset.problems.find(
      (p) => p.platform === platform && p.platformSlug === platformSlug
    );
  },

  findBySheetProblemId(
    sheet: SheetId,
    sheetProblemId: string
  ): SheetProblemMapping | undefined {
    const dataset = DATASETS[sheet];
    return dataset.problems.find((p) => p.sheetProblemId === sheetProblemId);
  },
};
