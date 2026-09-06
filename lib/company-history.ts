import { isHistoryPoint, type HistoryPoint } from "./market-history.ts";

export type HistoryResult = { history: HistoryPoint[]; historyStatus: "current" | "stale" | "unavailable"; historyUpdatedAt: string | null; historyAsOf: string | null };
type HistorySnapshot = { code: string; adjustment: "qfq"; history: HistoryPoint[]; fetchedAt: string };
type Dependencies = {
  read: (key: string) => Promise<{ payload: unknown } | null>;
  write: (key: string, value: HistorySnapshot) => Promise<unknown>;
  fetch: (code: string, limit: number) => Promise<HistoryPoint[]>;
  now?: number;
};
const FRESH_MS = 5 * 60_000, FALLBACK_MS = 7 * 86_400_000, MIN_CHART_POINTS = 2;

export async function loadCompanyHistory(code: string, limit: number, deps: Dependencies): Promise<HistoryResult> {
  const empty: HistoryResult = { history: [], historyStatus: "unavailable", historyUpdatedAt: null, historyAsOf: null };
  if (!/^\d{6}$/.test(code) || !Number.isInteger(limit) || limit < 1 || limit > 320) return empty;
  const now = deps.now ?? Date.now(), size = Math.max(limit, 40), key = `company-history:qfq:v1:${code}:${size}`;
  let saved: HistorySnapshot | null = null;
  try {
    const candidate = (await deps.read(key))?.payload as HistorySnapshot | undefined;
    if (candidate?.code === code && candidate.adjustment === "qfq" && Array.isArray(candidate.history) && candidate.history.length >= MIN_CHART_POINTS
      && candidate.history.every((point, index, all) => isHistoryPoint(point) && (!index || all[index - 1].date < point.date))) saved = candidate;
  } catch { /* A cache read failure must not prevent a live request. */ }
  const age = saved ? now - Date.parse(saved.fetchedAt) : Infinity;
  const usable = saved && age >= 0 && age <= FALLBACK_MS ? saved : null;
  const result = (snapshot: HistorySnapshot, status: "current" | "stale"): HistoryResult => ({ history: snapshot.history.slice(-limit), historyStatus: status, historyUpdatedAt: snapshot.fetchedAt, historyAsOf: snapshot.history.at(-1)?.date ?? null });
  if (usable && age < FRESH_MS) return result(usable, "current");
  try {
    const history = await deps.fetch(code, size);
    if (history.length >= MIN_CHART_POINTS && history.every((point, index, all) => isHistoryPoint(point) && (!index || all[index - 1].date < point.date))
      && (!usable || history.length >= usable.history.length && history.at(-1)!.date >= usable.history.at(-1)!.date)) {
      const fresh: HistorySnapshot = { code, adjustment: "qfq", history, fetchedAt: new Date(now).toISOString() };
      try { await deps.write(key, fresh); } catch { /* Serve successful source data even when persistence is temporarily unavailable. */ }
      return result(fresh, "current");
    }
  } catch { /* Keep the last successful snapshot and its original timestamp. */ }
  return usable ? result(usable, "stale") : empty;
}
