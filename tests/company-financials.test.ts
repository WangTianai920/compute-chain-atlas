import assert from "node:assert/strict";
import test from "node:test";
import { applyFinancialHistory, assessFinancialCompleteness, buildFinancialPeriods, fetchCompanyFinancials, financialCacheTtl, financialGrowth, financialNumber, financialSourceUrl, financialStaleSections, financialWindow, mergeFinancialRefresh, normalizeCompanyFinancials, type CninfoSources, type FinancialReport } from "../lib/company-financials.ts";

const company = { code: "603629", name: "利通电子", exchange: "SH" };
const now = new Date("2026-08-31T03:00:00Z"), window = financialWindow(now);
const sources = (): CninfoSources => ({
  info: [{ SECCODE: company.code, SECNAME: company.name, F002N: 1 }],
  introduction: [{ basicInformation: [{ ASECCODE: company.code, ASECNAME: company.name, F015V: "  精密金属结构件\n设计、生产、销售。 " }] }],
  income: [{ middle: [{ index: "营业总收入", 2026: 210115.03, 2025: 151625.33 }, { index: "归属母公司净利润", 2026: 70241.39, 2025: 5107.92 }, { index: "营业利润", 2026: 85325.91 }, { index: "营业总成本", 2026: 136078.87 }] }],
  indicators: [{ middle: [{ ENDDATE: "2026-06-30", F011N: 40.609, F017N: 33.43, F078N: 46.6, F067N: 29.83, F041N: 68.245 }] }],
  cashflow: [{ middle: [{ index: "经营活动产生的现金流量净额", 2026: 257321.91 }] }],
  balance: [{ middle: [{ index: "货币资金", 2026: 254662.14 }, { index: "总资产", 2026: 832145.38 }, { index: "总负债", 2026: 567894.96 }] }],
});
const normalize = (input = sources(), at = now) => normalizeCompanyFinancials(company, input, at);
function report(endDate: string, revenue: number | null, profit: number | null, extra: Partial<FinancialReport> = {}): FinancialReport {
  return { ...normalize().reports[0], endDate, revenue, parentNetProfit: profit, ...extra };
}
const cycle = () => [report("2025-03-31", 100, -10, { operatingCashFlow: -30 }), report("2025-06-30", 230, -4, { operatingCashFlow: 20 }), report("2025-09-30", 410, 20, { operatingCashFlow: 50 }), report("2025-12-31", 700, 50, { operatingCashFlow: 100 })];

