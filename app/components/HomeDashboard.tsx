"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { describeIndividualAnomaly, detectMarketAnomalies, type HistoricalVolatilityProfile, type IndividualAnomalyAssessment, type SectorAnomaly } from "../../lib/anomaly";
import { getAshareMarketState } from "../../lib/market-hours";
import { mergeCompanyMappings, summarizeSectorMappings } from "../../lib/company-display";
import { hasEnglishCompany, isChineseContent, localizeApiError, localizeChineseFact, localizeCompany, localizeMarketLabel, localizeSector, localizeSource, matchesContentLanguage, sectorEnglish, ui } from "../../lib/i18n";
import BrandMark from "./BrandMark";
import { LanguageToggle, useLanguage } from "./LanguageProvider";

type Quote = { code: string; price: number | null; changePct: number | null; amount: number | null; marketCap: number | null; turnover: number | null; volumeRatio: number | null; high: number | null; low: number | null; prevClose: number | null; updatedAt: string };
type Company = { researchAliases?: string[]; mappingId: number; code: string; name: string; thesis: string; nameEn?: string; thesisEn?: string; enStatus?: string; sectorId: number; sectorSlug: string; sectorName: string; sectorShortName: string; role: "core" | "candidate"; rationale: string; quote: Quote | null };
type Sector = { id: number; slug: string; name: string; shortName: string; description: string; count: number; coreCount: number; changePct: number | null };
type News = { id: string; title: string; summary: string; time: string; source: string; url: string };
type Anomaly = Company & { anomaly: IndividualAnomalyAssessment; interpretation: { facts: string; evidence: string; verified: boolean } | null; relatedNews: News | null };
type MarketData = { companies: Company[]; sectors: Sector[]; news: News[]; anomalies: Anomaly[]; sectorAnomalies?: SectorAnomaly[]; anomalyProfiles?: Record<string, HistoricalVolatilityProfile>; anomalyCandidateCount?: number; counts?: { companies: number; mappings: number }; signalCount?: number; source: "live" | "unavailable"; updatedAt: string };
type QuoteRefresh = { quotes: Quote[]; source: "live" | "unavailable"; updatedAt: string; error?: string };
type SortKey = "price" | "changePct" | "amount" | "marketCap";
type SortDirection = "ascending" | "descending";
export type MarketView = "overview" | "signals" | "news";

