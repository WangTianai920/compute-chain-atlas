import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { parseAnnualBusiness } from "../lib/company-annual-business.ts";
import {
  annualBusinessEnglishNonBusinessPattern,
  annualBusinessFigureArtifactPattern,
  annualBusinessNonBusinessPattern,
  cleanAnnualBusinessSection,
  cleanAnnualBusinessSummary,
  formatAnnualBusinessSummary,
} from "../lib/annual-business-text.mjs";
import { applyAnnualBusinessProfiles } from "../scripts/apply-annual-business-profiles.mjs";

const catalog = JSON.parse(readFileSync(new URL("../data/research/2026-09-01-annual-business-profiles.json", import.meta.url), "utf8"));

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE companies(id INTEGER PRIMARY KEY,code TEXT UNIQUE,name TEXT,active INTEGER DEFAULT 1);
    CREATE TABLE sectors(id INTEGER PRIMARY KEY,slug TEXT UNIQUE);
    CREATE TABLE company_sectors(id INTEGER PRIMARY KEY,company_id INTEGER REFERENCES companies(id),sector_id INTEGER REFERENCES sectors(id));
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);`);
  const slugs = new Set(catalog.companies.flatMap(item => item.mappings.map(mapping => mapping.sectorSlug)));
  for (const slug of slugs) db.prepare("INSERT INTO sectors(slug) VALUES(?)").run(slug);
  for (const company of catalog.companies) {
    const id = db.prepare("INSERT INTO companies(code,name) VALUES(?,?)").run(company.code, company.name).lastInsertRowid;
    for (const mapping of company.mappings) db.prepare("INSERT INTO company_sectors(company_id,sector_id) SELECT ?,id FROM sectors WHERE slug=?").run(id, mapping.sectorSlug);
  }
  return db;
}

test("133家公司均有完整披露来源，产业映射在主营业务内全覆盖", () => {
  assert.equal(catalog.companies.length, 133);
  assert.equal(catalog.companies.reduce((sum, item) => sum + item.mappings.length, 0), 204);
  assert.equal(catalog.companies.filter(item => item.sourceType === "annual_report").length, 132);
  assert.deepEqual(catalog.companies.filter(item => item.sourceType === "prospectus").map(item => item.code), ["688825"]);
  for (const item of catalog.companies) {
    assert.ok(parseAnnualBusiness(JSON.stringify(item)), item.code);
    assert.ok(item.summary.length + item.mappings.reduce((sum, mapping) => sum + mapping.detail.length, 0) >= 110, item.code);
    assert.ok(item.summaryEn.length >= 40 && !/[\p{Script=Han}]/u.test(item.summaryEn), `${item.code}:summaryEn`);
    assert.doesNotMatch(item.summary, annualBusinessFigureArtifactPattern, `${item.code}:summary`);
    assert.doesNotMatch(item.summaryEn, annualBusinessFigureArtifactPattern, `${item.code}:summaryEn`);
    assert.doesNotMatch(item.summary, annualBusinessNonBusinessPattern, `${item.code}:summary non-business`);
    assert.doesNotMatch(item.summaryEn, annualBusinessEnglishNonBusinessPattern, `${item.code}:summaryEn non-business`);
    assert.doesNotMatch(item.summary, /产业链跟踪重点|(?:算力|计算力)产业链重点包括/u, `${item.code}:tracking focus`);
    assert.doesNotMatch(item.summaryEn, /industry-chain tracking focus|focus of (?:the )?(?:industrial|industry) chain tracking/iu, `${item.code}:English tracking focus`);
    for (const mapping of item.mappings) assert.ok(mapping.detailEn.length >= 20 && !/[\p{Script=Han}]/u.test(mapping.detailEn), `${item.code}:${mapping.sectorSlug}:detailEn`);
  }
});

test("控制权、治理、沿革、宣传、财务表现和产业链跟踪重点均被剔除", () => {
  const source = "根据2025年年度报告，公司是一家以数据中心高效冷却技术为核心的数据中心基础设施产品供应商，主营业务为浸没液冷、冷板液冷及模块化数据中心产品的研发、生产和销售。公司接到控股股东通知，实际控制人变更为无实际控制人。公司拥有完善的法人治理结构，本次变化不影响公司的生产经营和持续发展。产业链跟踪重点为：液冷温控设备出货量位居国内前列。";
  const cleaned = formatAnnualBusinessSummary(source, { focus: "液冷温控设备出货量位居国内前列" });
  assert.equal(cleaned, "根据2025年年度报告，公司是一家以数据中心高效冷却技术为核心的数据中心基础设施产品供应商，主营业务为浸没液冷、冷板液冷及模块化数据中心产品的研发、生产和销售。");
  assert.doesNotMatch(cleaned, /控股股东|实际控制人|法人治理|不影响公司的生产经营/u);

  const english = "According to the 2025 annual report, the company develops and sells immersion and cold-plate liquid-cooling products. The controlling shareholder notified the company that it would have no actual controller. Industry-chain tracking focus: liquid-cooling equipment shipments rank among the domestic leaders.";
  assert.equal(formatAnnualBusinessSummary(english, { locale: "en", focus: "Liquid-cooling equipment shipments rank among the domestic leaders" }), "According to the 2025 annual report, the company develops and sells immersion and cold-plate liquid-cooling products.");
});

test("年报图注与无配图引用被清理，正常业务用语保留", () => {
  const source = `公司从事图形渲染和图像处理业务。

图：协
创数据 AI 商业 SaaS 架构图

图：存储全自动生产线
3.服务器及周边再制造
公司持续推进再制造业务。产品特性如下图所示： 公司已形成规模化 GPU 算力。`;
  const cleaned = cleanAnnualBusinessSection(source);
  assert.doesNotMatch(cleaned, annualBusinessFigureArtifactPattern);
  assert.match(cleaned, /图形渲染和图像处理/);
  assert.match(cleaned, /服务器及周边再制造/);
  assert.match(cleaned, /规模化 GPU 算力/);
  assert.doesNotMatch(cleaned, /协创数据 AI 商业 SaaS 架构图/);

  const flattened = "公司提供图形渲染服务。图：协创数据 AI 商业 SaaS 架构图 3.服务器及周边再制造业务保持增长。";
  assert.equal(cleanAnnualBusinessSummary(flattened), "公司提供图形渲染服务。服务器及周边再制造业务保持增长。");
  const english = "The company provides integrated products, as shown in the figure below: Figure 1: Platform architecture company's products serve data centers.";
  assert.equal(cleanAnnualBusinessSummary(english), "The company provides integrated products. The company's products serve data centers.");
});

test("本地导入可预演、回滚并幂等更新，不改公司和产业映射", () => {
  const db = fixture();
  try {
    const companies = db.prepare("SELECT * FROM companies ORDER BY code").all();
    const mappings = db.prepare("SELECT * FROM company_sectors ORDER BY id").all();
    const preview = applyAnnualBusinessProfiles(db, catalog);
    assert.equal(preview.after, 133);
    assert.equal(db.prepare("SELECT count(*) n FROM app_meta").get().n, 0);
    const result = applyAnnualBusinessProfiles(db, catalog, { dryRun: false });
    assert.equal(result.after, 133);
    assert.deepEqual(db.prepare("SELECT * FROM companies ORDER BY code").all(), companies);
    assert.deepEqual(db.prepare("SELECT * FROM company_sectors ORDER BY id").all(), mappings);
    assert.equal(applyAnnualBusinessProfiles(db, catalog, { dryRun: false }).after, 133);
  } finally { db.close(); }
});
