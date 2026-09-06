import { fetchHistoryData, type HistoryPoint } from "./market-history.ts";
export type { HistoryPoint } from "./market-history.ts";
export type MarketQuote = { code: string; name: string; price: number | null; changePct: number | null; change: number | null; volume: number | null; amount: number | null; marketCap: number | null; turnover: number | null; volumeRatio: number | null; high: number | null; low: number | null; open: number | null; prevClose: number | null; updatedAt: string };
export type NewsItem = { id: string; title: string; summary: string; time: string; source: string; url: string };
export type NewsLanguage = "zh" | "en";

let quoteCache: { key: string; at: number; data: MarketQuote[] } | null = null;
let newsCache: { at: number; data: NewsItem[]; sinaOldestDay: string | null } | null = null;
const historyCache = new Map<string, { at: number; data: HistoryPoint[] }>();
const QUOTE_TIMEOUT_MS = 4_000;
const NEWS_TIMEOUT_MS = 3_500;
const INCREMENTAL_SINA_PAGES = 4;
const SINA_PAGE_BATCH_SIZE = 4;
const MAX_BOOTSTRAP_SINA_PAGES = 24;

export async function fetchQuotes(codes: string[]): Promise<MarketQuote[]> {
  const unique = [...new Set(codes)].sort(); const key = unique.join(",");
  if (quoteCache?.key === key && Date.now() - quoteCache.at < 15_000) return quoteCache.data;
  if (!unique.length) return [];
  const primary = await fetchTencentQuotes(unique);
  if (primary.length) { quoteCache = { key, at: Date.now(), data: primary }; return primary; }
  const secids = unique.map((code) => `${marketPrefix(code)}.${code}`).join(",");
  const url = new URL("https://push2.eastmoney.com/api/qt/ulist.np/get");
  url.searchParams.set("fltt", "2"); url.searchParams.set("invt", "2");
  url.searchParams.set("fields", "f2,f3,f4,f5,f6,f8,f10,f12,f14,f15,f16,f17,f18,f20,f124"); url.searchParams.set("secids", secids);
  try {
    const response = await fetch(url, { headers: dataHeaders(), signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`quote ${response.status}`);
    const json = await response.json() as { data?: { diff?: Record<string, unknown>[] } };
    const now = new Date().toISOString();
    const data = (json.data?.diff ?? []).map((row): MarketQuote => ({
      code: String(row.f12 ?? ""), name: String(row.f14 ?? ""), price: numberOrNull(row.f2), changePct: numberOrNull(row.f3), change: numberOrNull(row.f4),
      volume: numberOrNull(row.f5), amount: numberOrNull(row.f6), marketCap: numberOrNull(row.f20), turnover: numberOrNull(row.f8), volumeRatio: numberOrNull(row.f10),
      high: numberOrNull(row.f15), low: numberOrNull(row.f16), open: numberOrNull(row.f17), prevClose: numberOrNull(row.f18), updatedAt: now,
    }));
    if (data.length) { quoteCache = { key, at: Date.now(), data }; return data; }
  } catch { return []; }
  return [];
}
export async function fetchMarketNews(options: { bootstrap?: boolean } = {}): Promise<NewsItem[]> {
  const requiredOldestDay = oldestRecentShanghaiDay();
  const cacheCoversWindow = newsCache?.sinaOldestDay != null && newsCache.sinaOldestDay <= requiredOldestDay;
  if (newsCache && Date.now() - newsCache.at < 5 * 60_000 && (!options.bootstrap || cacheCoversWindow)) return newsCache.data;
  const results = await Promise.allSettled([
    fetchEastmoneyMarketNews(180),
    fetchSinaMarketNews(options.bootstrap === true),
    fetchExternalIndustryNews(),
  ]);
  const eastmoney = results[0].status === "fulfilled" ? results[0].value : [];
  const sinaResult = results[1].status === "fulfilled" ? results[1].value : { items: [], oldestDay: null };
  const external = results[2].status === "fulfilled" ? results[2].value : [];
  const seen = new Set<string>();
  const data = [...eastmoney, ...sinaResult.items, ...external]
    .filter((item) => isWithinRecentShanghaiDays(item.time, 3))
    .filter((item) => { const key = item.title.replace(/\s+/g, "").toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => newsTimestamp(b.time) - newsTimestamp(a.time));
  newsCache = { at: Date.now(), data, sinaOldestDay: sinaResult.oldestDay };
  return data;
}

export function selectMarketNews(items: NewsItem[], options: { companyNames?: string[]; language: NewsLanguage; limit?: number }) {
  const companyNames = options.companyNames ?? [];
  const limit = options.limit ?? 800;
  return items
    .filter((item) => isComputeInfrastructureNews(item, companyNames))
    .filter((item) => matchesNewsLanguage(item, options.language))
    .slice(0, limit);
}

const externalIndustryFeeds = [
  { url: "https://www.servethehome.com/feed/", source: "ServeTheHome", prefix: "sth" },
  { url: "https://www.eetimes.com/feed/", source: "EE Times", prefix: "eetimes" },
  { url: "https://semiengineering.com/feed/", source: "Semiconductor Engineering", prefix: "semieng" },
] as const;

async function fetchExternalIndustryNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(externalIndustryFeeds.map(async (feed) => {
    try {
      const response = await fetch(feed.url, {
        headers: { "user-agent": "Mozilla/5.0 ComputeChain/1.0", accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*" },
        signal: AbortSignal.timeout(NEWS_TIMEOUT_MS),
      });
      if (!response.ok) return [];
      return parseNewsFeed(await response.text(), feed.source, feed.prefix).slice(0, 50);
    } catch { return []; }
  }));
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

export function parseNewsFeed(xml: string, source: string, prefix = "feed"): NewsItem[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  return blocks.map((block, index) => {
    const title = cleanFeedText(readXmlTag(block, "title"));
    const summary = cleanFeedText(readXmlTag(block, "description") || readXmlTag(block, "summary") || readXmlTag(block, "content:encoded") || readXmlTag(block, "content"));
    const time = cleanFeedText(readXmlTag(block, "pubDate") || readXmlTag(block, "dc:date") || readXmlTag(block, "published") || readXmlTag(block, "updated"));
    const rssLink = cleanFeedText(readXmlTag(block, "link"));
    const atomLink = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1] ?? "";
    const url = normalizeUrl(decodeXml(rssLink || atomLink));
    const guid = cleanFeedText(readXmlTag(block, "guid") || readXmlTag(block, "id"));
    return { id: `${prefix}-${guid || index}`, title, summary, time, source, url };
  }).filter((item) => item.title && /^https:\/\//i.test(item.url));
}

export function isComputeInfrastructureNews(item: Pick<NewsItem, "title" | "summary">, companyNames: string[] = []) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (companyNames.some((name) => name && text.includes(name.toLowerCase()))) return true;
  const chineseTerms = ["算力", "智算", "芯片", "半导体", "服务器", "数据中心", "光模块", "光通信", "光互联", "交换机", "网络设备", "液冷", "温控", "覆铜板", "存储芯片", "内存", "先进封装", "晶圆", "光刻", "刻蚀", "算力租赁"];
  if (chineseTerms.some((term) => text.includes(term))) return true;
  const asciiTerms = [
    "gpu", "npu", "cpu", "tpu", "asic", "idc", "ups", "hvdc", "pcb", "cxl", "hbm", "dram", "nand", "nvme", "soc", "compute infrastructure", "ai infrastructure", "accelerator", "semiconductor", "processor", "server", "data center", "data centre", "liquid cooling", "optical module", "optical transceiver", "optical interconnect", "ethernet", "network switch", "copper-clad laminate", "advanced packaging", "high-bandwidth memory", "wafer", "lithography", "chiplet",
  ];
  return asciiTerms.some((term) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`, "i").test(text));
}

export function matchesNewsLanguage(item: Pick<NewsItem, "title">, language: NewsLanguage) {
  const hasChinese = /[\u3400-\u9fff]/.test(item.title);
  return language === "zh" ? hasChinese : !hasChinese && /[a-z]/i.test(item.title);
}

async function fetchEastmoneyMarketNews(limit: number): Promise<NewsItem[]> {
  const url = new URL("https://np-weblist.eastmoney.com/comm/web/getFastNewsList");
  url.searchParams.set("client", "web"); url.searchParams.set("biz", "web_724"); url.searchParams.set("fastColumn", "102");
  url.searchParams.set("sortEnd", ""); url.searchParams.set("pageSize", String(Math.max(limit, 30))); url.searchParams.set("req_trace", crypto.randomUUID());
  try {
    const response = await fetch(url, { headers: { ...dataHeaders(), referer: "https://kuaixun.eastmoney.com/" }, signal: AbortSignal.timeout(NEWS_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`news ${response.status}`);
    const json = await response.json() as { data?: { fastNewsList?: Record<string, unknown>[] } };
    const data = (json.data?.fastNewsList ?? []).map((item, index): NewsItem => ({
      id: String(item.code ?? item.id ?? index), title: String(item.title ?? item.summary ?? ""), summary: String(item.summary ?? item.digest ?? ""),
      time: String(item.showTime ?? item.time ?? ""), source: String(item.mediaName ?? item.source ?? "东方财富"),
      url: normalizeUrl(String(item.url ?? item.shareUrl ?? (item.code ? `https://finance.eastmoney.com/a/${item.code}.html` : "https://kuaixun.eastmoney.com/"))),
    })).filter((item) => item.title);
    return data.slice(0, limit);
  } catch { return []; }
}

