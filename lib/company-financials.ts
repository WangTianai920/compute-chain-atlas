import { cninfoFinancialHistory } from "./cninfo-financial-history.ts";

export type FinancialCompany = { code: string; name: string; exchange: string };
export type FinancialView = "quarter" | "half" | "annual" | "cumulative";
export type FinancialIssue = "income_unavailable" | "business_unavailable" | "identity_mismatch" | "identity_unavailable" | "latest_period_incomplete" | "invalid_records" | "indicators_unavailable" | "cashflow_unavailable" | "balance_unavailable";
export type FinancialGrowth = { percent: number | null; status: "normal" | "turn_profit" | "turn_loss" | "loss_narrowed" | "loss_widened" | "unchanged" | "zero_base" | "missing" };
export type FinancialReport = {
  endDate: string;
  revenueBasis?: "operating";
  filingEvidence?: { url: string; page: number; publishedAt: string; verifiedAt: string; fields: string[] };
  revenue: number | null; parentNetProfit: number | null; operatingProfit: number | null;
  operatingMargin: number | null; netMargin: number | null; grossMargin: number | null; weightedRoe: number | null;
  operatingCashFlow: number | null; cash: number | null; totalAssets: number | null; totalLiabilities: number | null; debtRatio: number | null;
  sourceUrls: Partial<Record<FinancialSection, string>>;
};
export type FinancialPeriod = FinancialReport & {
  startDate: string; year: number; period: string;
  revenueGrowth: FinancialGrowth; profitGrowth: FinancialGrowth;
  method: "reported" | "derived"; incomplete: boolean; sources: FinancialReport[];
};
export type FinancialSection = "income" | "indicators" | "cashflow" | "balance";
export type BusinessProfile = { text: string; textEn?: string; sourceUrl: string; fetchedAt: string; reportYear?: string; reportTitle?: string; publishedAt?: string | null; sourceType?: "annual_report" | "prospectus"; mappings?: import("./company-annual-business").AnnualBusinessMapping[] };
export type CompanyFinancials = {
  provider: "cninfo"; code: string; companyName: string; sourceCompanyName: string; fetchedAt: string;
  business: BusinessProfile | null;
  reports: FinancialReport[]; issues: FinancialIssue[];
  sectionFetchedAt: Partial<Record<FinancialSection, string>>;
  financialPageUrl: string;
};
export type FinancialResponse = CompanyFinancials & { window: { from: string; to: string }; stale: boolean; staleSections: FinancialSection[] };
export type FinancialCacheRecord = { data: CompanyFinancials; stale: boolean; staleSections?: FinancialSection[]; businessStale?: boolean };
export type SourceRow = Record<string, unknown>;
export type CninfoSources = { info: SourceRow[]; introduction: SourceRow[] } & Record<FinancialSection, SourceRow[]>;
const ENDPOINT = "https://www.cninfo.com.cn/data20";
const PATHS = { info: "companyOverview/getCompanyInfo", introduction: "companyOverview/getCompanyIntroduction", income: "financialData/getIncomeStatement", indicators: "financialData/getMainIndicators", cashflow: "financialData/getCashFlowStatement", balance: "financialData/getBalanceSheets" } as const;
const GROUP_ENDS = { one: "03-31", middle: "06-30", three: "09-30", year: "12-31" } as const;
const QUARTER_ENDS = Object.values(GROUP_ENDS);
const SECTION_FIELDS = {
  income: ["revenue", "parentNetProfit", "operatingProfit"],
  indicators: ["operatingMargin", "netMargin", "grossMargin", "weightedRoe", "debtRatio"],
  cashflow: ["operatingCashFlow"], balance: ["cash", "totalAssets", "totalLiabilities"],
} as const;
const SECTION_ISSUES = { income: "income_unavailable", indicators: "indicators_unavailable", cashflow: "cashflow_unavailable", balance: "balance_unavailable" } as const;
const SECTIONS = Object.keys(SECTION_FIELDS) as FinancialSection[];
const LATEST_REQUIRED_FIELDS = ["revenue", "parentNetProfit", "operatingProfit", "operatingMargin", "netMargin", "grossMargin", "weightedRoe", "operatingCashFlow", "cash", "totalAssets", "debtRatio"] as const;
const SHORT_CACHE_TTL_MS = 5 * 60_000;
const COMPLETE_CACHE_TTL_MS = 6 * 60 * 60_000;
const SOURCE_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 250;

