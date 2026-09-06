import { claimRuntimeRefresh, listCompanyEntries, readRuntimeSnapshot, releaseRuntimeRefresh, writeRuntimeSnapshot, type RuntimeSnapshot } from "../../../lib/data";
import { buildHistoricalVolatilityProfile, describeIndividualAnomaly, detectMarketAnomalies, findHistoryCandidateCodes, type HistoricalVolatilityProfile, type IndividualAnomalyAssessment, type SectorAnomaly } from "../../../lib/anomaly";
import { fetchHistory, fetchMarketNews, fetchQuotes, selectMarketNews, type MarketQuote, type NewsItem, type NewsLanguage } from "../../../lib/market-data";
import { classifySnapshot, marketSnapshotKey, marketSnapshotPolicies, mergeRecentNews, normalizeMarketMode, shouldRefreshSignalSnapshot, type MarketMode, type SnapshotState } from "../../../lib/market-snapshot";
import { hasEnglishCompany } from "../../../lib/i18n";

type MarketCompany = Awaited<ReturnType<typeof listCompanyEntries>>[number] & { quote: MarketQuote | null; marketActive: boolean };
type MarketSector = { id: number; slug: string; name: string; shortName: string; description: string; count: number; coreCount: number; changePct: number | null };
type MarketPayload = {
  companies: MarketCompany[];
  sectors: MarketSector[];
  news: NewsItem[];
  anomalies: Array<MarketCompany & { anomaly: IndividualAnomalyAssessment; interpretation: { facts: string; evidence: string; verified: boolean } | null; relatedNews: NewsItem | null }>;
  sectorAnomalies: SectorAnomaly[];
  anomalyProfiles: Record<string, HistoricalVolatilityProfile>;
  anomalyCandidateCount: number;
  counts: { companies: number; mappings: number };
  quotes?: MarketQuote[];
  signalCount?: number;
  signalUpdatedAt?: string | null;
  source: "live" | "unavailable";
  updatedAt: string;
};

export async function GET(request: Request) {
  const startedAt = performance.now();
  const searchParams = new URL(request.url).searchParams;
  const language = searchParams.get("lang") === "en" ? "en" : "zh" satisfies NewsLanguage;
  const mode = normalizeMarketMode(searchParams.get("mode"));
  const forceRefresh = searchParams.get("__refresh") === "1";
  const policy = marketSnapshotPolicies[mode];
  const cacheKey = marketSnapshotKey(mode, language);
  let snapshot: RuntimeSnapshot<MarketPayload> | null = null;
  let refreshClaimed = false;

  try {
    snapshot = await readRuntimeSnapshot<MarketPayload>(cacheKey);
    if (!forceRefresh && snapshot) {
      const state = classifySnapshot(snapshot.updatedAt, policy);
      if (state === "fresh" || (state === "stale" && policy.refreshInBackground)) {
        const responseSnapshot = mode === "overview"
          ? { ...snapshot, payload: await attachCurrentSignalSummary(snapshot.payload, language) }
          : snapshot;
        return snapshotResponse(responseSnapshot, mode, state, startedAt);
      }
    }
    if (forceRefresh) {
      refreshClaimed = await claimRuntimeRefresh(cacheKey);
      if (!refreshClaimed) {
        return Response.json(
          { ok: true, skipped: "refresh-already-running" },
          { headers: { "cache-control": "no-store", "server-timing": totalTiming(startedAt), "x-market-snapshot": "refresh-skipped" } },
        );
      }
    }

    const previousPayload = snapshot?.payload ?? await readAlternateNewsSnapshot(mode, language);
    const payload = await buildMarketPayload(mode, language, previousPayload);
    if (!isUsablePayload(mode, payload) && snapshot) {
      return snapshotResponse(snapshot, mode, "stale", startedAt, "fallback");
    }

    const storedAt = isUsablePayload(mode, payload) ? await writeRuntimeSnapshot(cacheKey, payload) : new Date().toISOString();
    return payloadResponse(payload, mode, "refreshed", storedAt, startedAt);
  } catch (error) {
    if (snapshot) return snapshotResponse(snapshot, mode, "stale", startedAt, "fallback");
    console.error(JSON.stringify({ event: "market_api_failed", mode, language, error: error instanceof Error ? error.message : String(error) }));
    return Response.json(
      { error: error instanceof Error ? error.message : "数据加载失败" },
      { status: 500, headers: { "cache-control": "no-store", "server-timing": totalTiming(startedAt) } },
    );
  } finally {
    if (refreshClaimed) await releaseRuntimeRefresh(cacheKey);
  }
}

async function buildMarketPayload(mode: MarketMode, language: NewsLanguage, previousPayload: MarketPayload | null): Promise<MarketPayload> {
  if (mode === "quotes") return buildQuotePayload(language);
  if (mode === "news") return buildNewsPayload(language, previousPayload);
  if (mode === "overview") return buildOverviewPayload(language);
  return buildSignalsPayload(language, previousPayload);
}