test("display includes all of 2023 and respects Shanghai midnight", () => {
  assert.deepEqual(window, { from: "2023-01-01", to: "2026-08-31" });
  assert.equal(financialWindow(new Date("2026-08-31T17:00:00Z")).to, "2026-09-01");
  assert.equal(financialWindow(new Date("2024-02-29T00:00:00Z")).from, "2023-01-01");
});
test("CNINFO sample amounts convert ten-thousand CNY into CNY; ratios are not scaled", () => {
  const data = normalize(), row = data.reports[0];
  assert.equal(data.provider, "cninfo"); assert.deepEqual(data.issues, []);
  assert.equal(row.revenue, 2101150300); assert.equal(row.parentNetProfit, 702413900);
  assert.equal(row.operatingCashFlow, 2573219100); assert.equal(row.cash, 2546621400);
  assert.equal(row.totalAssets, 8321453800); assert.equal(row.totalLiabilities, 5678949600);
  assert.equal(row.operatingMargin, 40.609); assert.equal(row.netMargin, 33.43);
  assert.equal(row.grossMargin, 46.6); assert.equal(row.weightedRoe, 29.83); assert.equal(row.debtRatio, 68.245);
  assert.equal(data.business?.text, "精密金属结构件 设计、生产、销售。");
  assert.ok(Object.values(row.sourceUrls).every(url => new URL(url!).hostname === "www.cninfo.com.cn"));
});
test("missing or invalid values never become zero and losses are retained", () => {
  for (const value of [null, undefined, "", " ", "--", "NaN", NaN, Infinity, true, "1,200", "1亿元"]) assert.equal(financialNumber(value), null);
  assert.equal(financialNumber(0), 0); assert.equal(financialNumber("-10.52"), -10.52);
  const input = sources(); input.income = [{ middle: [{ index: "营业总收入", 2026: null }, { index: "归属母公司净利润", 2026: -2 }] }];
  assert.equal(normalize(input).reports[0].revenue, null); assert.equal(normalize(input).reports[0].parentNetProfit, -20000);
});
test("summary total operating cost never substitutes for cost of sales or gross margin", () => {
  const input = sources(); input.indicators = [];
  const row = normalize(input).reports[0]; assert.equal(row.grossMargin, null); assert.equal(row.netMargin, null);
});
test("quarterly flows reconcile to annual totals and preserve signs", () => {
  const rows = buildFinancialPeriods(cycle(), "quarter", window);
  assert.deepEqual(rows.map(r => [r.period, r.revenue, r.parentNetProfit, r.operatingCashFlow]), [["Q4",290,30,50],["Q3",180,24,30],["Q2",130,6,50],["Q1",100,-10,-30]]);
  assert.equal(rows.reduce((s,r) => s+r.revenue!,0),700);
  assert.equal(rows.reduce((s,r) => s+r.operatingCashFlow!,0),100);
  assert.equal(rows[0].startDate,"2025-10-01");
});
test("H2 subtracts H1, not Q3; annual and YTD remain cumulative", () => {
  const rows = buildFinancialPeriods(cycle(), "half", window);
  assert.deepEqual(rows.map(r => [r.period,r.revenue,r.parentNetProfit,r.operatingCashFlow]),[["H2",470,54,80],["H1",230,-4,20]]);
  assert.equal(buildFinancialPeriods(cycle(),"annual",window)[0].revenue,700);
  assert.equal(buildFinancialPeriods(cycle(),"cumulative",window).find(r=>r.period==="9M")?.revenue,410);
});
test("never subtract across years or absent adjacent periods", () => {
  const rows=buildFinancialPeriods([report("2024-12-31",700,50),report("2025-06-30",230,-4)],"quarter",window);
  assert.equal(rows[0].revenue,null);assert.equal(rows[0].incomplete,true);assert.equal(rows[0].operatingCashFlow,null);
});
test("missing one flow input does not erase other valid quarterly flows", () => {
  const rows=buildFinancialPeriods([report("2025-03-31",100,null),report("2025-06-30",230,20)],"quarter",window);
  assert.equal(rows[0].revenue,130); assert.equal(rows[0].parentNetProfit,null);
});
test("period-end stocks and debt ratio are never differenced", () => {
  const rows=buildFinancialPeriods([report("2025-03-31",100,10,{cash:30,totalAssets:200,debtRatio:40}),report("2025-06-30",230,20,{cash:50,totalAssets:220,debtRatio:35})],"quarter",window);
  assert.equal(rows[0].cash,50);assert.equal(rows[0].totalAssets,220);assert.equal(rows[0].debtRatio,35);
});
test("derive only operating margin from amounts; do not reconstruct other ratios", () => {
  const reports=[report("2025-03-31",100,10,{operatingProfit:10}),report("2025-06-30",300,20,{operatingProfit:50})];
  const row=buildFinancialPeriods(reports,"quarter",window)[0];
  assert.equal(row.operatingMargin,20);assert.equal(row.netMargin,null);assert.equal(row.grossMargin,null);assert.equal(row.weightedRoe,null);
  assert.equal(buildFinancialPeriods(reports,"cumulative",window)[0].netMargin,33.43);
  assert.equal(buildFinancialPeriods(reports,"half",window)[0].weightedRoe,29.83);
});
test("nonpositive derived revenue does not produce an operating margin", () => {
  for(const rev of [100,80,null]) {
    const rows=buildFinancialPeriods([report("2025-03-31",100,10),report("2025-06-30",rev,20)],"quarter",window);
    assert.equal(rows[0].operatingMargin,null);
  }
});
test("YoY compares the same reporting basis, including comparison periods outside window", () => {
  const input=sources();input.income=[{three:[{index:"营业总收入",2023:350,2022:250}],middle:[{index:"营业总收入",2023:200,2022:150}]}];
  const reports=normalize(input).reports;
  const row=buildFinancialPeriods(reports,"quarter",window).find(r=>r.endDate==="2023-09-30")!;
  assert.equal(row.revenue,1500000); assert.equal(row.revenueGrowth.percent,50);
  assert.equal(buildFinancialPeriods(reports,"cumulative",window).find(r=>r.endDate==="2023-09-30")?.revenueGrowth.percent,40);
  assert.ok(buildFinancialPeriods(reports,"quarter",window).every(r=>r.endDate>=window.from));
});
test("loss and zero-base comparisons use honest labels rather than misleading percentages", () => {
  for(const [current,prior,status] of [[10,-5,"turn_profit"],[-10,5,"turn_loss"],[-5,-10,"loss_narrowed"],[-20,-10,"loss_widened"],[-10,-10,"unchanged"],[5,0,"zero_base"],[0,0,"unchanged"],[null,5,"missing"]] as const) {
    assert.deepEqual(financialGrowth(current,prior),{percent:null,status});
  }
  assert.deepEqual(financialGrowth(120,100),{percent:20,status:"normal"});
});
test("future and malformed reporting dates are excluded", () => {
  const input=sources();input.indicators=[{middle:[{ENDDATE:"2026-06-31",F011N:5}],three:[{ENDDATE:"2026-09-30",F011N:5}]}];
  input.income=[{three:[{index:"营业总收入",2026:500}]}];
  const data=normalize(input);assert.ok(data.issues.includes("invalid_records"));assert.ok(data.reports.every(r=>r.endDate<=window.to));
});
test("mismatched identity excludes financial data, but does not erase independent verified profile", () => {
  const input=sources();input.info=[{SECCODE:"300308",SECNAME:company.name,F002N:1}];
  const data=normalize(input);assert.equal(data.reports.length,0);assert.ok(data.issues.includes("identity_mismatch"));assert.ok(data.business);
});
test("unavailable identity is not mislabeled as a company mismatch", () => {
  const input=sources();input.info=[];
  const data=normalize(input);assert.equal(data.reports.length,0);
  assert.ok(data.issues.includes("identity_unavailable"));assert.ok(!data.issues.includes("identity_mismatch"));
});
test("renamed company requires exact same-code former-name evidence", () => {
  const input=sources();input.info[0].SECNAME="新简称";
  input.introduction=[{basicInformation:[{ASECCODE:company.code,ASECNAME:"新简称",F002V:company.name,F015V:"主营介绍"}]}];
  assert.equal(normalize(input).sourceCompanyName,"新简称");assert.ok(normalize(input).reports.length);
  input.introduction=[{basicInformation:[{ASECCODE:company.code,ASECNAME:"新简称",F002V:company.name+"科技"}]}];
  assert.equal(normalize(input).reports.length,0);
});
test("URL restricts codes and uses returned company classification", () => {
  assert.throws(()=>financialSourceUrl('603629&scode=300308',"income",1));assert.throws(()=>financialSourceUrl(company.code,"income"));
  assert.equal(new URL(financialSourceUrl(company.code,"income",2)).searchParams.get("sign"),"2");
});
function fakeFetch(input: CninfoSources, failure?: string): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const path=new URL(String(url)).pathname;
    const key=path.endsWith("getCompanyInfo")?"info":path.endsWith("getCompanyIntroduction")?"introduction":path.endsWith("getIncomeStatement")?"income":path.endsWith("getMainIndicators")?"indicators":path.endsWith("getCashFlowStatement")?"cashflow":"balance";
    if(key===failure) return new Response("down",{status:503});
    return Response.json({code:200,data:{resultMsg:"success",records:input[key]},params:{stockCodeRequest:{scode:company.code}}});
  }) as typeof fetch;
}
test("one failed upstream section does not prevent other sections loading",async()=>{
  const data=await fetchCompanyFinancials(company,{fetchImpl:fakeFetch(sources(),"cashflow"),now});
  assert.equal(data.reports[0].operatingCashFlow,null);assert.equal(data.reports[0].cash,2546621400);assert.deepEqual(data.issues,["cashflow_unavailable","latest_period_incomplete"]);
});
test("temporary financial-section failure is retried before using saved data",async()=>{
  let cashflowAttempts=0;
  const input=sources();
  const fetchImpl=(async(url:RequestInfo|URL)=>{
    const path=new URL(String(url)).pathname;
    const key=path.endsWith("getCompanyInfo")?"info":path.endsWith("getCompanyIntroduction")?"introduction":path.endsWith("getIncomeStatement")?"income":path.endsWith("getMainIndicators")?"indicators":path.endsWith("getCashFlowStatement")?"cashflow":"balance";
    if(key==="cashflow"&&++cashflowAttempts===1)return new Response("down",{status:503});
    return Response.json({code:200,data:{resultMsg:"success",records:input[key]},params:{stockCodeRequest:{scode:company.code}}});
  }) as typeof fetch;
  const data=await fetchCompanyFinancials(company,{fetchImpl,now});
  assert.equal(cashflowAttempts,2);assert.deepEqual(data.issues,[]);assert.notEqual(data.reports[0].operatingCashFlow,null);
});
test("temporary identity request failure is retried before declaring it unavailable",async()=>{
  let infoAttempts=0;
  const input=sources();
  const fetchImpl=(async(url:RequestInfo|URL)=>{
    const path=new URL(String(url)).pathname;
    if(path.endsWith("getCompanyInfo")&&++infoAttempts===1)return new Response("down",{status:503});
    const key=path.endsWith("getCompanyInfo")?"info":path.endsWith("getCompanyIntroduction")?"introduction":path.endsWith("getIncomeStatement")?"income":path.endsWith("getMainIndicators")?"indicators":path.endsWith("getCashFlowStatement")?"cashflow":"balance";
    return Response.json({code:200,data:{resultMsg:"success",records:input[key]},params:{stockCodeRequest:{scode:company.code}}});
  }) as typeof fetch;
  const data=await fetchCompanyFinancials(company,{fetchImpl,now});
  assert.equal(infoAttempts,2);assert.ok(data.reports.length>0);assert.deepEqual(data.issues,[]);
});
test("persistent identity request failure stays unavailable after one retry",async()=>{
  const data=await fetchCompanyFinancials(company,{fetchImpl:fakeFetch(sources(),"info"),now});
  assert.equal(data.reports.length,0);assert.ok(data.issues.includes("identity_unavailable"));assert.ok(!data.issues.includes("identity_mismatch"));
});
test("invalid JSON, logical errors, malformed rows and oversized responses fail safely",async()=>{
  for(const body of ["not json",JSON.stringify({code:200,data:{resultMsg:"failure",records:[]}}),JSON.stringify({code:200,data:{resultMsg:"success",records:[null]}}),"x".repeat(1_000_001)]) {
    const data=await fetchCompanyFinancials(company,{fetchImpl:(async()=>new Response(body)) as typeof fetch,now});
    assert.equal(data.reports.length,0);assert.equal(data.business,null);
  }
});
test("response metadata cannot silently change the requested company",async()=>{
  const data=await fetchCompanyFinancials(company,{fetchImpl:(async()=>Response.json({code:200,data:{resultMsg:"success",records:sources().info},params:{stockCodeRequest:{scode:"300308"}}})) as typeof fetch,now});
  assert.equal(data.reports.length,0);
});
test("partial refresh preserves only failed section and its original timestamp",()=>{
  const old=normalize(sources(),new Date("2026-08-30T00:00:00Z"));
  const input=sources();input.cashflow=[];const fresh=normalize(input);
  const merged=mergeFinancialRefresh(fresh,old);
  assert.equal(merged.stale,true);assert.equal(merged.data.reports[0].operatingCashFlow,old.reports[0].operatingCashFlow);
  assert.deepEqual(merged.staleSections,["cashflow"]);assert.deepEqual(financialStaleSections(merged),["cashflow"]);
  assert.equal(merged.data.sectionFetchedAt.cashflow,old.fetchedAt);assert.equal(merged.data.sectionFetchedAt.income,now.toISOString());
  assert.equal(merged.data.fetchedAt,old.fetchedAt);assert.equal(fresh.reports[0].operatingCashFlow,null);
  assert.equal(mergeFinancialRefresh(normalize(),merged.data).stale,false);
});
test("business fallback is tracked separately from financial-section fallback",()=>{
  const old=normalize();const input=sources();input.introduction=[];
  const merged=mergeFinancialRefresh(normalize(input),old);
  assert.equal(merged.businessStale,true);assert.deepEqual(merged.staleSections,[]);assert.deepEqual(financialStaleSections(merged),[]);
});
test("cache never crosses company or provider and never imputes individual missing fields",()=>{
  const old=normalize(); const empty=normalize({...sources(),income:[],indicators:[],cashflow:[],balance:[]});
  assert.equal(mergeFinancialRefresh(empty,{...old,code:"300308"}).data.reports.length,0);
  assert.equal(mergeFinancialRefresh(empty,{...old,provider:"eastmoney"} as unknown as typeof old).data.reports.length,0);
  const input=sources();input.income=[{middle:[{index:"营业总收入",2026:100}]}];
  const merged=mergeFinancialRefresh(normalize(input),old);assert.equal(merged.data.reports[0].parentNetProfit,null);
});
test("latest-period gaps use a short cache while complete data keeps the normal cache",()=>{
  const complete=normalize();
  assert.equal(financialCacheTtl({data:complete,stale:false}),6*60*60_000);
  const partial=assessFinancialCompleteness({...complete,reports:[{...complete.reports[0],cash:null}]});
  assert.ok(partial.issues.includes("latest_period_incomplete"));
  assert.equal(financialCacheTtl({data:partial,stale:false}),5*60_000);
  assert.equal(financialCacheTtl({data:complete,stale:true}),5*60_000);
  assert.ok(!assessFinancialCompleteness(complete).issues.includes("latest_period_incomplete"));
});