export function financialWindow(now = new Date()) {
  const to = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  // Keep complete calendar years, including 2023 Q1/H1, rather than a rolling day cutoff.
  return { from: "2023-01-01", to };
}
export function financialSourceUrl(code: string, section: keyof typeof PATHS, sign?: number) {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid company code");
  const params = new URLSearchParams({ scode: code });
  if (section !== "info" && section !== "introduction") {
    if (!Number.isInteger(sign) || sign! < 0) throw new Error("Invalid company classification");
    params.set("sign", String(sign));
  }
  return `${ENDPOINT}/${PATHS[section]}?${params}`;
}
export async function fetchCompanyFinancials(company: FinancialCompany, options: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<CompanyFinancials> {
  const now = options.now ?? new Date(), fetchImpl = options.fetchImpl ?? fetch;
  const initial = await Promise.allSettled(["info", "introduction"].map(section => fetchSourceWithRetry(financialSourceUrl(company.code, section as "info" | "introduction"), company.code, fetchImpl)));
  const sources: CninfoSources = { info: fulfilled(initial[0]), introduction: fulfilled(initial[1]), income: [], indicators: [], cashflow: [], balance: [] };
  const identity = inspectIdentity(company, sources);
  if (identity.status === "valid") {
    const results = await Promise.allSettled(SECTIONS.map(section => fetchSourceWithRetry(financialSourceUrl(company.code, section, identity.sign), company.code, fetchImpl)));
    SECTIONS.forEach((section, index) => { sources[section] = fulfilled(results[index]); });
  }
  return normalizeCompanyFinancials(company, sources, now);
}
export function normalizeCompanyFinancials(company: FinancialCompany, sources: CninfoSources, now = new Date()): CompanyFinancials {
  const window = financialWindow(now), fetchedAt = now.toISOString();
  const data: CompanyFinancials = { provider: "cninfo", code: company.code, companyName: company.name, sourceCompanyName: company.name, fetchedAt, business: null, reports: [], issues: [], sectionFetchedAt: {}, financialPageUrl: `https://www.cninfo.com.cn/new/disclosure/stock?stockCode=${company.code}#mainIndicators` };
  const identity = inspectIdentity(company, sources);
  const profile = companyProfile(sources.introduction, company);
  if (profile) {
    const text = typeof profile.F015V === "string" ? profile.F015V.replace(/\s+/g, " ").trim() : "";
    if (text && text !== "-") data.business = { text, fetchedAt, sourceUrl: financialSourceUrl(company.code, "introduction") };
  }
  if (!data.business) data.issues.push("business_unavailable");
  if (identity.status !== "valid") {
    data.issues.push(identity.status === "mismatch" ? "identity_mismatch" : "identity_unavailable");
    data.issues.push(...Object.values(SECTION_ISSUES));
    return data;
  }
  data.sourceCompanyName = identity.name;
  const reports = new Map<string, FinancialReport>();
  const invalid = () => { if (!data.issues.includes("invalid_records")) data.issues.push("invalid_records"); };
  const ensure = (endDate: string) => {
    // Retain 2022 for comparisons with the first displayed calendar year.
    if (endDate < `${Number(window.from.slice(0, 4)) - 1}-01-01` || endDate > window.to) return null;
    if (!reports.has(endDate)) reports.set(endDate, emptyReport(endDate));
    return reports.get(endDate)!;
  };
  const amountMapping = { "营业总收入": "revenue", "归属母公司净利润": "parentNetProfit", "营业利润": "operatingProfit", "经营活动产生的现金流量净额": "operatingCashFlow", "货币资金": "cash", "总资产": "totalAssets", "总负债": "totalLiabilities" } as const;
  const metricMapping = { F011N: "operatingMargin", F017N: "netMargin", F078N: "grossMargin", F067N: "weightedRoe", F041N: "debtRatio" } as const;
  for (const section of SECTIONS) {
    const root = sources[section][0];
    for (const [group, suffix] of Object.entries(GROUP_ENDS)) {
      for (const row of objectRows(root?.[group])) {
        if (section === "indicators") {
          const endDate = typeof row.ENDDATE === "string" ? row.ENDDATE : "";
          if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate.slice(5) !== suffix) { invalid(); continue; }
          const report = ensure(endDate);
          if (!report) continue;
          for (const [key, field] of Object.entries(metricMapping)) report[field] = financialNumber(row[key]);
          report.sourceUrls[section] = financialSourceUrl(company.code, section, identity.sign);
        } else {
          const field = amountMapping[row.index as keyof typeof amountMapping];
          if (!field || !(SECTION_FIELDS[section] as readonly string[]).includes(field)) continue;
          for (const [year, rawValue] of Object.entries(row)) {
            if (!/^\d{4}$/.test(year)) continue;
            const value = financialNumber(rawValue);
            if (value === null) continue;
            const report = ensure(`${year}-${suffix}`);
            if (!report) continue;
            // CNINFO summary statements are in ten-thousand CNY, not CNY.
            report[field] = Math.round(value * 1_000_000) / 100;
            report.sourceUrls[section] = financialSourceUrl(company.code, section, identity.sign);
          }
        }
      }
    }
    const available = [...reports.values()].some(report => report.endDate >= window.from && SECTION_FIELDS[section].some(field => report[field] !== null));
    if (available) data.sectionFetchedAt[section] = fetchedAt;
    else data.issues.push(SECTION_ISSUES[section]);
  }
  data.reports = [...reports.values()].filter(report => SECTIONS.some(section => SECTION_FIELDS[section].some(field => report[field] !== null))).sort((a, b) => b.endDate.localeCompare(a.endDate));
  return assessFinancialCompleteness(applyFinancialHistory(data));
}