async function buildOverviewPayload(language: NewsLanguage): Promise<MarketPayload> {
  const signalSnapshotPromise = readRuntimeSnapshot<MarketPayload>(marketSnapshotKey("signals", language));
  const [base, signalSnapshot] = await Promise.all([buildBaseMarket(language), signalSnapshotPromise]);
  const signalCount = signalSnapshot
    ? signalSnapshot.payload.anomalies.length + signalSnapshot.payload.sectorAnomalies.length
    : undefined;
  return {
    ...base,
    news: [],
    anomalies: [],
    sectorAnomalies: [],
    anomalyProfiles: {},
    anomalyCandidateCount: 0,
    signalCount,
    signalUpdatedAt: signalSnapshot?.updatedAt ?? null,
  };
}

async function buildSignalsPayload(language: NewsLanguage, previousPayload: MarketPayload | null): Promise<MarketPayload> {
  const rawNewsPromise = fetchMarketNews({ bootstrap: !previousPayload?.news.length });
  const base = await buildBaseMarket(language);
  const historyCandidateCodes = findHistoryCandidateCodes(base.companies);
  const [rawNews, historicalProfiles] = await Promise.all([
    rawNewsPromise,
    fetchHistoricalProfiles(historyCandidateCodes, base.updatedAt),
  ]);
  const names = [...new Set(base.companies.map((entry) => entry.name))];
  const incomingNews = selectMarketNews(rawNews, { companyNames: names, language, limit: 800 });
  const news = mergeRecentNews(previousPayload?.news ?? [], incomingNews);
  const anomalyResult = detectMarketAnomalies(base.companies, historicalProfiles);
  const anomalies = anomalyResult.individuals.map(({ company, assessment }) => {
    const related = news.find((item) => `${item.title}${item.summary}`.includes(company.name) || `${item.title}${item.summary}`.includes(company.code));
    return {
      ...company,
      anomaly: assessment,
      interpretation: company.quote ? {
        facts: describeIndividualAnomaly(assessment, company.quote),
        evidence: related ? `相关事件：${related.title}` : "",
        verified: Boolean(related),
      } : null,
      relatedNews: related ?? null,
    };
  });
  return {
    ...base,
    news,
    anomalies,
    sectorAnomalies: anomalyResult.sectors,
    anomalyProfiles: historicalProfiles,
    anomalyCandidateCount: anomalyResult.candidateCount,
    signalCount: anomalies.length + anomalyResult.sectors.length,
    signalUpdatedAt: new Date().toISOString(),
  };
}

async function buildNewsPayload(language: NewsLanguage, previousPayload: MarketPayload | null): Promise<MarketPayload> {
  const allEntries = await listCompanyEntries(false);
  const entries = language === "en" ? allEntries.filter(hasEnglishCompany) : allEntries;
  const names = [...new Set(allEntries.map((entry) => entry.name))];
  const rawNews = await fetchMarketNews({ bootstrap: !previousPayload?.news.length });
  const incomingNews = selectMarketNews(rawNews, { companyNames: names, language, limit: 800 });
  const news = mergeRecentNews(previousPayload?.news ?? [], incomingNews);
  return {
    companies: [],
    sectors: [],
    news,
    anomalies: [],
    sectorAnomalies: [],
    anomalyProfiles: {},
    anomalyCandidateCount: 0,
    counts: { companies: new Set(entries.map((entry) => entry.code)).size, mappings: entries.length },
    source: news.length ? "live" : "unavailable",
    updatedAt: new Date().toISOString(),
  };
}

async function buildQuotePayload(language: NewsLanguage): Promise<MarketPayload> {
  const allEntries = await listCompanyEntries(false);
  const entries = language === "en" ? allEntries.filter(hasEnglishCompany) : allEntries;
  const codes = [...new Set(entries.map((entry) => entry.code))];
  const quotes = await fetchQuotes(codes);
  const updatedAt = quotes[0]?.updatedAt ?? new Date().toISOString();
  return {
    companies: [],
    sectors: [],
    news: [],
    anomalies: [],
    sectorAnomalies: [],
    anomalyProfiles: {},
    anomalyCandidateCount: 0,
    counts: { companies: codes.length, mappings: entries.length },
    quotes,
    source: quotes.length ? "live" : "unavailable",
    updatedAt,
  };
}

