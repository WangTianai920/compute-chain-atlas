import { DatabaseSync } from "node:sqlite";
import { readFileSync, realpathSync, mkdirSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const catalogPath = new URL("../data/research/2026-09-01-annual-business-profiles.json", import.meta.url);

export function validateAnnualBusinessCatalog(catalog, db) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(catalog?.reviewedAt ?? "") || !Array.isArray(catalog.companies)) throw new Error("Invalid annual-business catalog");
  const existing = db.prepare("SELECT code,name FROM companies WHERE active=1 ORDER BY code").all();
  const known = new Map(existing.map(item => [item.code, item.name]));
  if (catalog.companies.length !== existing.length) throw new Error(`Expected ${existing.length} company profiles`);
  const seen = new Set();
  for (const item of catalog.companies) {
    if (!/^\d{6}$/.test(item.code) || seen.has(item.code) || known.get(item.code) !== item.name) throw new Error(`Unknown or duplicate company: ${item.code}`);
    seen.add(item.code);
    if (!item.summary?.trim() || item.reviewedAt !== catalog.reviewedAt || !/^20\d{2}$/.test(item.reportYear) || !/^https:\/\//.test(item.sourceUrl)) throw new Error(`Incomplete disclosure: ${item.code}`);
    const current = db.prepare(`SELECT s.slug FROM company_sectors cs JOIN companies c ON c.id=cs.company_id JOIN sectors s ON s.id=cs.sector_id WHERE c.code=? ORDER BY s.slug`).all(item.code).map(row => row.slug);
    const supplied = item.mappings.map(mapping => mapping.sectorSlug).sort();
    if (JSON.stringify(current) !== JSON.stringify(supplied)) throw new Error(`Mapping coverage mismatch: ${item.code}`);
  }
}

export function applyAnnualBusinessProfiles(db, catalog, { dryRun = true } = {}) {
  validateAnnualBusinessCatalog(catalog, db);
  const before = db.prepare("SELECT count(*) n FROM app_meta WHERE key LIKE 'company-annual-business:%'").get().n;
  db.exec("BEGIN IMMEDIATE");
  try {
    const statement = db.prepare("INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    for (const item of catalog.companies) statement.run(`company-annual-business:${item.code}`, JSON.stringify(item));
    const after = db.prepare("SELECT count(*) n FROM app_meta WHERE key LIKE 'company-annual-business:%'").get().n;
    if (after !== catalog.companies.length) throw new Error("Annual-business write count mismatch");
    if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Foreign-key verification failed");
    db.exec(dryRun ? "ROLLBACK" : "COMMIT");
    return { dryRun, before, after, companies: catalog.companies.length, mappings: catalog.companies.reduce((sum, item) => sum + item.mappings.length, 0) };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] !== "--local-db" || args.some((arg, index) => index > 1 && arg !== "--apply")) throw new Error("Usage: node scripts/apply-annual-business-profiles.mjs --local-db .wrangler/...sqlite [--apply]");
  const localRoot = realpathSync(resolve(projectRoot, ".wrangler"));
  const databasePath = realpathSync(resolve(projectRoot, args[1]));
  const withinRoot = relative(localRoot, databasePath);
  if (!withinRoot || withinRoot === ".." || withinRoot.startsWith(`..${sep}`) || !databasePath.endsWith(".sqlite")) throw new Error("Only the existing local .wrangler SQLite database is allowed");
  const db = new DatabaseSync(databasePath); db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000");
  try {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    const dryRun = !args.includes("--apply");
    if (!dryRun) {
      const backupDir = resolve(projectRoot, "backups"); mkdirSync(backupDir, { recursive: true });
      const backup = resolve(backupDir, `pre-annual-business-profiles-${Date.now()}.sqlite`);
      db.prepare("VACUUM INTO ?").run(backup); console.log(JSON.stringify({ backup }));
    }
    console.log(JSON.stringify(applyAnnualBusinessProfiles(db, catalog, { dryRun }), null, 2));
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
