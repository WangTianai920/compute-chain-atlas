import type { NewsItem, NewsLanguage } from "./market-data";

export type MarketMode = "overview" | "signals" | "news" | "quotes" | "full";
export type SnapshotState = "fresh" | "stale" | "expired";

export type SnapshotPolicy = {
  freshForMs: number;
  serveStaleForMs: number;
  refreshInBackground: boolean;
  browserMaxAgeSeconds: number;
};

export const marketSnapshotPolicies: Record<MarketMode, SnapshotPolicy> = {
  overview: { freshForMs: 15_000, serveStaleForMs: 5 * 60_000, refreshInBackground: true, browserMaxAgeSeconds: 5 },
  signals: { freshForMs: 60_000, serveStaleForMs: 30 * 60_000, refreshInBackground: true, browserMaxAgeSeconds: 10 },
  news: { freshForMs: 5 * 60_000, serveStaleForMs: 6 * 60 * 60_000, refreshInBackground: true, browserMaxAgeSeconds: 60 },
  quotes: { freshForMs: 10_000, serveStaleForMs: 60_000, refreshInBackground: false, browserMaxAgeSeconds: 0 },
  full: { freshForMs: 60_000, serveStaleForMs: 30 * 60_000, refreshInBackground: true, browserMaxAgeSeconds: 10 },
};

export function normalizeMarketMode(value: string | null): MarketMode {
  return value === "overview" || value === "signals" || value === "news" || value === "quotes" ? value : "full";
}

export function marketSnapshotKey(mode: MarketMode, language: NewsLanguage) {
  return `market:${mode}:${language}`;
}

export function classifySnapshot(updatedAt: string, policy: SnapshotPolicy, now = Date.now()): SnapshotState {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return "expired";
  const age = Math.max(0, now - timestamp);
  if (age <= policy.freshForMs) return "fresh";
  if (age <= policy.serveStaleForMs) return "stale";
  return "expired";
}

export function shouldRefreshSignalSnapshot(updatedAt: string | null, now = Date.now()) {
  if (!updatedAt) return true;
  const timestamp = Date.parse(updatedAt);
  return !Number.isFinite(timestamp) || now - timestamp > marketSnapshotPolicies.signals.freshForMs;
}

export function mergeRecentNews(previous: NewsItem[], incoming: NewsItem[], now = Date.now()) {
  const allowedDays = new Set(Array.from({ length: 3 }, (_, index) => shanghaiDayKey(new Date(now - index * 86_400_000))));
  const seen = new Set<string>();
  return [...incoming, ...previous]
    .filter((item) => allowedDays.has(shanghaiDayKey(parseNewsDate(item.time))))
    .filter((item) => {
      const key = item.title.replace(/\s+/g, "").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => parseNewsDate(b.time).getTime() - parseNewsDate(a.time).getTime());
}

function parseNewsDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) return new Date(value.replace(" ", "T") + "+08:00");
  return new Date(value);
}

function shanghaiDayKey(value: Date) {
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