export function assessFinancialCompleteness(data: CompanyFinancials): CompanyFinancials {
  const issues = data.issues.filter(issue => issue !== "latest_period_incomplete");
  const latest = data.reports[0];
  if (latest && LATEST_REQUIRED_FIELDS.some(field => latest[field] === null)) issues.push("latest_period_incomplete");
  if (issues.length === data.issues.length && issues.every((issue, index) => issue === data.issues[index])) return data;
  return { ...data, issues };
}

export function financialCacheTtl(record: FinancialCacheRecord | null | undefined) {
  return record?.stale || record?.data.issues.length ? SHORT_CACHE_TTL_MS : COMPLETE_CACHE_TTL_MS;
}

export function applyFinancialHistory(data: CompanyFinancials): CompanyFinancials {
  if (data.provider !== "cninfo") return data;
  const history = cninfoFinancialHistory.find(item => item.code === data.code && normalizeName(item.name) === normalizeName(data.companyName));
  if (!history || history.publishedAt > data.fetchedAt.slice(0, 10)) return data;
  const fields = ["revenue", "parentNetProfit", "operatingCashFlow"] as const;
  const byDate = new Map(data.reports.map(row => [row.endDate, row]));
  const additions: FinancialReport[] = [];
  const sum = { revenue: 0, parentNetProfit: 0, operatingCashFlow: 0 };
  for (const [index, quarter] of history.quarters.entries()) {
    const endDate = `${history.year}-${QUARTER_ENDS[index]}`, existing = byDate.get(endDate);
    for (const field of fields) sum[field] = Math.round((sum[field] + quarter[field]) * 100) / 100;
    // Do not replace later revisions: the summary endpoint rounds to 100 CNY.
    // Validate every available cumulative amount before applying the entire year.
    if (existing && fields.some(field => existing[field] !== null && Math.abs(existing[field]! - sum[field]) > 100)) return data;
    additions.push({ ...(existing ?? emptyReport(endDate)), ...sum, revenueBasis: "operating", filingEvidence: {
      url: history.url, page: history.page, publishedAt: history.publishedAt, verifiedAt: history.verifiedAt, fields: [...fields],
    } });
  }
  // Require an independently matched annual report, never populate an unknown identity.
  if (!byDate.get(`${history.year}-12-31`)) return data;
  for (const row of additions) byDate.set(row.endDate, row);
  return { ...data, reports: [...byDate.values()].sort((a, b) => b.endDate.localeCompare(a.endDate)) };
}