export default function HomeDashboard({ view = "overview" }: { view?: MarketView }) {
  const { locale } = useLanguage();
  const t = ui[locale];
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState("");
  const [sector, setSector] = useState("all");
  const [role, setRole] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "changePct", direction: "descending" });
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(() => new Set());
  const [marketClock, setMarketClock] = useState(() => Date.now());
  const newsDays = useMemo(() => recentShanghaiDays(), []);
  const [newsDay, setNewsDay] = useState(newsDays[0].key);
  const load = useCallback(() => fetch(`/api/market?mode=${view}&lang=${locale}`, { cache: "default", headers: { accept: "application/json" } })
    .then(async (response) => {
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("application/json")) throw new Error("行情接口返回了无效内容");
      const payload = await response.json() as MarketData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "数据加载失败");
      return payload;
    })
    .then((next) => { setData(next); setError(""); })
    .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : "数据加载失败")), [locale, view]);
  const refreshQuotes = useCallback(() => fetch("/api/market?mode=quotes", { cache: "no-store", headers: { accept: "application/json" } })
    .then(async (response) => {
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("application/json")) throw new Error("实时行情接口返回了无效内容");
      const payload = await response.json() as QuoteRefresh;
      if (!response.ok || !payload.quotes?.length) throw new Error(payload.error || "实时行情暂时不可用");
      return payload;
    })
    .then((next) => { setData((current) => current ? mergeQuoteRefresh(current, next) : current); setError(""); })
    .catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : "实时行情更新失败")), []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      setMarketClock(Date.now());
      if (view !== "news" && getAshareMarketState().open) void refreshQuotes();
    }, 30_000);
    return () => clearInterval(timer);
  }, [load, refreshQuotes, view]);
  const localizedCompanies = useMemo(() => (data?.companies ?? []).filter((company) => locale === "zh" || hasEnglishCompany(company)).map((company) => {
    const translatedCompany = localizeCompany(company, locale);
    const translatedSector = locale === "en" ? sectorEnglish[company.sectorSlug] : null;
    return translatedSector ? { ...translatedCompany, sectorName: translatedSector.name, sectorShortName: translatedSector.shortName } : translatedCompany;
  }), [data, locale]);
  const localizedSectors = useMemo(() => (data?.sectors ?? []).map((item) => localizeSector(item, locale)), [data, locale]);
  const companies = useMemo(() => mergeCompanyMappings(localizedCompanies).filter((company) => {
    const matchesSector = sector === "all" || company.sectors.some(item => item.sectorSlug === sector);
    const matchesRole = role === "all" || company.sectors.some(item => item.role === role);
    const searchable = `${company.name}${company.code}${company.sectors.map(item => `${item.sectorName}${item.sectorShortName}`).join(" ")}${(company.researchAliases ?? []).join(" ")}`.toLowerCase();
    return matchesSector && matchesRole && (!search || searchable.includes(search.toLowerCase()));
  }).sort((a, b) => {
    const aValue = a.quote?.[sort.key];
    const bValue = b.quote?.[sort.key];
    const aMissing = aValue == null || !Number.isFinite(aValue);
    const bMissing = bValue == null || !Number.isFinite(bValue);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return sort.direction === "ascending" ? aValue! - bValue! : bValue! - aValue!;
  }), [localizedCompanies, sector, role, search, sort]);
  const sortColumns: { key: SortKey; label: string }[] = [
    { key: "price", label: t.latestPrice },
    { key: "changePct", label: t.todayChange },
    { key: "amount", label: t.turnoverAmount },
    { key: "marketCap", label: t.marketCap },
  ];
  const uniqueCount = data?.counts?.companies ?? (data ? new Set(data.companies.map((company) => company.code)).size : null);
  const mappingCount = data?.counts?.mappings ?? data?.companies.length ?? null;
  const selectedSector = localizedSectors.find((item) => item.slug === sector);
  const selectedSectorDescription = sector === "all"
    ? t.overviewDescription
    : selectedSector?.description;
  const market = getAshareMarketState(new Date(marketClock));
  const signalCount = data?.signalCount ?? (view === "signals" ? (data?.anomalies.length ?? 0) + (data?.sectorAnomalies?.length ?? 0) : null);
  const localeNews = (data?.news ?? []).filter((item) => matchesContentLanguage(item.title, locale));
  const todayNewsCount = localeNews.filter((item) => shanghaiDayKey(item.time) === newsDays[0].key).length;
  const visibleNews = localeNews.filter((item) => shanghaiDayKey(item.time) === newsDay);

  return <main><SiteHeader active={view} />
    {view === "overview" && <>
      <section className="hero" id="top"><div className="hero-copy"><p className="eyebrow"><span />{t.heroEyebrow}</p><h1>{t.heroTitle}</h1><p className="lede">{t.heroLede}</p><div className="hero-actions"><a className="primary-button" href="#overview">{t.browse}</a><span className="market-status"><i className={market.open ? "live-dot" : ""} />{localizeMarketLabel(market.label, locale)} · {data?.source === "live" ? t.connected : t.waitingSource}</span></div></div><div className="hero-metrics"><div><span>{t.trackedCompanies}</span><strong>{uniqueCount == null ? "—" : String(uniqueCount).padStart(2, "0")}</strong><small>{mappingCount == null ? t.readingMappings : `${mappingCount} ${t.mappings}`}</small></div><div><span>{t.sectors}</span><strong>{data?.sectors.length ?? 13}</strong></div><div><span>{t.todaySignals}</span><strong>{signalCount == null ? "—" : String(signalCount).padStart(2, "0")}</strong><small>{t.stockSectorSignals}</small></div><p>{t.sourceStatus} <b>{data?.source === "live" ? t.sourceLive : t.retrying}</b></p></div></section>
      <section className="sector-overview"><button className={sector === "all" ? "selected" : ""} onClick={() => { setSector("all"); document.querySelector("#overview")?.scrollIntoView(); }}><span>00</span><h3>{t.allSectors}</h3><p>{t.allSectorsDescription}</p><footer><b>{uniqueCount == null ? "—" : `${uniqueCount} ${t.companies}`}</b><em>{mappingCount == null ? t.panorama : `${mappingCount} ${t.mappingCount}`}</em></footer></button>{localizedSectors.map((item, index) => <button className={sector === item.slug ? "selected" : ""} key={item.id} onClick={() => { setSector(item.slug); document.querySelector("#overview")?.scrollIntoView(); }}><span>{String(index + 1).padStart(2, "0")}</span><h3>{item.shortName}</h3><p>{item.description}</p><footer><b>{item.count} {t.targets}</b><em className={(item.changePct ?? 0) >= 0 ? "up" : "down"}>{item.changePct === null ? t.quotePending : `${signed(item.changePct)}%`}</em></footer></button>)}</section>
      <section className="dashboard" id="overview"><div className="section-heading"><div><p className="eyebrow"><span />{role === "core" ? "CORE LEADERS" : "INDUSTRY COVERAGE"}</p><h2>{sector === "all" ? (role === "core" ? t.leaders : t.trackedTargetsTitle) : selectedSector?.name}</h2></div><p>{t.dualLayer}<br />{t.refresh30}</p></div>{selectedSectorDescription && <p className="selected-sector-description">{selectedSectorDescription}</p>}<div className="toolbar"><div className="segmented"><button className={role === "all" ? "active" : ""} onClick={() => setRole("all")}>{t.all}</button><button className={role === "core" ? "active" : ""} onClick={() => setRole("core")}>{t.core}</button><button className={role === "candidate" ? "active" : ""} onClick={() => setRole("candidate")}>{t.candidate}</button></div><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} /></label></div>{error && <div className="data-notice">{t.loadLead}{localizeApiError(error, locale)}{t.loadTail}</div>}<div className="leader-table" role="table"><div className="table-head" role="row"><span role="columnheader">{t.companyCode}</span><span role="columnheader">{t.sector}</span>{sortColumns.map(({ key, label }) => {
  const active = sort.key === key;
  const nextDirection = active && sort.direction === "descending" ? "ascending" : "descending";
  const actionLabel = locale === "zh"
    ? `${label}：点击按${nextDirection === "ascending" ? "升序" : "降序"}排列`
    : `${label}: sort ${nextDirection}`;
  return <span role="columnheader" aria-sort={active ? sort.direction : undefined} key={key}>
    <button type="button" className={`table-sort${active ? " active" : ""}`} title={actionLabel} aria-label={actionLabel} onClick={() => setSort(current => ({ key, direction: current.key === key && current.direction === "descending" ? "ascending" : "descending" }))}>
      {label}<span className="table-sort-arrows" aria-hidden="true"><span className={active && sort.direction === "ascending" ? "selected" : ""}>▴</span><span className={active && sort.direction === "descending" ? "selected" : ""}>▾</span></span>
    </button>
  </span>;
})}</div>{companies.map((company, index) => {
  const summary = summarizeSectorMappings(company.sectors);
  const expanded = expandedCompanies.has(company.code);
  const detailsId = `sector-details-${company.code}`;
  return <div className={`table-company-group${expanded ? " expanded" : ""}`} key={company.code}>
    <div className="table-row table-row-summary" role="row">
      <a className="table-row-link" href={`/company/${company.code}`} aria-label={`${company.name} ${company.code}`} />
      <span className="company-cell"><i>{String(index + 1).padStart(2, "0")}</i><b>{company.name}<small>{company.code}</small></b></span>
      <span className="sector-tags sector-tags-summary"><span className="sector-tag-row">{summary.visible.map(item => <em className="sector-tag" key={item.sectorId}>{item.sectorShortName}</em>)}{summary.hiddenCount > 0 && <button type="button" className="sector-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpandedCompanies((current) => {
        const next = new Set(current);
        if (next.has(company.code)) next.delete(company.code); else next.add(company.code);
        return next;
      })}>{expanded ? t.collapseMappings : `＋${summary.hiddenCount} ${t.moreMappings}`}</button>}</span></span>
      <strong>{company.quote?.price == null ? "—" : `¥ ${formatPrice(company.quote.price, locale)}`}</strong>
      <span className={(company.quote?.changePct ?? 0) >= 0 ? "up" : "down"}>{company.quote?.changePct == null ? "—" : `${signed(company.quote.changePct)}%`}</span>
      <span className="amount">{formatAmount(company.quote?.amount, locale)}</span>
      <span className="market-cap">{formatMarketCap(company.quote?.marketCap, locale)}</span>
    </div>
    {expanded && <div className="sector-disclosure" id={detailsId}><span className="sector-disclosure-label">{t.allMappings}</span><span className="sector-tags sector-tags-expanded">{company.sectors.map(item => <em className="sector-tag" key={item.sectorId}>{item.sectorShortName}</em>)}</span></div>}
  </div>;
})}{!companies.length && <div className="empty-state">{t.noMatch}</div>}</div></section>
    </>}
    {view === "signals" && <><SubpageHero eyebrow="EVIDENCE FIRST" title={t.signalsTitle} metric={String(signalCount ?? 0).padStart(2, "0")} metricLabel={t.todaySignals} /><section className="signals signals-page"><div className="section-heading light"><div><p className="eyebrow"><span />ANOMALY MONITOR</p><h2>{t.todaySignificant}</h2></div><p>{t.signalMethod}<br />{t.signalMethod2}</p></div>{error && <div className="data-notice dark-notice">{t.loadLead}{localizeApiError(error, locale)}{t.loadTail}</div>}<div className="signal-grid">{(data?.sectorAnomalies ?? []).map((item) => { const sectorCopy = localizedSectors.find((sectorItem) => sectorItem.id === item.sectorId); return <article className="signal-card sector-signal-card" key={`sector-${item.sectorId}`}><header><span>{t.sectorMove}</span><b className={item.changePct >= 0 ? "up" : "down"}>{signed(item.changePct)}%</b></header><div className="signal-company-link"><h3>{sectorCopy?.shortName ?? item.sectorShortName}<small>{item.directionCount}/{item.memberCount} {t.sameDirection}</small></h3><p>{localizeChineseFact(item.facts, locale)}</p></div><footer className="signal-model-note">{t.sectorMedian}</footer></article>; })}{(data?.anomalies ?? []).filter((item) => locale === "zh" || hasEnglishCompany(item)).map((rawItem) => { const item = localizeCompany(rawItem, locale); const sectorCopy = locale === "en" ? sectorEnglish[item.sectorSlug] : null; return <article className="signal-card" key={`${item.code}-${item.sectorId}`}><header><span>{sectorCopy?.shortName ?? item.anomaly?.sectorShortName ?? item.sectorShortName} · {t.stockMove}</span><b className={(item.quote?.changePct ?? 0) >= 0 ? "up" : "down"}>{signed(item.quote?.changePct ?? 0)}%</b></header><a className="signal-company-link" href={`/company/${item.code}`}><h3>{item.name}<small>{item.code}</small></h3><p>{localizeChineseFact(item.interpretation?.facts ?? "", locale)}</p></a>{item.interpretation?.verified && item.relatedNews && matchesContentLanguage(item.relatedNews.title, locale) && <a className="signal-evidence-link" href={item.relatedNews.url} target="_blank" rel="noreferrer"><i />{locale === "en" ? `Related event · ${item.relatedNews.title}` : item.interpretation.evidence}{locale === "en" && isChineseContent(item.relatedNews.title) && <small className="source-language-badge">{t.originalCn}</small>}</a>}</article>; })}{signalCount === 0 && <div className="signals-empty"><strong>{t.noSignals}</strong><span>{t.signalMethod} {t.signalMethod2}</span></div>}</div></section></>}
    {view === "news" && <><SubpageHero eyebrow="INDUSTRY INTELLIGENCE" title={t.newsTitle} metric={String(todayNewsCount).padStart(2, "0")} metricLabel={t.latestNews} /><section className="news-section news-page"><div className="section-heading"><div><p className="eyebrow"><span />LATEST UPDATES</p><h2>{t.industryNews}</h2></div><p>{t.newsDescription}<br />{t.verifyOriginal}</p></div><div className="news-tabs" role="tablist" aria-label={t.recentNewsAria}>{newsDays.map((day) => <button type="button" role="tab" aria-selected={newsDay === day.key} className={newsDay === day.key ? "active" : ""} onClick={() => setNewsDay(day.key)} key={day.key}><strong>{day.dateLabel}</strong></button>)}</div>{error && <div className="data-notice">{t.loadLead}{localizeApiError(error, locale)}{t.loadTail}</div>}<div className="news-list">{visibleNews.map((item, index) => <a href={item.url} target="_blank" rel="noreferrer" key={item.id || index}><time>{newsTime(item.time, locale)}</time><span className="news-source">{localizeSource(item.source, locale)}{locale === "en" && isChineseContent(`${item.title}${item.summary}`) && <small className="source-language-badge">{t.originalCn}</small>}</span><div><h3>{item.title}</h3>{item.summary && <p>{item.summary.slice(0, 150)}</p>}</div></a>)}{!visibleNews.length && <div className="empty-state">{t.noNewsDay}</div>}</div></section></>}
    <SiteFooter /></main>;
}

