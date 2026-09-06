import { getCompanyHistory } from "../../../../lib/company-history-runtime";
import { buildHistoricalVolatilityProfile, describeIndividualAnomaly, detectMarketAnomalies } from "../../../../lib/anomaly";
import { getCompanyRecord, listCompanyEntries } from "../../../../lib/data";
import { fetchAnnouncements, fetchCompanyNews, fetchQuotes, matchesNewsLanguage, type NewsLanguage } from "../../../../lib/market-data";
import { hasEnglishCompany } from "../../../../lib/i18n";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const language = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "zh" satisfies NewsLanguage;
  const { code } = await context.params; const company = await getCompanyRecord(code);
  if (!company) return Response.json({ error: "未找到该标的" }, { status: 404 });
  if (language === "en" && !hasEnglishCompany(company)) return Response.json({ error: "该公司的英文资料正在补全" }, { status: 404 });
  const allEntries = await listCompanyEntries(false);
  const entries = language === "en" ? allEntries.filter(hasEnglishCompany) : allEntries;
  const codes = [...new Set(entries.map((entry) => entry.code))];
  const [quotes, historyResult, allNews, announcements] = await Promise.all([fetchQuotes(codes), getCompanyHistory(code, 40), fetchCompanyNews(code, company.name), fetchAnnouncements(code)]);
  const { history } = historyResult;
  const news = allNews.filter((item) => matchesNewsLanguage(item, language));
  const quoteMap = new Map(quotes.map((item) => [item.code, item]));
  const quote = quoteMap.get(code) ?? null;
  const shortName = company.name.replace(/[-—](U|W|UW)$/i, "");
  const eventTerms = /业绩|订单|合同|中标|收购|增持|减持|回购|风险提示|重大|募投|诉讼|项目|产能|合作|研发|产品|投产/;
  const related = news.find((item) => `${item.title}${item.summary}`.includes(shortName) || item.title.includes(code))
    ?? (language === "zh" ? announcements.find((item) => eventTerms.test(item.title)) : null)
    ?? null;
  const currentDay = quote?.updatedAt ? shanghaiDayKey(quote.updatedAt) : "";
  const profile = historyResult.historyStatus === "stale" ? null : buildHistoricalVolatilityProfile(history.filter((point) => point.date !== currentDay).map((point) => point.changePct));
  const marketEntries = entries.map((entry) => ({ ...entry, quote: quoteMap.get(entry.code) ?? null }));
  const result = detectMarketAnomalies(marketEntries, profile ? { [code]: profile } : {}, { limit: 100 });
  const individual = result.individuals.find((item) => item.company.code === code);
  const sectorSignal = result.sectors.find((signal) => company.sectors.some((sector) => sector.sectorId === signal.sectorId));
  const facts = individual && quote
    ? describeIndividualAnomaly(individual.assessment, quote)
    : sectorSignal
      ? `${sectorSignal.facts}；个股未显著偏离板块中位数`
      : null;
  const interpretation = facts ? {
    facts,
    evidence: related ? `相关事件：${related.title}` : "",
    verified: Boolean(related),
  } : null;
  return Response.json({ company, quote, ...historyResult, news, announcements, interpretation, relatedNews: related }, { headers: { "cache-control": historyResult.historyStatus === "current" ? "public, max-age=15, stale-while-revalidate=60" : "no-store" } });
}

function shanghaiDayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
