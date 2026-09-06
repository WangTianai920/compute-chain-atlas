import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { applyResearchExpansion, validateCatalog } from "../scripts/apply-research-expansion.mjs";
import { parseCompanyResearch } from "../lib/company-research.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/research/2026-08-31-expansion.json", import.meta.url), "utf8"));
const symbols = JSON.parse(readFileSync(new URL("../docs/research/2026-08-31-symbol-check.json", import.meta.url), "utf8"));

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE sectors(id INTEGER PRIMARY KEY,slug TEXT UNIQUE,active INTEGER DEFAULT 1);
    CREATE TABLE companies(id INTEGER PRIMARY KEY,code TEXT UNIQUE,name TEXT,exchange TEXT,thesis TEXT,active INTEGER DEFAULT 1);
    CREATE TABLE company_sectors(id INTEGER PRIMARY KEY,company_id INTEGER REFERENCES companies(id),sector_id INTEGER REFERENCES sectors(id),role TEXT,rationale TEXT,sort_order INTEGER,UNIQUE(company_id,sector_id));
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE runtime_snapshots(cache_key TEXT PRIMARY KEY,payload TEXT);
    INSERT INTO runtime_snapshots VALUES ('market:overview:v1','old'),('market:news:v1','saved news'),('company:history:600000','saved prices'),('company:financials:600000','saved financials');`);
  for (const slug of new Set(catalog.companies.map(item => item.sector))) db.prepare("INSERT INTO sectors(slug) VALUES (?)").run(slug);
  return db;
}

test("新增清单代码及现名与独立行情核对一致，来源可解析，全部候选", () => {
  assert.equal(catalog.companies.length, 50);
  const names = new Map(symbols.map(item => [item.code, item.name]));
  assert.equal(names.size, catalog.companies.length);
  for (const company of catalog.companies) {
    assert.equal(company.name, names.get(company.code));
    assert.equal(company.role, "candidate");
    assert.ok(parseCompanyResearch(JSON.stringify(company)));
  }
  assert.deepEqual(catalog.companies.find(item => item.code === "300548").aliases, ["博创科技"]);
});

test("预演回滚全部数据；正式导入仅清理成员相关缓存", () => {
  const db = fixture();
  try {
    const preview = applyResearchExpansion(db, catalog);
    assert.equal(preview.after.companies, 50);
    assert.equal(db.prepare("SELECT count(*) n FROM companies").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM app_meta").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM runtime_snapshots").get().n, 4);
    const result = applyResearchExpansion(db, catalog, { dryRun: false });
    assert.equal(result.added.length, 50);
    assert.equal(result.after.mappings, 50);
    assert.equal(db.prepare("SELECT count(*) n FROM app_meta").get().n, 50);
    assert.deepEqual(db.prepare("SELECT payload FROM runtime_snapshots ORDER BY cache_key").all().map(row => row.payload), ["saved financials", "saved prices", "saved news"]);
  } finally { db.close(); }
});

test("重复导入保留人工修改、评级、停用状态及映射", () => {
  const db = fixture();
  try {
    applyResearchExpansion(db, catalog, { dryRun: false });
    db.exec("UPDATE companies SET name='人工修改',thesis='保留判断',active=0 WHERE code='300458'; UPDATE company_sectors SET role='core',rationale='人工评级' WHERE company_id=(SELECT id FROM companies WHERE code='300458');");
    const before = db.prepare("SELECT * FROM companies ORDER BY id").all();
    const mappings = db.prepare("SELECT * FROM company_sectors ORDER BY id").all();
    const result = applyResearchExpansion(db, catalog, { dryRun: false });
    assert.equal(result.added.length, 0);
    assert.equal(result.skipped.length, 50);
    assert.deepEqual(db.prepare("SELECT * FROM companies ORDER BY id").all(), before);
    assert.deepEqual(db.prepare("SELECT * FROM company_sectors ORDER BY id").all(), mappings);
  } finally { db.close(); }
});

test("中途写入失败时整批回滚，不留下无来源公司", () => {
  const db = fixture();
  try {
    db.exec("CREATE TRIGGER fail_source BEFORE INSERT ON app_meta WHEN NEW.key='company-research:688521' BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
    assert.throws(() => applyResearchExpansion(db, catalog, { dryRun: false }), /injected failure/);
    for (const table of ["companies", "company_sectors", "app_meta"]) assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM runtime_snapshots").get().n, 4);
  } finally { db.close(); }
});

test("拒绝重复代码、未知方向、无来源和非 HTTPS 链接", () => {
  const sectors = new Map(catalog.companies.map(item => [item.sector, 1]));
  const bad = mutate => { const copy = structuredClone(catalog); mutate(copy); return copy; };
  assert.throws(() => validateCatalog(bad(copy => copy.companies.push(copy.companies[0])), sectors), /duplicate/);
  assert.throws(() => validateCatalog(bad(copy => copy.companies[0].sector = "unknown"), sectors), /sector/);
  assert.throws(() => validateCatalog(bad(copy => copy.companies[0].sources = []), sectors), /source/);
  assert.throws(() => validateCatalog(bad(copy => copy.companies[0].sources[0].url = "javascript:alert(1)"), sectors), /Unsafe/);
  assert.equal(parseCompanyResearch("invalid JSON"), null);
  assert.equal(parseCompanyResearch(JSON.stringify(bad(copy => copy.companies[0].sources[0].url = "javascript:alert(1)").companies[0])), null);
});