function mergeQuoteRefresh(current: MarketData, next: QuoteRefresh): MarketData {
  const quoteMap = new Map(next.quotes.map((quote) => [quote.code, quote]));
  const companies = current.companies.map((company) => ({
    ...company,
    quote: quoteMap.get(company.code) ?? company.quote,
  }));
  const sectors = current.sectors.map((sector) => {
    const changes = companies
      .filter((company) => company.sectorId === sector.id)
      .map((company) => company.quote?.changePct)
      .filter((value): value is number => typeof value === "number");
    return { ...sector, changePct: changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null };
  });
  const anomalyResult = detectMarketAnomalies(companies, current.anomalyProfiles);
  const anomalies = anomalyResult.individuals.map(({ company, assessment }): Anomaly => {
      const relatedNews = current.news.find((item) => {
        const text = `${item.title}${item.summary}`;
        return text.includes(company.name) || text.includes(company.code);
      }) ?? null;
      return {
        ...company,
        anomaly: assessment,
        interpretation: company.quote ? {
          facts: describeIndividualAnomaly(assessment, company.quote),
          evidence: relatedNews ? `相关事件：${relatedNews.title}` : "",
          verified: Boolean(relatedNews),
        } : null,
        relatedNews,
      };
    });
  return { ...current, companies, sectors, anomalies, sectorAnomalies: anomalyResult.sectors, anomalyCandidateCount: anomalyResult.candidateCount, signalCount: anomalies.length + anomalyResult.sectors.length, source: next.source, updatedAt: next.updatedAt };
}