async function fetchSinaMarketNews(coverRecentWindow: boolean): Promise<{ items: NewsItem[]; oldestDay: string | null }> {
  const items: NewsItem[] = [];
  const maxPages = coverRecentWindow ? MAX_BOOTSTRAP_SINA_PAGES : INCREMENTAL_SINA_PAGES;
  for (let startPage = 1; startPage <= maxPages; startPage += SINA_PAGE_BATCH_SIZE) {
    const pageNumbers = Array.from(
      { length: Math.min(SINA_PAGE_BATCH_SIZE, maxPages - startPage + 1) },
      (_, offset) => startPage + offset,
    );
    const results = await Promise.allSettled(pageNumbers.map(async (pageNumber) => {
      const url = new URL("https://feed.mix.sina.com.cn/api/roll/get");
      for (const [key, value] of Object.entries({ pageid: "153", lid: "2516", num: "100", page: String(pageNumber) })) url.searchParams.set(key, value);
      try {
        const response = await fetch(url, { headers: { ...dataHeaders(), referer: "https://finance.sina.com.cn/" }, signal: AbortSignal.timeout(NEWS_TIMEOUT_MS) });
        if (!response.ok) return [];
        const json = await response.json() as { result?: { data?: Record<string, unknown>[] } };
        return (json.result?.data ?? []).map((item, itemIndex): NewsItem => {
          const seconds = Number(item.ctime ?? item.intime ?? 0);
          return {
            id: `sina-${String(item.oid ?? item.docid ?? `${pageNumber}-${itemIndex}`)}`,
            title: stripTags(String(item.title ?? "")),
            summary: stripTags(String(item.intro ?? item.summary ?? item.wapsummary ?? "")),
            time: seconds > 0 ? new Date(seconds * 1000).toISOString() : "",
            source: String(item.media_name ?? item.author ?? "新浪财经"),
            url: normalizeUrl(String(item.url ?? item.wapurl ?? "https://finance.sina.com.cn/")),
          };
        }).filter((item) => item.title && item.url);
      } catch { return []; }
    }));
    items.push(...results.flatMap((result) => result.status === "fulfilled" ? result.value : []));
    if (coverRecentWindow && coversRecentShanghaiWindow(items)) break;
  }
  return { items, oldestDay: oldestNewsShanghaiDay(items) };
}

