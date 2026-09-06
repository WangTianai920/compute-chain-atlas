import assert from "node:assert/strict";
import test from "node:test";
import { enrichCompanyEnglishData, extractOfficialEnglishName, findLatestAnnualReport, isAnnualReportTitle } from "../lib/company-enrichment.ts";

test("从年度报告公司信息章节提取跨行的官方英文名称", () => {
  const content = `公司的外文名称  FIBERHOME TELECOMMUNICATION\nTECHNOLOGIES Co., Ltd.\n公司的外文名称缩写 FIBERHOME\n公司的法定代表人 曾军`;
  assert.equal(extractOfficialEnglishName(content), "FIBERHOME TELECOMMUNICATION TECHNOLOGIES Co., Ltd.");
});

test("仅选择年度报告全文，排除半年报、摘要和英文版", () => {
  assert.equal(isAnnualReportTitle("公司2025年年度报告"), true);
  assert.equal(isAnnualReportTitle("公司2025年年度报告摘要"), false);
  assert.equal(isAnnualReportTitle("公司2026年半年度报告"), false);
  assert.equal(isAnnualReportTitle("公司2025年年度报告（英文版）"), false);
});

test("按报告年份选择最新年报，不被较晚发布的旧年报更正公告覆盖", async () => {
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async input => {
    const url = String(input); requested.push(url);
    if (url.includes("/api/security/ann")) return Response.json({ data: { list: [
      { art_code: "old-revision", title: "英威腾:2023年年度报告(更正后)", notice_date: "2026-08-21" },
      { art_code: "latest", title: "英威腾:2025年年度报告", notice_date: "2026-04-25" },
    ] } });
    return Response.json({ data: { notice_content: "latest annual report content", attach_url_web: "https://example.com/latest.pdf" } });
  };
  const report = await findLatestAnnualReport("002334", fetchImpl);
  assert.equal(report.reportYear, "2025");
  assert.equal(report.title, "英威腾:2025年年度报告");
  assert.ok(requested.some(url => url.includes("art_code=latest")));
  assert.ok(!requested.some(url => url.includes("art_code=old-revision")));
});

test("自动补全串联官方公告名称与英文入选逻辑", async () => {
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input); requested.push(url);
    if (url.includes("/api/security/ann")) {
      return Response.json({ data: { list: [
        { art_code: "summary", title: "宏昌电子2025年年度报告摘要" },
        { art_code: "annual", title: "宏昌电子2025年年度报告" },
      ] } });
    }
    return Response.json({ data: {
      notice_content: "公司的外文名称 Epoxy Base Electronic Material Corporation Limited\n公司的外文名称缩写 EBE\n公司的法定代表人 林某",
      attach_url_web: "https://example.com/annual-report.pdf",
    } });
  };
  const result = await enrichCompanyEnglishData(
    { code: "603002", name: "宏昌电子", thesis: "电子级环氧树脂与覆铜板供应商。" },
    { fetchImpl, translate: async () => "A supplier of electronic-grade epoxy resin and copper-clad laminates." },
  );
  assert.deepEqual(result, {
    nameEn: "Epoxy Base Electronic Material Corporation Limited",
    thesisEn: "A supplier of electronic-grade epoxy resin and copper-clad laminates.",
    sourceUrl: "https://example.com/annual-report.pdf",
  });
  assert.equal(requested.some((url) => url.includes("art_code=annual")), true);
});

test("缺少可验证英文名称时进入复核，不接受中文回退", async () => {
  const fetchImpl: typeof fetch = async (input) => String(input).includes("/api/security/ann")
    ? Response.json({ data: { list: [{ art_code: "annual", title: "测试公司2025年年度报告" }] } })
    : Response.json({ data: { notice_content: "公司的外文名称 不适用\n公司的外文名称缩写 无\n公司的法定代表人 张某" } });
  await assert.rejects(
    enrichCompanyEnglishData({ code: "600000", name: "测试", thesis: "测试逻辑" }, { fetchImpl, translate: async () => "Test rationale." }),
    /未找到可验证/,
  );
});