function SiteHeader({ active }: { active: MarketView }) { const { locale } = useLanguage(); const t = ui[locale]; return <header className="site-header"><a className="brand" href="/"><BrandMark /><span>{t.brand}</span><em>COMPUTE CHAIN</em></a><nav aria-label={locale === "en" ? "Main navigation" : "主导航"}><a className={active === "overview" ? "active" : ""} href="/">{t.navOverview}</a><a className={active === "signals" ? "active" : ""} href="/signals">{t.navSignals}</a><a className={active === "news" ? "active" : ""} href="/news">{t.navNews}</a><a className="admin-link" href="/admin">{t.navAdmin}</a><LanguageToggle /></nav></header>; }
function SubpageHero({ eyebrow, title, metric, metricLabel }: { eyebrow: string; title: string; metric: string; metricLabel: string }) { return <section className="subpage-hero"><div><p className="eyebrow"><span />{eyebrow}</p><h1>{title}</h1></div><div><span>{metricLabel}</span><strong>{metric}</strong></div></section>; }
function SiteFooter() { const { locale } = useLanguage(); const t = ui[locale]; return <footer className="site-footer"><a className="brand" href="/"><BrandMark /><span>{t.brand}</span></a><p>{t.footer}</p><span>© 2026 COMPUTE CHAIN</span></footer>; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`; }
function formatPrice(value: number, locale: "zh" | "en") { return value.toLocaleString(locale === "en" ? "en-US" : "zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatAmount(value: number | null | undefined, locale: "zh" | "en") { if (value == null) return "—"; if (locale === "en") return value >= 1e9 ? `¥${(value / 1e9).toFixed(1)}bn` : `¥${(value / 1e6).toFixed(0)}mn`; return value >= 1e8 ? `${(value / 1e8).toFixed(1)}亿` : `${(value / 1e4).toFixed(0)}万`; }
function formatMarketCap(value: number | null | undefined, locale: "zh" | "en") { if (value == null) return "—"; if (locale === "en") return value >= 1e12 ? `¥${(value / 1e12).toFixed(2)}tn` : `¥${(value / 1e9).toFixed(value >= 1e11 ? 0 : 1)}bn`; return value >= 1e12 ? `${(value / 1e12).toFixed(2)}万亿` : `${(value / 1e8).toFixed(value >= 1e11 ? 0 : 1)}亿`; }
function newsTime(value: string, locale: "zh" | "en") { if (!value) return ui[locale].justNow; const date = new Date(value); return Number.isNaN(date.getTime()) ? value.slice(5, 16) : date.toLocaleString(locale === "en" ? "en-GB" : "zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" }); }
function shanghaiDayKey(value: string | Date) { const date = value instanceof Date ? value : new Date(value); if (Number.isNaN(date.getTime())) return String(value).slice(0, 10); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
function recentShanghaiDays() { return Array.from({ length: 3 }, (_, index) => { const date = new Date(Date.now() - index * 86_400_000); const key = shanghaiDayKey(date); return { key, dateLabel: key.replaceAll("-", ".") }; }); }