export async function fetchCompanyNews(code: string, name: string, limit = 12): Promise<NewsItem[]> {
  const [eastmoney, marketNews] = await Promise.all([fetchEastmoneyCompanyNews(code, name, limit), fetchMarketNews()]);
  const related = marketNews.filter((item) => `${item.title}${item.summary}`.includes(name) || `${item.title}${item.summary}`.includes(code));
  const seen = new Set<string>();
  return [...related, ...eastmoney]
    .filter((item) => { const key = item.title.replace(/\s+/g, "").toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => newsTimestamp(b.time) - newsTimestamp(a.time))
    .slice(0, limit);
}

async function fetchEastmoneyCompanyNews(code: string, name: string, limit: number): Promise<NewsItem[]> {
  const inner = { uid: "", keyword: `${name} ${code}`, type: ["cmsArticleWebOld"], client: "web", clientType: "web", clientVersion: "curr", param: { cmsArticleWebOld: { searchScope: "default", sort: "time", pageIndex: 1, pageSize: limit, preTag: "", postTag: "" } } };
  const url = new URL("https://search-api-web.eastmoney.com/search/jsonp"); url.searchParams.set("cb", "computeNews"); url.searchParams.set("param", JSON.stringify(inner));
  try {
    const response = await fetch(url, { headers: dataHeaders(), signal: AbortSignal.timeout(NEWS_TIMEOUT_MS) }); const text = await response.text();
    const match = text.match(/^computeNews\((.*)\)\s*;?$/s); if (!match) return [];
    const json = JSON.parse(match[1]) as { result?: { cmsArticleWebOld?: Record<string, unknown>[] } };
    return (json.result?.cmsArticleWebOld ?? []).map((item, index): NewsItem => ({ id: String(item.code ?? index), title: stripTags(String(item.title ?? "")), summary: stripTags(String(item.content ?? item.summary ?? "")), time: String(item.date ?? item.showTime ?? ""), source: String(item.mediaName ?? item.source ?? "东方财富"), url: normalizeUrl(String(item.url ?? "https://so.eastmoney.com/")) })).filter((item) => item.title);
  } catch { return []; }
}

export async function fetchAnnouncements(code: string, limit = 8): Promise<NewsItem[]> {
  const url = new URL("https://np-anotice-stock.eastmoney.com/api/security/ann");
  for (const [key, value] of Object.entries({ sr: "-1", page_size: String(limit), page_index: "1", ann_type: "A", client_source: "web", stock_list: code })) url.searchParams.set(key, value);
  try {
    const response = await fetch(url, { headers: dataHeaders(), signal: AbortSignal.timeout(NEWS_TIMEOUT_MS) }); const json = await response.json() as { data?: { list?: Record<string, unknown>[] } };
    return (json.data?.list ?? []).map((item, index): NewsItem => { const articleCode = String(item.art_code ?? ""); return { id: articleCode || String(index), title: String(item.title ?? "公告"), summary: "上市公司公告", time: String(item.notice_date ?? ""), source: "公司公告", url: articleCode ? `https://data.eastmoney.com/notices/detail/${code}/${articleCode}.html` : `https://data.eastmoney.com/notices/stock/${code}.html` }; });
  } catch { return []; }
}

export async function fetchHistory(code: string, limit = 30): Promise<HistoryPoint[]> {
  const cacheKey = `${code}:${limit}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.data;
  const data = await fetchHistoryData(code, limit);
  if (data.length) historyCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export function interpretQuote(quote: MarketQuote, matchedNews?: NewsItem) {
  const facts: string[] = []; const pct = quote.changePct ?? 0;
  if (Math.abs(pct) >= 3) facts.push(`股价${pct > 0 ? "上涨" : "下跌"}${Math.abs(pct).toFixed(2)}%`);
  if ((quote.volumeRatio ?? 0) >= 1.8) facts.push(`量比${quote.volumeRatio?.toFixed(2)}，成交明显放大`);
  if ((quote.turnover ?? 0) >= 5) facts.push(`换手率${quote.turnover?.toFixed(2)}%`);
  const evidence = matchedNews ? `相关事件：${matchedNews.title}` : "暂未匹配到可验证的直接新闻或公告";
  return { facts: facts.length ? facts.join("；") : "价格与成交暂未触发显著异动阈值", evidence, verified: Boolean(matchedNews) };
}

function marketPrefix(code: string) { return code.startsWith("6") ? 1 : 0; }
function marketSymbol(code: string) { return `${code.startsWith("92") ? "bj" : code.startsWith("6") ? "sh" : "sz"}${code}`; }
function numberOrNull(value: unknown) { const number = Number(value); return Number.isFinite(number) && value !== "-" ? number : null; }
function dataHeaders() { return { "user-agent": "Mozilla/5.0 ComputeChain/1.0", referer: "https://quote.eastmoney.com/", accept: "application/json,text/plain,*/*" }; }
function stripTags(value: string) { return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim(); }
function readXmlTag(block: string, tag: string) { const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"))?.[1] ?? ""; }
function cleanFeedText(value: string) { return stripTags(decodeXml(value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, ""))).replace(/\s+/g, " ").trim(); }
function decodeXml(value: string) { return value.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16))).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'"); }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function normalizeUrl(value: string) { return value.replace(/^http:\/\//i, "https://"); }
function shanghaiDayKey(value: string | Date) { const date = value instanceof Date ? value : parseNewsDate(value); if (Number.isNaN(date.getTime())) return String(value).slice(0, 10); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
function parseNewsDate(value: string) { if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) return new Date(value.replace(" ", "T") + "+08:00"); return new Date(value); }
function newsTimestamp(value: string) { const timestamp = parseNewsDate(value).getTime(); return Number.isFinite(timestamp) ? timestamp : 0; }
function isWithinRecentShanghaiDays(value: string, days: number) { const target = shanghaiDayKey(value); const allowed = new Set(Array.from({ length: days }, (_, index) => shanghaiDayKey(new Date(Date.now() - index * 86_400_000)))); return allowed.has(target); }
function oldestRecentShanghaiDay(now = Date.now()) { return shanghaiDayKey(new Date(now - 2 * 86_400_000)); }
function oldestNewsShanghaiDay(items: NewsItem[]) {
  return items.reduce<string | null>((oldest, item) => {
    const day = shanghaiDayKey(item.time);
    return day && (!oldest || day < oldest) ? day : oldest;
  }, null);
}
export function coversRecentShanghaiWindow(items: NewsItem[], now = Date.now()) {
  const oldestDay = oldestNewsShanghaiDay(items);
  return oldestDay != null && oldestDay <= oldestRecentShanghaiDay(now);
}

async function fetchTencentQuotes(codes: string[]): Promise<MarketQuote[]> {
  try {
    const url = `https://qt.gtimg.cn/q=${codes.map(marketSymbol).join(",")}`;
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 ComputeChain/1.0", referer: "https://gu.qq.com/" }, signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS) });
    if (!response.ok) return [];
    const text = new TextDecoder("gb18030").decode(await response.arrayBuffer());
    const now = new Date().toISOString();
    return text.split(";\n").map((line) => line.match(/="(.*)";?$/)?.[1]?.split("~")).filter((parts): parts is string[] => Boolean(parts && parts.length > 40)).map((parts) => ({
      code: parts[2], name: parts[1], price: numberOrNull(parts[3]), prevClose: numberOrNull(parts[4]), open: numberOrNull(parts[5]),
      volume: numberOrNull(parts[6]), change: numberOrNull(parts[31]), changePct: numberOrNull(parts[32]), high: numberOrNull(parts[33]), low: numberOrNull(parts[34]),
      amount: numberOrNull(parts[37]) === null ? null : Number(parts[37]) * 10_000, marketCap: numberOrNull(parts[44]) === null ? null : Number(parts[44]) * 100_000_000, turnover: numberOrNull(parts[38]), volumeRatio: numberOrNull(parts[49]), updatedAt: now,
    }));
  } catch { return []; }
}