async function buildBaseMarket(language: NewsLanguage) {
  const allEntries = await listCompanyEntries(false);
  const entries = language === "en" ? allEntries.filter(hasEnglishCompany) : allEntries;
  const codes = [...new Set(entries.map((entry) => entry.code))];
  const quotes = await fetchQuotes(codes);
  const updatedAt = quotes[0]?.updatedAt ?? new Date().toISOString();
  const quoteMap = new Map(quotes.map((quote) => [quote.code, quote]));
  const baseCompanies = entries.map((entry) => ({ ...entry, quote: quoteMap.get(entry.code) ?? null }));
  const activeIds = new Set<number>();
  for (const sectorId of new Set(entries.map((entry) => entry.sectorId))) {
    const candidates = baseCompanies.filter((company) => company.sectorId === sectorId && company.role === "candidate" && company.quote);
    candidates.sort((a, b) => activityScore(b.quote) - activityScore(a.quote));
    if (candidates[0]) activeIds.add(candidates[0].mappingId);
  }
  const companies: MarketCompany[] = baseCompanies.map((company) => ({ ...company, marketActive: activeIds.has(company.mappingId) }));
  const sectors: MarketSector[] = [...new Map(entries.map((entry) => [entry.sectorId, { id: entry.sectorId, slug: entry.sectorSlug, name: entry.sectorName, shortName: entry.sectorShortName, description: entry.sectorDescription }])).values()]
    .map((sector) => {
      const rows = companies.filter((company) => company.sectorId === sector.id);
      const changes = rows.map((row) => row.quote?.changePct).filter((value): value is number => typeof value === "number");
      return { ...sector, count: rows.length, coreCount: rows.filter((row) => row.role === "core").length, changePct: changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null };
    });
  return {
    companies,
    sectors,
    counts: { companies: codes.length, mappings: entries.length },
    source: quotes.length ? "live" as const : "unavailable" as const,
    updatedAt,
  };
}

function snapshotResponse(snapshot: RuntimeSnapshot<MarketPayload>, mode: MarketMode, state: SnapshotState, startedAt: number, label: "fresh" | "fallback" = "fresh") {
  return payloadResponse(snapshot.payload, mode, label === "fallback" ? "fallback" : state, snapshot.updatedAt, startedAt, state === "stale");
}

function payloadResponse(payload: MarketPayload, mode: MarketMode, state: "fresh" | "stale" | "refreshed" | "fallback", storedAt: string, startedAt: number, refresh = false) {
  const policy = marketSnapshotPolicies[mode];
  const headers = new Headers({
    "cache-control": mode === "quotes" ? "no-store" : `public, max-age=${policy.browserMaxAgeSeconds}, must-revalidate`,
    "server-timing": totalTiming(startedAt),
    "x-market-snapshot": state,
    "x-market-snapshot-updated-at": storedAt,
  });
  if (refresh && policy.refreshInBackground) headers.set("x-market-refresh", mode);
  if (mode === "overview" && shouldRefreshSignalSnapshot(payload.signalUpdatedAt ?? null)) headers.set("x-market-refresh-signals", "1");
  return Response.json(payload, { headers });
}

function isUsablePayload(mode: MarketMode, payload: MarketPayload) {
  if (mode === "news") return payload.news.length > 0;
  if (mode === "quotes") return (payload.quotes?.length ?? 0) > 0;
  return payload.source === "live" && payload.companies.length > 0;
}

async function readAlternateNewsSnapshot(mode: MarketMode, language: NewsLanguage) {
  const alternateMode = mode === "news" ? "signals" : mode === "signals" || mode === "full" ? "news" : null;
  if (!alternateMode) return null;
  return (await readRuntimeSnapshot<MarketPayload>(marketSnapshotKey(alternateMode, language)))?.payload ?? null;
}

async function attachCurrentSignalSummary(payload: MarketPayload, language: NewsLanguage) {
  const signalSnapshot = await readRuntimeSnapshot<MarketPayload>(marketSnapshotKey("signals", language));
  if (!signalSnapshot) return { ...payload, signalCount: undefined, signalUpdatedAt: null };
  return {
    ...payload,
    signalCount: signalSnapshot.payload.anomalies.length + signalSnapshot.payload.sectorAnomalies.length,
    signalUpdatedAt: signalSnapshot.updatedAt,
  };
}

async function fetchHistoricalProfiles(codes: string[], updatedAt: string) {
  const dayKey = shanghaiDayKey(updatedAt);
  const rows = await Promise.all(codes.map(async (code) => [code, await fetchHistory(code, 30)] as const));
  return Object.fromEntries(rows.flatMap(([code, history]) => {
    const profile = buildHistoricalVolatilityProfile(history.filter((point) => point.date !== dayKey).map((point) => point.changePct));
    return profile ? [[code, profile] as [string, HistoricalVolatilityProfile]] : [];
  }));
}

function shanghaiDayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function activityScore(quote: { changePct: number | null; volumeRatio: number | null; turnover: number | null } | null) {
  if (!quote) return -1;
  return Math.abs(quote.changePct ?? 0) * 2 + (quote.volumeRatio ?? 0) + (quote.turnover ?? 0) * 0.1;
}

function totalTiming(startedAt: number) {
  return `total;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`;
}