test("2023 Q1, Q2 and H1 are included by default and remain available in later years", () => {
  const reports = [report("2023-03-31", 100, 10), report("2023-06-30", 250, 35)];
  for (const at of [now, new Date("2027-09-01T00:00:00Z")]) {
    const rows = buildFinancialPeriods(reports, "quarter", financialWindow(at));
    assert.deepEqual(rows.map(row => [row.period, row.revenue, row.parentNetProfit]), [["Q2", 150, 25], ["Q1", 100, 10]]);
    assert.equal(buildFinancialPeriods(reports, "half", financialWindow(at))[0].revenue, 250);
  }
});
test("verified annual-report quarters backfill missing Q1 and reconcile exact Q2 and year totals", () => {
  const data = { ...normalize(), code: "688652", companyName: "京仪装备", reports: [report("2023-12-31", 742283100, 119135500, { operatingCashFlow: 41089400 })] };
  const filled = applyFinancialHistory(data);
  assert.equal(filled.reports.length, 4);
  const quarters = buildFinancialPeriods(filled.reports, "quarter", window);
  assert.equal(quarters.find(row => row.period === "Q1")?.revenue, 181034898.78);
  const q2 = quarters.find(row => row.period === "Q2")!;
  assert.equal(q2.revenue, 249074545.69); assert.equal(q2.parentNetProfit, 53991475.36);
  assert.equal(q2.operatingCashFlow, 157119359.54); assert.equal(q2.revenueBasis, "operating");
  assert.equal(filled.reports[0].filingEvidence?.page, 9);
  assert.equal(data.reports.length, 1);
});
test("historical supplements never overwrite revised figures or cross company identity", () => {
  const data = { ...normalize(), code: "688652", companyName: "京仪装备", reports: [report("2023-12-31", 999999999, 119135500)] };
  assert.equal(applyFinancialHistory(data), data);
  assert.equal(applyFinancialHistory({ ...data, companyName: "另一家公司" }).reports.length, 1);
});
