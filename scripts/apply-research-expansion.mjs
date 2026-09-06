import { DatabaseSync } from "node:sqlite";
import { readFileSync, realpathSync, mkdirSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultCatalog = new URL("../data/research/2026-08-31-expansion.json", import.meta.url);

export function validateCatalog(catalog, sectors) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(catalog?.batch) || !Array.isArray(catalog.companies) || !catalog.companies.length) throw new Error("Invalid research batch");
  const seen = new Set();
  for (const item of catalog.companies) {
    if (!/^\d{6}$/.test(item.code) || seen.has(item.code)) throw new Error(`Invalid or duplicate ticker: ${item.code}`);
    seen.add(item.code);
    if (!sectors.has(item.sector)) throw new Error(`Unknown or inactive sector: ${item.sector}`);
    if (item.role !== "candidate" || item.reviewedAt !== catalog.batch) throw new Error(`Unreviewed classification: ${item.code}`);
    for (const key of ["name", "thesis", "evidence", "risk", "stage"]) {
      if (typeof item[key] !== "string" || !item[key].trim()) throw new Error(`Missing ${key}: ${item.code}`);
    }
    if (!Array.isArray(item.aliases) || !item.aliases.every(alias => typeof alias === "string")) throw new Error(`Invalid aliases: ${item.code}`);
    if (!Array.isArray(item.sources) || !item.sources.length) throw new Error(`Missing source: ${item.code}`);
    for (const source of item.sources) {
      const url = new URL(source.url);
      if (url.protocol !== "https:" || url.username || url.password || !source.title?.trim()) throw new Error(`Unsafe source: ${item.code}`);
      if (source.publishedAt !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(source.publishedAt) || source.publishedAt > catalog.batch)) throw new Error(`Invalid source date: ${item.code}`);
    }
  }
}

export function applyResearchExpansion(db, catalog, { dryRun = true } = {}) {
  const sectors = new Map(db.prepare("SELECT slug,id FROM sectors WHERE active=1").all().map(row => [row.slug, row.id]));
  validateCatalog(catalog, sectors);
  const before = counts(db);
  const added = [], skipped = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [index, item] of catalog.companies.entries()) {
      // Never rewrite a manual edit, change a rating, reactivate a disabled
      // company, or append mappings to an existing company on re-import.
      if (db.prepare("SELECT 1 FROM companies WHERE code=?").get(item.code)) {
        skipped.push(item.code);
        continue;
      }
      const inserted = db.prepare("INSERT INTO companies (code,name,exchange,thesis,active) VALUES (?,?,?,?,1)")
        .run(item.code, item.name, item.code.startsWith("92") ? "BJ" : item.code.startsWith("6") ? "SH" : "SZ", item.thesis);
      const rationale = `核验日期：${item.reviewedAt}。${item.evidence} 业务阶段：${item.stage}。研究边界：${item.risk}`;
      db.prepare("INSERT INTO company_sectors (company_id,sector_id,role,rationale,sort_order) VALUES (?,?,'candidate',?,?)")
        .run(inserted.lastInsertRowid, sectors.get(item.sector), rationale, 1000 + index);
      db.prepare("INSERT INTO app_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .run(`company-research:${item.code}`, JSON.stringify(item));
      added.push(item.code);
    }
    if (added.length) {
      // Keep saved news and company history/financials; only membership-dependent
      // snapshots need rebuilding for the expanded universe.
      db.exec("DELETE FROM runtime_snapshots WHERE cache_key LIKE 'market:overview:%' OR cache_key LIKE 'market:signals:%' OR cache_key LIKE 'market:quotes:%' OR cache_key LIKE 'market:full:%'");
    }
    const after = counts(db);
    if (after.companies !== before.companies + added.length || after.mappings !== before.mappings + added.length) throw new Error("Unexpected database count change");
    if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Foreign-key verification failed");
    db.exec(dryRun ? "ROLLBACK" : "COMMIT");
    return { dryRun, batch: catalog.batch, before, after, added, skipped };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function counts(db) {
  return {
    companies: db.prepare("SELECT count(*) n FROM companies").get().n,
    mappings: db.prepare("SELECT count(*) n FROM company_sectors").get().n,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] !== "--local-db" || args.some((arg, i) => i > 1 && arg !== "--apply")) throw new Error("Usage: node scripts/apply-research-expansion.mjs --local-db .wrangler/...sqlite [--apply] (default: dry run)");
  const localRoot = realpathSync(resolve(projectRoot, ".wrangler"));
  const databasePath = realpathSync(resolve(projectRoot, args[1]));
  const pathWithinRoot = relative(localRoot, databasePath);
  if (!pathWithinRoot || pathWithinRoot.startsWith(`..${sep}`) || pathWithinRoot === ".." || !databasePath.endsWith(".sqlite")) throw new Error("Only existing local .wrangler SQLite databases are allowed");
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000");
  try {
    const catalog = JSON.parse(readFileSync(defaultCatalog, "utf8"));
    const dryRun = !args.includes("--apply");
    if (!dryRun) {
      const backupDir = resolve(projectRoot, "backups");
      mkdirSync(backupDir, { recursive: true });
      const backupPath = resolve(backupDir, `pre-research-import-${Date.now()}.sqlite`);
      db.prepare("VACUUM INTO ?").run(backupPath);
      console.log(JSON.stringify({ backup: backupPath }));
    }
    console.log(JSON.stringify(applyResearchExpansion(db, catalog, { dryRun }), null, 2));
  } finally {
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