export function buildFinancialPeriods(reports: FinancialReport[], view: FinancialView, window: { from: string; to: string }): FinancialPeriod[] {
  const byDate = new Map(reports.map(report => [report.endDate, report]));
  const periods = new Map<string, FinancialPeriod>();
  for (const report of reports) {
    const year = Number(report.endDate.slice(0, 4)), quarter = QUARTER_ENDS.indexOf(report.endDate.slice(5) as typeof QUARTER_ENDS[number]) + 1;
    if (!quarter || report.endDate > window.to) continue;
    if (view === "annual" && quarter !== 4 || view === "half" && quarter !== 2 && quarter !== 4) continue;
    const derived = view === "quarter" && quarter > 1 || view === "half" && quarter === 4;
    const previous = derived ? byDate.get(`${year}-${view === "half" ? "06-30" : QUARTER_ENDS[quarter - 2]}`) : undefined;
    const value = (field: "revenue" | "parentNetProfit" | "operatingProfit" | "operatingCashFlow") => derived ? difference(report[field], previous?.[field]) : report[field];
    const revenue = value("revenue"), parentNetProfit = value("parentNetProfit"), operatingProfit = value("operatingProfit");
    const period = view === "quarter" ? `Q${quarter}` : view === "half" ? (quarter === 2 ? "H1" : "H2") : view === "annual" ? "FY" : ["Q1", "H1", "9M", "FY"][quarter - 1];
    const startMonth = view === "quarter" ? String((quarter - 1) * 3 + 1).padStart(2, "0") : view === "half" && quarter === 4 ? "07" : "01";
    periods.set(report.endDate, { ...report, year, period, startDate: `${year}-${startMonth}-01`, revenue, parentNetProfit, operatingProfit, operatingCashFlow: value("operatingCashFlow"),
      operatingMargin: derived ? margin(operatingProfit, revenue) : report.operatingMargin,
      // Rounded cumulative percentages cannot recover accurate quarterly gross/net
      // profit amounts or weighted equity. Do not invent standalone ratios.
      netMargin: derived ? null : report.netMargin, grossMargin: derived ? null : report.grossMargin, weightedRoe: derived ? null : report.weightedRoe,
      revenueGrowth: financialGrowth(null, null), profitGrowth: financialGrowth(null, null),
      method: derived ? "derived" : "reported", incomplete: revenue === null || parentNetProfit === null,
      sources: previous ? [report, previous] : [report],
    });
  }
  for (const row of periods.values()) {
    const previous = periods.get(`${row.year - 1}-${row.endDate.slice(5)}`);
    row.revenueGrowth = financialGrowth(row.revenue, previous?.revenue);
    row.profitGrowth = financialGrowth(row.parentNetProfit, previous?.parentNetProfit);
  }
  return [...periods.values()].filter(row => row.endDate >= window.from).sort((a, b) => b.endDate.localeCompare(a.endDate));
}
export function financialGrowth(current: number | null | undefined, previous: number | null | undefined): FinancialGrowth {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return { percent: null, status: "missing" };
  if (previous < 0) return { percent: null, status: current > 0 ? "turn_profit" : current === previous ? "unchanged" : current > previous ? "loss_narrowed" : "loss_widened" };
  if (current < 0 && previous > 0) return { percent: null, status: "turn_loss" };
  if (previous === 0) return { percent: null, status: current === 0 ? "unchanged" : "zero_base" };
  return { percent: (current - previous) / previous * 100, status: "normal" };
}
export function financialNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value); return Number.isFinite(number) ? number : null;
}
export function mergeFinancialRefresh(fresh: CompanyFinancials, previous?: CompanyFinancials): FinancialCacheRecord {
  const data = { ...fresh, reports: fresh.reports.map(report => ({ ...report, sourceUrls: { ...report.sourceUrls } })), sectionFetchedAt: { ...fresh.sectionFetchedAt } };
  const staleSections: FinancialSection[] = [];
  let businessStale = false;
  if (!previous || previous.provider !== "cninfo" || previous.code !== fresh.code || previous.companyName !== fresh.companyName) return { data, stale: false, staleSections, businessStale };
  const reports = new Map(data.reports.map(report => [report.endDate, report]));
  for (const section of SECTIONS) {
    if (!fresh.issues.includes(SECTION_ISSUES[section]) || !previous.sectionFetchedAt[section]) continue;
    for (const old of previous.reports) {
      if (!old.sourceUrls[section]) continue;
      const report = reports.get(old.endDate) ?? emptyReport(old.endDate);
      for (const field of SECTION_FIELDS[section]) report[field] = old[field];
      report.sourceUrls[section] = old.sourceUrls[section]; reports.set(old.endDate, report);
    }
    data.sectionFetchedAt[section] = previous.sectionFetchedAt[section]; staleSections.push(section);
  }
  data.reports = [...reports.values()].sort((a, b) => b.endDate.localeCompare(a.endDate));
  if (!fresh.business && previous.business) { data.business = previous.business; businessStale = true; }
  // The displayed timestamp is the oldest retained section, never a cache-write time.
  const times = Object.values(data.sectionFetchedAt).filter((value): value is string => !!value);
  if (times.length) data.fetchedAt = times.sort()[0];
  return { data, stale: staleSections.length > 0 || businessStale, staleSections, businessStale };
}

