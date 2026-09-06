"use client";

import { useEffect, useMemo, useState } from "react";
import { buildFinancialPeriods, type FinancialGrowth, type FinancialPeriod, type FinancialResponse, type FinancialView } from "../../lib/company-financials";
import { financialCopy, sectorEnglish } from "../../lib/i18n";
import { getEnglishBusiness } from "../../lib/company-business-translations";
import { useLanguage, type Locale } from "./LanguageProvider";

type FinancialCategory = "performance" | "profitability" | "financialPosition";

export default function CompanyFinancials({ code }: { code: string }) {
  const { locale } = useLanguage(), copy = financialCopy[locale];
  const [result, setResult] = useState<{ code: string; data?: FinancialResponse; error?: boolean } | null>(null);
  const [category, setCategory] = useState<FinancialCategory>("performance");
  const [attempt, setAttempt] = useState(0), [view, setView] = useState<FinancialView>("cumulative"), [year, setYear] = useState("all");
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    let active = true;
    fetch(`/api/company/${code}/financials`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Financial source unavailable");
        const data = await response.json() as FinancialResponse;
        if (data.provider !== "cninfo" || data.code !== code || !Array.isArray(data.reports)) throw new Error("Invalid financial response");
        if (active) setResult({ code, data });
      })
      .catch(() => { if (active) setResult({ code, error: true }); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [code, attempt]);

  const data = result?.code === code ? result.data : undefined;
  const businessText = data?.business
    ? locale === "en" ? data.business.textEn ?? getEnglishBusiness(code, data.business.text) ?? copy.businessTranslationPending : data.business.text
    : copy.businessUnavailable;
  const error = result?.code === code && result.error;
  const rows = useMemo(() => data ? buildFinancialPeriods(data.reports, view, data.window) : [], [data, view]);
  const years = [...new Set(rows.map(row => String(row.year)))];
  const selectedYear = years.includes(year) ? year : "all";
  const visibleRows = rows.filter(row => selectedYear === "all" || String(row.year) === selectedYear);
  const latest = data ? buildFinancialPeriods(data.reports, "cumulative", data.window)[0] : undefined;
  const retry = () => { setResult(null); setAttempt(value => value + 1); };
  const views = [{ value: "cumulative", label: copy.reports }, { value: "quarter", label: copy.quarter }, { value: "half", label: copy.half }, { value: "annual", label: copy.annual }] as const;

  return <section className="company-financials" id="financials" aria-labelledby="financial-title">
    <div className="section-heading"><div><p className="eyebrow"><span />BUSINESS & FINANCIALS</p><h2 id="financial-title">{copy.title}</h2></div></div>
    {!data && !error && <div className="financial-empty" role="status">{copy.loading}</div>}
    {error && <div className="financial-empty" role="alert"><p>{copy.error}</p><button onClick={retry}>{copy.retry}</button></div>}
    {data && <>
      <div className="financial-business"><h3>{copy.business}</h3>
        <p lang={locale === "en" ? "en" : "zh-CN"}>{businessText}</p>
        {!!data.business?.mappings?.length && <div className="financial-business-mappings">
          <h4>{copy.mappingBusiness}</h4>
          <div className="financial-business-mapping-grid">{splitMappingRows(data.business.mappings).map((mappingRow, rowIndex) => <div className="financial-business-mapping-row" key={rowIndex}>{mappingRow.map(mapping => <article key={mapping.sectorSlug}>
              <header><strong>{locale === "en" ? sectorEnglish[mapping.sectorSlug]?.name ?? mapping.sectorSlug : mapping.sectorName}</strong><span>{mapping.role === "core" ? copy.core : copy.candidate}</span></header>
              <p lang={locale === "en" ? "en" : "zh-CN"}>{locale === "en" ? mapping.detailEn ?? copy.businessTranslationPending : mapping.detail}</p>
            </article>)}</div>)}</div>
        </div>}
        <div className="financial-business-meta">
          {data.business?.reportTitle && <a href={data.business.sourceUrl} target="_blank" rel="noopener noreferrer">{locale === "en" ? `${data.business.sourceType === "prospectus" ? copy.prospectusSource : copy.annualSource} ↗` : <>{data.business.sourceType === "prospectus" ? copy.prospectusSource : copy.annualSource}: <span lang="zh-CN">{data.business.reportTitle}</span> ↗</>}</a>}
          {data.business?.publishedAt && <span>{copy.publishedAt} {data.business.publishedAt}</span>}
          {locale === "en" && <span>{copy.translationNote}</span>}
          {data.sourceCompanyName !== data.companyName && <span>{copy.sourceCompanyName}: <span lang="zh-CN">{data.sourceCompanyName}</span> · {code}</span>}
        </div>
      </div>
      <div className="financial-latest"><h3>{copy.latest} <strong>{latest ? periodLabel(latest, locale) : "—"}</strong></h3><span>{latest && `${latest.startDate} — ${latest.endDate}`}</span></div>
      <div className="financial-cards">
        <SummaryCard label={copy.revenue} value={amount(latest?.revenue, locale)} unit={copy.unit} detail={`${copy.yoy} ${growth(latest?.revenueGrowth, locale)}`} />
        <SummaryCard label={copy.profit} value={amount(latest?.parentNetProfit, locale)} unit={copy.unit} detail={`${copy.yoy} ${growth(latest?.profitGrowth, locale)}`} negative={(latest?.parentNetProfit ?? 0) < 0} />
        <SummaryCard label={copy.operatingCashFlow} value={amount(latest?.operatingCashFlow, locale)} unit={copy.unit} detail={copy.reports} negative={(latest?.operatingCashFlow ?? 0) < 0} />
        <SummaryCard label={copy.weightedRoe} value={percentage(latest?.weightedRoe, locale)} detail={copy.cumulativeBasis} negative={(latest?.weightedRoe ?? 0) < 0} />
      </div>
      <div className="financial-category-tabs" role="group" aria-label={copy.category}>{(["performance", "profitability", "financialPosition"] as const).map(value => <button key={value} className={category === value ? "active" : ""} aria-pressed={category === value} onClick={() => setCategory(value)}>{copy[value]}</button>)}</div>
      <div className="financial-toolbar"><div className="segmented financial-tabs" role="group" aria-label={copy.view}>{views.map(item => <button key={item.value} className={view === item.value ? "active" : ""} aria-pressed={view === item.value} onClick={() => setView(item.value)}>{item.label}</button>)}</div><label>{copy.year}<select value={selectedYear} onChange={event => setYear(event.target.value)}><option value="all">{copy.allYears}</option>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
      <div className="financial-table-caption"><span>{copy.window} {data.window.from} — {data.window.to}</span><span>{copy.tableUnit}</span></div>
      {category === "profitability" && (view === "quarter" || view === "half") && <p className="financial-context-note">{copy.derivedRatios}</p>}
      {category === "financialPosition" && <p className="financial-context-note">{copy.balanceNote}</p>}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Horizontal financial tables must be focusable for keyboard scrolling. */}
      {visibleRows.length > 0 ? <div className="financial-table-scroll" role="region" aria-label={copy[category]} tabIndex={0}><table className="financial-table"><caption className="financial-sr-only">{copy[category]} · {views.find(item => item.value === view)?.label} · {copy.tableUnit}</caption><thead><tr><th scope="col">{copy.period}</th>{columns(category).map(key => <th scope="col" key={key}>{key === "parentNetProfit" ? copy.profit : key === "revenue" && visibleRows.some(row => row.revenueBasis === "operating") ? copy.revenueGeneral : copy[key]}</th>)}</tr></thead><tbody>{visibleRows.map(row => <FinancialRow key={`${view}-${row.endDate}`} row={row} locale={locale} category={category} />)}</tbody></table></div> : <div className="financial-empty"><p>{latest ? copy.emptyView : copy.unavailable}</p>{!latest && <button onClick={retry}>{copy.retry}</button>}</div>}
    </>}
  </section>;
}

