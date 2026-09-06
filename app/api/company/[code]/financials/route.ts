import { claimRuntimeRefresh, getCompanyRecord, readRuntimeSnapshot, releaseRuntimeRefresh, writeRuntimeSnapshot } from "../../../../../lib/data";
import { applyFinancialHistory, assessFinancialCompleteness, fetchCompanyFinancials, financialCacheTtl, financialStaleSections, financialWindow, mergeFinancialRefresh, type FinancialCacheRecord, type FinancialResponse } from "../../../../../lib/company-financials";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  if (!/^\d{6}$/.test(code)) return Response.json({ error: "invalid_code" }, { status: 400 });
  let refreshClaimed = false;
  let key = "";
  try {
    const company = await getCompanyRecord(code);
    if (!company) return Response.json({ error: "company_not_found" }, { status: 404 });
    key = `company-financials:cninfo:v1:${code}`;
    const rawStored = await readRuntimeSnapshot<FinancialCacheRecord>(key);
    const stored = rawStored ? { ...rawStored, payload: { ...rawStored.payload, data: assessFinancialCompleteness(applyFinancialHistory(rawStored.payload.data)) } } : null;
    const cached = stored?.payload.data.provider === "cninfo" && stored.payload.data.code === code && stored.payload.data.companyName === company.name ? stored : null;
    const ttl = financialCacheTtl(cached?.payload);
    if (cached && Date.now() - Date.parse(cached.updatedAt) < ttl) return respond(cached.payload, company.annualBusiness);

    refreshClaimed = await claimRuntimeRefresh(key, 30_000);
    if (!refreshClaimed && cached) return respond(cached.payload, company.annualBusiness);

    // Keep source timestamps on fallback data; a successful cache write is not a source refresh.
    const result = mergeFinancialRefresh(await fetchCompanyFinancials(company), cached?.payload.data);
    try { await writeRuntimeSnapshot(key, result); }
    catch { console.warn(JSON.stringify({ event: "financial_cache_write_failed", code })); }
    return respond(result, company.annualBusiness);
  } catch {
    return Response.json({ error: "financials_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  } finally {
    if (refreshClaimed) {
      try { await releaseRuntimeRefresh(key); }
      catch { console.warn(JSON.stringify({ event: "financial_refresh_lock_release_failed", code })); }
    }
  }
}

function respond(record: FinancialCacheRecord, profile: Awaited<ReturnType<typeof getCompanyRecord>>["annualBusiness"]) {
  const data = assessFinancialCompleteness(applyFinancialHistory(record.data));
  const staleSections = financialStaleSections({ ...record, data });
  const businessStale = profile ? false : record.businessStale ?? (record.stale && staleSections.length === 0);
  const stale = staleSections.length > 0 || businessStale;
  const business = profile ? {
    text: profile.summary, textEn: profile.summaryEn, sourceUrl: profile.sourceUrl, fetchedAt: profile.reviewedAt,
    reportYear: profile.reportYear, reportTitle: profile.reportTitle, publishedAt: profile.publishedAt,
    sourceType: profile.sourceType, mappings: profile.mappings,
  } : data.business;
  const payload: FinancialResponse = { ...data, business, stale, staleSections, window: financialWindow() };
  return Response.json(payload, { headers: { "cache-control": "public, max-age=60", "x-financial-snapshot": staleSections.length ? "stale" : "current" } });
}