export function financialStaleSections(record: FinancialCacheRecord): FinancialSection[] {
  if (Array.isArray(record.staleSections)) return SECTIONS.filter(section => record.staleSections!.includes(section));
  if (!record.stale) return [];
  return SECTIONS.filter(section => record.data.issues.includes(SECTION_ISSUES[section]));
}
function emptyReport(endDate: string): FinancialReport {
  return { endDate, revenue: null, parentNetProfit: null, operatingProfit: null, operatingMargin: null, netMargin: null, grossMargin: null, weightedRoe: null, operatingCashFlow: null, cash: null, totalAssets: null, totalLiabilities: null, debtRatio: null, sourceUrls: {} };
}
function difference(current: number | null, previous: number | null | undefined) { return current == null || previous == null ? null : Math.round((current - previous) * 100) / 100; }
function margin(numerator: number | null, revenue: number | null) { return numerator == null || revenue == null || revenue <= 0 ? null : numerator / revenue * 100; }
function objectRows(value: unknown): SourceRow[] { return Array.isArray(value) ? value.filter((row): row is SourceRow => !!row && typeof row === "object" && !Array.isArray(row)) : []; }
function normalizeName(value: string) { return value.replace(/\s/g, "").replace(/^(?:\*?ST|XD|XR|DR)/i, "").replace(/[-—](?:UW|U|W)$/i, ""); }
function companyProfile(rows: SourceRow[], company: FinancialCompany) {
  return objectRows(rows[0]?.basicInformation).find(row => row.ASECCODE === company.code && typeof row.ASECNAME === "string" && [row.ASECNAME, ...(typeof row.F002V === "string" ? row.F002V.split(/[,，;；、]/) : [])].some(name => normalizeName(name) === normalizeName(company.name)));
}
function inspectIdentity(company: FinancialCompany, sources: CninfoSources): { status: "valid"; sign: number; name: string } | { status: "mismatch" | "unavailable" } {
  const info = sources.info.find(row => row.SECCODE === company.code);
  if (!info) return { status: sources.info.length ? "mismatch" : "unavailable" };
  if (typeof info.SECNAME !== "string") return { status: "unavailable" };
  const profile = companyProfile(sources.introduction, company);
  if (normalizeName(info.SECNAME) !== normalizeName(company.name) && (!profile || normalizeName(info.SECNAME) !== normalizeName(String(profile.ASECNAME)))) return { status: "mismatch" };
  const sign = financialNumber(info.F002N);
  return sign !== null && Number.isInteger(sign) && sign >= 0 ? { status: "valid", sign, name: info.SECNAME } : { status: "unavailable" };
}
function fulfilled(result: PromiseSettledResult<SourceRow[]>) { return result.status === "fulfilled" ? result.value : []; }
async function fetchSourceWithRetry(url: string, code: string, fetchImpl: typeof fetch) {
  try { return await fetchSource(url, code, fetchImpl); }
  catch (error) {
    if (!retryableFinancialError(error)) throw error;
    await delay(RETRY_DELAY_MS + Math.floor(Math.random() * RETRY_DELAY_MS));
    return fetchSource(url, code, fetchImpl);
  }
}
function retryableFinancialError(error: unknown) {
  return error instanceof TypeError || error instanceof Error && (error.name === "TimeoutError" || error.message === "Financial source unavailable");
}
async function fetchSource(url: string, code: string, fetchImpl: typeof fetch): Promise<SourceRow[]> {
  const response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0", referer: `https://www.cninfo.com.cn/new/disclosure/stock?stockCode=${code}` }, signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error("Financial source unavailable");
  const reader = response.body.getReader(), decoder = new TextDecoder(); let body = "", bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 1_000_000) { await reader.cancel(); throw new Error("Financial response too large"); }
      body += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
  body += decoder.decode();
  const payload = JSON.parse(body);
  if (payload?.code !== 200 || payload.data?.resultMsg !== "success" || !Array.isArray(payload.data.records)) throw new Error("Invalid financial source response");
  const returnedCode = payload.params?.stockCodeRequest?.scode;
  if (returnedCode !== undefined && returnedCode !== code) throw new Error("Mismatched company response");
  const rows = objectRows(payload.data.records);
  if (rows.length !== payload.data.records.length) throw new Error("Malformed financial source record");
  return rows;
}
function delay(milliseconds: number) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
