import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { applyCrossSectorReview, validateCrossSectorReview } from "../scripts/apply-cross-sector-review.mjs";
import { parseCompanyResearch } from "../lib/company-research.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/research/2026-08-31-cross-sector-review.json", import.meta.url), "utf8"));
const profiles = JSON.parse(readFileSync(new URL("../docs/research/2026-08-31-all-company-business-check.json", import.meta.url), "utf8"));

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE sectors(id INTEGER PRIMARY KEY,slug TEXT UNIQUE,active INTEGER DEFAULT 1);
    CREATE TABLE companies(id INTEGER PRIMARY KEY,code TEXT UNIQUE,name TEXT,thesis TEXT,active INTEGER DEFAULT 1);
    CREATE TABLE company_sectors(id INTEGER PRIMARY KEY,company_id INTEGER REFERENCES companies(id),sector_id INTEGER REFERENCES sectors(id),role TEXT,rationale TEXT,sort_order INTEGER,UNIQUE(company_id,sector_id));
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE runtime_snapshots(cache_key TEXT PRIMARY KEY,payload TEXT);
    INSERT INTO app_meta VALUES ('seed_version','4'),('manual-note','keep');
    INSERT INTO runtime_snapshots VALUES ('market:overview:v1','old'),('market:signals:v1','old'),('market:news:v1','saved news'),('company:history:600000','saved prices'),('company:financials:600000','saved financials');`);
  const slugs = new Set(catalog.companyAudit.flatMap(item => [...item.existingSectors, ...item.additionalSectors]));
  for (const slug of slugs) db.prepare("INSERT INTO sectors(slug) VALUES (?)").run(slug);
  for (const item of catalog.companyAudit) {
    const id = db.prepare("INSERT INTO companies(code,name,thesis) VALUES (?,?,?)").run(item.code, item.name, "人工业务描述").lastInsertRowid;
    for (const slug of item.existingSectors) db.prepare("INSERT INTO company_sectors(company_id,sector_id,role,rationale,sort_order) SELECT ?,id,'core','人工评级',1 FROM sectors WHERE slug=?").run(id, slug);
  }
  return db;
}

test("全部133家有独立主营简介筛查，逐条映射可解析且有业务、阶段、边界与来源", () => {
  const expected = profiles.map(item => item.code).sort();
  assert.equal(expected.length, 133);
  assert.ok(profiles.every(item => item.status === "retrieved" && item.business));
  assert.deepEqual(catalog.companyAudit.map(item => item.code).sort(), expected);
  assert.equal(catalog.companyAudit.reduce((n, item) => n + item.existingSectors.length, 0), 135);
  for (const item of catalog.mappings) assert.ok(parseCompanyResearch(JSON.stringify(item)));
  assert.ok(catalog.companyAudit.find(item => item.code === "300017").deferred.some(item => item.sector === "cooling"));
  assert.ok(!catalog.mappings.some(item => item.code === "300017" && item.sector === "cooling"));
});

test("预演全部回滚；导入保留公司、原评级、种子版本、新闻与历史缓存", () => {
  const db = fixture();
  try {
    const companies = db.prepare("SELECT * FROM companies ORDER BY id").all();
    const oldMappings = db.prepare("SELECT * FROM company_sectors ORDER BY id").all();
    const preview = applyCrossSectorReview(db, catalog);
    assert.equal(preview.after.mappings, 135 + catalog.mappings.length);
    assert.deepEqual(db.prepare("SELECT * FROM company_sectors ORDER BY id").all(), oldMappings);
    assert.equal(db.prepare("SELECT count(*) n FROM app_meta").get().n, 2);
    assert.equal(db.prepare("SELECT count(*) n FROM runtime_snapshots").get().n, 5);
    const result = applyCrossSectorReview(db, catalog, { dryRun: false });
    assert.equal(result.added.length, catalog.mappings.length);
    assert.equal(result.after.companies, 133);
    assert.deepEqual(db.prepare("SELECT * FROM companies ORDER BY id").all(), companies);
    assert.deepEqual(db.prepare("SELECT * FROM company_sectors WHERE id<=135 ORDER BY id").all(), oldMappings);
    assert.ok(db.prepare("SELECT role FROM company_sectors WHERE id>135").all().every(item => item.role === "candidate"));
    assert.equal(db.prepare("SELECT value FROM app_meta WHERE key='seed_version'").get().value, "4");
    assert.deepEqual(db.prepare("SELECT payload FROM runtime_snapshots ORDER BY cache_key").all().map(item => item.payload), ["saved financials", "saved prices", "saved news"]);
  } finally { db.close(); }
});

test("重复导入保留人工修改和现有映射，不复活停用公司", () => {
  const db = fixture();
  try {
    const inactiveCode = catalog.mappings[0].code;
    db.prepare("UPDATE companies SET active=0 WHERE code=?").run(inactiveCode);
    const result = applyCrossSectorReview(db, catalog, { dryRun: false });
    assert.ok(result.skipped.some(item => item.reason === "inactive company"));
    db.exec("UPDATE company_sectors SET role='core',rationale='人工再评级' WHERE id>135; UPDATE companies SET thesis='人工新描述';");
    const before = db.prepare("SELECT * FROM company_sectors ORDER BY id").all();
    const repeat = applyCrossSectorReview(db, catalog, { dryRun: false });
    assert.equal(repeat.added.length, 0);
    assert.deepEqual(db.prepare("SELECT * FROM company_sectors ORDER BY id").all(), before);
    assert.equal(db.prepare("SELECT active FROM companies WHERE code=?").get(inactiveCode).active, 0);
  } finally { db.close(); }
});

test("来源写入失败回滚整批映射和缓存清理", () => {
  const db = fixture();
  try {
    const item = catalog.mappings[3];
    db.exec(`CREATE TRIGGER fail_source BEFORE INSERT ON app_meta WHEN NEW.key='company-mapping-research:${item.code}:${item.sector}' BEGIN SELECT RAISE(ABORT,'injected failure'); END;`);
    assert.throws(() => applyCrossSectorReview(db, catalog, { dryRun: false }), /injected failure/);
    assert.equal(db.prepare("SELECT count(*) n FROM company_sectors").get().n, 135);
    assert.equal(db.prepare("SELECT count(*) n FROM app_meta").get().n, 2);
    assert.equal(db.prepare("SELECT count(*) n FROM runtime_snapshots").get().n, 5);
  } finally { db.close(); }
});

test("拒绝未知公司且不留下此前写入的映射", () => {
  const db = fixture();
  try {
    const code = catalog.mappings.at(-1).code;
    db.prepare("DELETE FROM company_sectors WHERE company_id=(SELECT id FROM companies WHERE code=?)").run(code);
    db.prepare("DELETE FROM companies WHERE code=?").run(code);
    const count = db.prepare("SELECT count(*) n FROM company_sectors").get().n;
    assert.throws(() => applyCrossSectorReview(db, catalog, { dryRun: false }), /Unknown existing company/);
    assert.equal(db.prepare("SELECT count(*) n FROM company_sectors").get().n, count);
  } finally { db.close(); }
});

test("拒绝重复映射、无来源、自动继承龙头评级及审计清单未覆盖的映射", () => {
  const sectors = new Map(catalog.companyAudit.flatMap(item => [...item.existingSectors, ...item.additionalSectors]).map(slug => [slug, 1]));
  const bad = mutate => { const value = structuredClone(catalog); mutate(value); return value; };
  validateCrossSectorReview(catalog, sectors);
  assert.throws(() => validateCrossSectorReview(bad(value => value.mappings.push(value.mappings[0])), sectors), /duplicate mapping/);
  assert.throws(() => validateCrossSectorReview(bad(value => value.mappings[0].sources = []), sectors), /Missing source/);
  assert.throws(() => validateCrossSectorReview(bad(value => value.mappings[0].role = "core"), sectors), /Unreviewed/);
  assert.throws(() => validateCrossSectorReview(bad(value => value.companyAudit = []), sectors), /Missing audit/);
  assert.throws(() => validateCrossSectorReview(bad(value => value.mappings.pop()), sectors), /Missing evidence/);
});
