import { DatabaseSync } from "node:sqlite";
import { readFileSync, realpathSync, mkdirSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const catalogPath = new URL("../data/research/2026-08-31-cross-sector-review.json", import.meta.url);

export function validateCrossSectorReview(catalog, sectors) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(catalog?.batch) || !Array.isArray(catalog.mappings) || !catalog.mappings.length || !Array.isArray(catalog.companyAudit)) throw new Error("Invalid review catalog");
  const audit = new Map();
  for (const item of catalog.companyAudit) {
    if (!/^\d{6}$/.test(item.code) || audit.has(item.code) || !item.name?.trim() || !item.reason?.trim()) throw new Error("Invalid or duplicate audited company");
    for (const list of [item.existingSectors, item.additionalSectors]) {
      if (!Array.isArray(list) || new Set(list).size !== list.length || list.some(slug => !sectors.has(slug))) throw new Error(`Invalid audit sectors: ${item.code}`);
    }
    if (!item.existingSectors.length) throw new Error(`Missing original sector: ${item.code}`);
    audit.set(item.code, item);
  }
  const seen = new Set();
  for (const item of catalog.mappings) {
    const key = `${item.code}:${item.sector}`;
    const company = audit.get(item.code);
    if (!company || seen.has(key)) throw new Error(`Missing audit or duplicate mapping: ${key}`);
    if (!sectors.has(item.sector) || company.existingSectors.includes(item.sector) || !company.additionalSectors.includes(item.sector)) throw new Error(`Invalid additional sector: ${key}`);
    seen.add(key);
    if (item.role !== "candidate" || item.reviewedAt !== catalog.batch || item.name !== company.name) throw new Error(`Unreviewed classification: ${key}`);
    for (const field of ["evidence", "risk", "stage"]) if (typeof item[field] !== "string" || !item[field].trim()) throw new Error(`Missing ${field}: ${key}`);
    if (!Array.isArray(item.aliases) || !item.aliases.every(value => typeof value === "string")) throw new Error(`Invalid aliases: ${key}`);
    if (!Array.isArray(item.sources) || !item.sources.length) throw new Error(`Missing source: ${key}`);
    for (const source of item.sources) {
      const url = new URL(source.url);
      if (url.protocol !== "https:" || url.username || url.password || !source.title?.trim()) throw new Error(`Unsafe source: ${key}`);
      if (source.publishedAt !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(source.publishedAt) || source.publishedAt > catalog.batch)) throw new Error(`Invalid source date: ${key}`);
    }
  }
  for (const item of audit.values()) for (const slug of item.additionalSectors) {
    if (!seen.has(`${item.code}:${slug}`)) throw new Error(`Missing evidence for audit mapping: ${item.code}:${slug}`);
  }
}

function counts(db) {
  return {
    companies: db.prepare("SELECT count(*) n FROM companies").get().n,
    mappings: db.prepare("SELECT count(*) n FROM company_sectors").get().n,
    multiSectorCompanies: db.prepare("SELECT count(*) n FROM (SELECT company_id FROM company_sectors GROUP BY company_id HAVING count(*)>1)").get().n,
  };
}

export function applyCrossSectorReview(db, catalog, { dryRun = true } = {}) {
  const sectors = new Map(db.prepare("SELECT slug,id FROM sectors WHERE active=1").all().map(row => [row.slug, row.id]));
  validateCrossSectorReview(catalog, sectors);
  const before = counts(db), added = [], skipped = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    // Only reviewed, existing companies may receive a new edge. Never rewrite
    // the company profile, an existing edge, or its manual rating on re-import.
    for (const [index, item] of catalog.mappings.entries()) {
      const company = db.prepare("SELECT id,active FROM companies WHERE code=?").get(item.code);
      if (!company) throw new Error(`Unknown existing company: ${item.code}`);
      const key = `${item.code}:${item.sector}`;
      if (!company.active) { skipped.push({ key, reason: "inactive company" }); continue; }
      const sectorId = sectors.get(item.sector);
      if (db.prepare("SELECT 1 FROM company_sectors WHERE company_id=? AND sector_id=?").get(company.id, sectorId)) {
        skipped.push({ key, reason: "existing mapping" }); continue;
      }
      const rationale = `核验日期：${item.reviewedAt}。${item.evidence} 业务阶段：${item.stage}。研究边界：${item.risk}`;
      db.prepare("INSERT INTO company_sectors (company_id,sector_id,role,rationale,sort_order) VALUES (?,?,'candidate',?,?)")
        .run(company.id, sectorId, rationale, 2000 + index);
      db.prepare("INSERT INTO app_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING")
        .run(`company-mapping-research:${key}`, JSON.stringify(item));
      added.push(key);
    }
    if (added.length) db.exec("DELETE FROM runtime_snapshots WHERE cache_key LIKE 'market:overview:%' OR cache_key LIKE 'market:signals:%' OR cache_key LIKE 'market:quotes:%' OR cache_key LIKE 'market:full:%'");
    const after = counts(db);
    if (after.companies !== before.companies || after.mappings !== before.mappings + added.length) throw new Error("Unexpected count change");
    if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Foreign-key verification failed");
    db.exec(dryRun ? "ROLLBACK" : "COMMIT");
    return { dryRun, batch: catalog.batch, before, after, added, skipped };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] !== "--local-db" || args.some((arg, i) => i > 1 && arg !== "--apply")) throw new Error("Usage: node scripts/apply-cross-sector-review.mjs --local-db .wrangler/...sqlite [--apply] (default: dry run)");
  const localRoot = realpathSync(resolve(projectRoot, ".wrangler"));
  const databasePath = realpathSync(resolve(projectRoot, args[1]));
  const withinRoot = relative(localRoot, databasePath);
  if (!withinRoot || withinRoot === ".." || withinRoot.startsWith(`..${sep}`) || !databasePath.endsWith(".sqlite")) throw new Error("Only existing local .wrangler SQLite databases are allowed");
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000");
  try {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    const dryRun = !args.includes("--apply");
    if (!dryRun) {
      const backupDir = resolve(projectRoot, "backups");
      mkdirSync(backupDir, { recursive: true });
      const backup = resolve(backupDir, `pre-cross-sector-import-${Date.now()}.sqlite`);
      db.prepare("VACUUM INTO ?").run(backup);
      console.log(JSON.stringify({ backup }));
    }
    console.log(JSON.stringify(applyCrossSectorReview(db, catalog, { dryRun }), null, 2));
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