function columns(category: FinancialCategory) {
  if (category === "performance") return ["revenue", "revenueGrowth", "parentNetProfit", "profitGrowth"] as const;
  if (category === "profitability") return ["grossMargin", "operatingMargin", "netMargin", "weightedRoe"] as const;
  return ["operatingCashFlow", "cash", "totalAssets", "debtRatio"] as const;
}
function splitMappingRows<T>(items: T[]) {
  const rows: T[][] = [];
  let index = items.length > 1 && items.length % 2 === 1 ? 1 : 0;
  if (index === 1) rows.push(items.slice(0, 1));
  while (index < items.length) {
    rows.push(items.slice(index, index + 2));
    index += 2;
  }
  return rows;
}
function SummaryCard({ label, value, unit, detail, negative }: { label: string; value: string; unit?: string; detail: string; negative?: boolean }) {
  return <div className="financial-card"><span>{label}</span><div><strong className={negative ? "financial-loss" : ""}>{value}</strong>{unit && <small>{unit}</small>}</div><p>{detail}</p></div>;
}
function FinancialRow({ row, locale, category }: { row: FinancialPeriod; locale: Locale; category: FinancialCategory }) {
  return <tr><th scope="row"><strong>{periodLabel(row, locale)}</strong><small>{row.startDate} — {row.endDate}</small></th>{columns(category).map(key => {
    if (key === "revenueGrowth" || key === "profitGrowth") return <td className="financial-growth" key={key}>{growth(row[key], locale)}</td>;
    const value = row[key];
    const isRatio = ["grossMargin", "operatingMargin", "netMargin", "weightedRoe", "debtRatio"].includes(key);
    return <td key={key} title={!isRatio ? `${key === "revenue" ? (row.revenueBasis === "operating" ? financialCopy[locale].operatingRevenue : financialCopy[locale].revenue) + ": " : ""}${exact(value, locale)}` : undefined} className={(value ?? 0) < 0 ? "financial-loss" : ""}>{isRatio ? percentage(value, locale) : amount(value, locale)}</td>;
  })}</tr>;
}
function growth(value: FinancialGrowth | undefined, locale: Locale) {
  if (!value) return "—";
  if (value.status !== "normal") return financialCopy[locale].growthStatus[value.status];
  return `${(value.percent ?? 0) > 0 ? "+" : ""}${percentage(value.percent, locale)}`;
}

function periodLabel(row: FinancialPeriod, locale: Locale) {
  const names = financialCopy[locale].periodNames;
  return `${row.year} ${names[row.period as keyof typeof names] ?? row.period}`;
}
function amount(value: number | null | undefined, locale: Locale) {
  if (value == null) return "—";
  if (value !== 0 && Math.abs(value) < 500_000) return value < 0 ? "−<0.01" : "<0.01";
  return (value / 100_000_000).toLocaleString(locale === "en" ? "en-US" : "zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function exact(value: number | null, locale: Locale) {
  return value === null ? "—" : value.toLocaleString(locale === "en" ? "en-US" : "zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function percentage(value: number | null | undefined, locale: Locale) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.005) return value < 0 ? "−<0.01%" : "<0.01%";
  return `${value.toLocaleString(locale === "en" ? "en-US" : "zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
