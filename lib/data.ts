import { getD1 } from "../db";
import { seedCompanies, seedSectors } from "./seed";
import { parseCompanyResearch } from "./company-research";
import { parseAnnualBusiness } from "./company-annual-business";
import { parseCompanyProfileJob, queueCompanyProfileJob, type CompanyProfileJob } from "./company-profile-job";

export type CompanyEntry = {
  mappingId: number; companyId: number; code: string; name: string; exchange: string; thesis: string;
  nameEn: string; thesisEn: string; enSourceUrl: string; enStatus: EnglishEnrichmentStatus; enUpdatedAt: string | null;
  active: boolean; sectorId: number; sectorSlug: string; sectorName: string; sectorShortName: string;
  sectorDescription: string; role: "core" | "candidate"; rationale: string; sortOrder: number;
  researchReviewedAt?: string; researchAliases?: string[];
  profileJob?: CompanyProfileJob;
};

export type EnglishEnrichmentStatus = "pending" | "processing" | "verified" | "needs_review" | "failed";
export type RuntimeSnapshot<T> = { cacheKey: string; payload: T; updatedAt: string };

let initialized = false;
const SEED_VERSION = "4";

export async function ensureDatabase() {
  if (initialized) return;
  const db = getD1();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sectors (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, short_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)"),
    db.prepare("CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, exchange TEXT NOT NULL, thesis TEXT NOT NULL DEFAULT '', name_en TEXT NOT NULL DEFAULT '', thesis_en TEXT NOT NULL DEFAULT '', en_source_url TEXT NOT NULL DEFAULT '', en_status TEXT NOT NULL DEFAULT 'pending', en_updated_at TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS company_sectors (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE, sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('core','candidate')), rationale TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(company_id, sector_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS runtime_snapshots (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_sectors_slug ON sectors(slug)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sectors_sort_order ON sectors(sort_order)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_code ON companies(code)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(active)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_company_sectors_unique ON company_sectors(company_id, sector_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_company_sectors_sector_role ON company_sectors(sector_id, role)"),
  ]);
  await ensureCompanyEnglishColumns(db);
  const seeded = await db.prepare("SELECT value FROM app_meta WHERE key = ?").bind("seed_version").first<{ value: string }>();
  if (seeded?.value !== SEED_VERSION) {
    const sectorStatements = seedSectors.map(([slug, name, shortName, description], index) =>
      db.prepare(`INSERT INTO sectors (slug,name,short_name,description,sort_order,active) VALUES (?,?,?,?,?,1)
        ON CONFLICT(slug) DO UPDATE SET name=excluded.name,short_name=excluded.short_name,description=excluded.description,sort_order=excluded.sort_order`).bind(slug, name, shortName, description, index + 1));
    await db.batch(sectorStatements);
    const unique = new Map<string, { name: string; thesis: string }>();
    for (const [code, name, , , thesis] of seedCompanies) if (!unique.has(code)) unique.set(code, { name, thesis });
    await db.batch([...unique].map(([code, company]) => db.prepare(`INSERT INTO companies (code,name,exchange,thesis,active) VALUES (?,?,?,?,1)
      ON CONFLICT(code) DO UPDATE SET name=excluded.name,exchange=excluded.exchange,thesis=excluded.thesis,updated_at=CURRENT_TIMESTAMP`).bind(code, company.name, exchangeFor(code), company.thesis)));
    const sectorDescriptions = new Map(seedSectors.map(([slug, , , description]) => [slug, description]));
    await db.batch(seedCompanies.map(([code, , sectorSlug, role], index) => db.prepare(`
      INSERT INTO company_sectors (company_id, sector_id, role, rationale, sort_order)
      SELECT c.id, s.id, ?, ?, ? FROM companies c, sectors s WHERE c.code = ? AND s.slug = ?
      ON CONFLICT(company_id,sector_id) DO UPDATE SET role=excluded.role,rationale=excluded.rationale,sort_order=excluded.sort_order
    `).bind(role, sectorDescriptions.get(sectorSlug) ?? "", index + 1, code, sectorSlug)));
    await db.prepare("INSERT INTO app_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind("seed_version", SEED_VERSION).run();
  }
  await db.prepare("PRAGMA optimize").run();
  initialized = true;
}

export async function listCompanyEntries(includeInactive = false): Promise<CompanyEntry[]> {
  await ensureDatabase();
  const where = includeInactive ? "" : "WHERE c.active = 1 AND s.active = 1";
  const result = await getD1().prepare(`
    SELECT cs.id mapping_id,c.id company_id,c.code,c.name,c.exchange,c.thesis,c.name_en,c.thesis_en,
      c.en_source_url,c.en_status,c.en_updated_at,c.active,
      s.id sector_id,s.slug sector_slug,s.name sector_name,s.short_name sector_short_name,s.description sector_description,
      cs.role,cs.rationale,cs.sort_order,research.value research_json,profile_job.value profile_job_json
    FROM company_sectors cs JOIN companies c ON c.id=cs.company_id JOIN sectors s ON s.id=cs.sector_id
    LEFT JOIN app_meta research ON research.key='company-research:' || c.code
    LEFT JOIN app_meta profile_job ON profile_job.key='company-profile-job:' || c.code
    ${where} ORDER BY s.sort_order, CASE cs.role WHEN 'core' THEN 0 ELSE 1 END, cs.sort_order, c.code
  `).all<Record<string, unknown>>();
  return result.results.map(normalizeEntry);
}

export async function getCompanyRecord(code: string) {
  const entries = await listCompanyEntries(false);
  const matches = entries.filter((entry) => entry.code === code);
  if (!matches.length) return null;
  const [row, mappingRows, annualRow] = await Promise.all([
    getD1().prepare("SELECT value FROM app_meta WHERE key=?").bind(`company-research:${code}`).first<{ value: string }>(),
    getD1().prepare("SELECT value FROM app_meta WHERE key LIKE ? ORDER BY key").bind(`company-mapping-research:${code}:%`).all<{ value: string }>(),
    getD1().prepare("SELECT value FROM app_meta WHERE key=?").bind(`company-annual-business:${code}`).first<{ value: string }>(),
  ]);
  const research = parseCompanyResearch(row?.value);
  const annualBusiness = parseAnnualBusiness(annualRow?.value);
  const mappingResearch = mappingRows.results.flatMap(row => {
    const item = parseCompanyResearch(row.value);
    return item?.code === code && matches.some(match => match.sectorSlug === item.sector) ? [item] : [];
  });
  return { ...matches[0], research: research?.code === code ? research : null, mappingResearch, annualBusiness: annualBusiness?.code === code ? annualBusiness : null, sectors: matches.map(({ sectorId, sectorSlug, sectorName, sectorShortName, role, rationale, mappingId }) => ({ sectorId, sectorSlug, sectorName, sectorShortName, role, rationale, mappingId })) };
}

export async function upsertCompanyEntry(payload: { code: string; name: string; sectorId: number; role: "core" | "candidate"; thesis: string; rationale: string; active?: boolean }) {
  await ensureDatabase();
  const db = getD1();
  const code = payload.code.trim();
  await db.prepare(`INSERT INTO companies (code,name,exchange,thesis,active) VALUES (?,?,?,?,?)
    ON CONFLICT(code) DO UPDATE SET
      name_en=CASE WHEN companies.name<>excluded.name THEN '' ELSE companies.name_en END,
      thesis_en=CASE WHEN companies.thesis<>excluded.thesis THEN '' ELSE companies.thesis_en END,
      en_source_url=CASE WHEN companies.name<>excluded.name THEN '' ELSE companies.en_source_url END,
      en_status=CASE WHEN companies.name<>excluded.name OR companies.thesis<>excluded.thesis THEN 'pending' ELSE companies.en_status END,
      en_updated_at=CASE WHEN companies.name<>excluded.name OR companies.thesis<>excluded.thesis THEN NULL ELSE companies.en_updated_at END,
      name=excluded.name,exchange=excluded.exchange,thesis=excluded.thesis,active=excluded.active,updated_at=CURRENT_TIMESTAMP`)
    .bind(code, payload.name.trim(), exchangeFor(code), payload.thesis.trim(), payload.active === false ? 0 : 1).run();
  const company = await db.prepare("SELECT id FROM companies WHERE code=?").bind(code).first<{ id: number }>();
  if (!company) throw new Error("公司保存失败");
  await db.prepare(`INSERT INTO company_sectors (company_id,sector_id,role,rationale,sort_order) VALUES (?,?,?,?,999)
    ON CONFLICT(company_id,sector_id) DO UPDATE SET role=excluded.role,rationale=excluded.rationale`)
    .bind(company.id, payload.sectorId, payload.role, payload.rationale.trim()).run();
  await clearCompanyRuntimeSnapshots();
  return getCompanyRecord(code);
}

export async function createCompanyProfileJob(code: string) {
  await ensureDatabase();
  return queueCompanyProfileJob(getD1(), code);
}

export async function updateCompanyEntry(mappingId: number, payload: { name: string; sectorId: number; role: "core" | "candidate"; thesis: string; rationale: string; active: boolean }) {
  await ensureDatabase();
  const db = getD1();
  const row = await db.prepare(`SELECT cs.company_id,c.code,c.name,c.thesis FROM company_sectors cs
    JOIN companies c ON c.id=cs.company_id WHERE cs.id=?`).bind(mappingId).first<{ company_id: number; code: string; name: string; thesis: string }>();
  if (!row) throw new Error("找不到该标的");
  const englishChanged = row.name !== payload.name.trim() || row.thesis !== payload.thesis.trim();
  await db.batch([
    englishChanged
      ? db.prepare("UPDATE companies SET name=?,thesis=?,name_en='',thesis_en='',en_source_url='',en_status='pending',en_updated_at=NULL,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(payload.name.trim(), payload.thesis.trim(), payload.active ? 1 : 0, row.company_id)
      : db.prepare("UPDATE companies SET name=?,thesis=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(payload.name.trim(), payload.thesis.trim(), payload.active ? 1 : 0, row.company_id),
    db.prepare("UPDATE company_sectors SET sector_id=?,role=?,rationale=? WHERE id=?").bind(payload.sectorId, payload.role, payload.rationale.trim(), mappingId),
  ]);
  await clearCompanyRuntimeSnapshots();
  return getCompanyRecord(row.code);
}

export async function deleteCompanyEntry(mappingId: number) {
  await ensureDatabase();
  const db = getD1();
  const row = await db.prepare("SELECT company_id FROM company_sectors WHERE id=?").bind(mappingId).first<{ company_id: number }>();
  if (!row) return;
  await db.prepare("DELETE FROM company_sectors WHERE id=?").bind(mappingId).run();
  const remaining = await db.prepare("SELECT COUNT(*) count FROM company_sectors WHERE company_id=?").bind(row.company_id).first<{ count: number }>();
  if (!remaining?.count) await db.prepare("DELETE FROM companies WHERE id=?").bind(row.company_id).run();
  await clearCompanyRuntimeSnapshots();
}

export async function markCompanyEnglishStatus(code: string, status: EnglishEnrichmentStatus) {
  await ensureDatabase();
  await getD1().prepare("UPDATE companies SET en_status=?,en_updated_at=CURRENT_TIMESTAMP WHERE code=?").bind(status, code).run();
  await clearCompanyRuntimeSnapshots();
}

export async function updateCompanyEnglish(code: string, payload: { nameEn: string; thesisEn: string; sourceUrl: string; status: EnglishEnrichmentStatus }) {
  await ensureDatabase();
  await getD1().prepare(`UPDATE companies SET name_en=?,thesis_en=?,en_source_url=?,en_status=?,
    en_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE code=?`)
    .bind(payload.nameEn.trim(), payload.thesisEn.trim(), payload.sourceUrl.trim(), payload.status, code).run();
  await clearCompanyRuntimeSnapshots();
  return getCompanyRecord(code);
}

export async function readRuntimeSnapshot<T>(cacheKey: string): Promise<RuntimeSnapshot<T> | null> {
  await ensureDatabase();
  const row = await getD1().prepare("SELECT cache_key,payload,updated_at FROM runtime_snapshots WHERE cache_key=?")
    .bind(cacheKey).first<{ cache_key: string; payload: string; updated_at: string }>();
  if (!row) return null;
  try {
    return { cacheKey: row.cache_key, payload: JSON.parse(row.payload) as T, updatedAt: row.updated_at };
  } catch {
    await getD1().prepare("DELETE FROM runtime_snapshots WHERE cache_key=?").bind(cacheKey).run();
    return null;
  }
}

export async function writeRuntimeSnapshot(cacheKey: string, payload: unknown) {
  await ensureDatabase();
  const updatedAt = new Date().toISOString();
  await getD1().prepare(`INSERT INTO runtime_snapshots (cache_key,payload,updated_at) VALUES (?,?,?)
    ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`)
    .bind(cacheKey, JSON.stringify(payload), updatedAt).run();
  return updatedAt;
}

export async function clearRuntimeSnapshots(prefixes: string | string[] = "market:") {
  await ensureDatabase();
  const values = (Array.isArray(prefixes) ? prefixes : [prefixes]).map((prefix) => `${prefix}%`);
  const where = values.map(() => "cache_key LIKE ?").join(" OR ");
  await getD1().prepare(`DELETE FROM runtime_snapshots WHERE ${where}`).bind(...values).run();
}

export async function clearCompanyRuntimeSnapshots() {
  await clearRuntimeSnapshots(["market:overview:", "market:signals:", "market:quotes:", "market:full:"]);
}

export async function claimRuntimeRefresh(cacheKey: string, lockForMs = 30_000) {
  await ensureDatabase();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - lockForMs).toISOString();
  const result = await getD1().prepare(`INSERT INTO runtime_snapshots (cache_key,payload,updated_at) VALUES (?,?,?)
    ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at
    WHERE runtime_snapshots.updated_at < ?`)
    .bind(`market-lock:${cacheKey}`, "{}", now, staleBefore).run();
  return result.meta.changes > 0;
}

export async function releaseRuntimeRefresh(cacheKey: string) {
  await ensureDatabase();
  await getD1().prepare("DELETE FROM runtime_snapshots WHERE cache_key=?").bind(`market-lock:${cacheKey}`).run();
}

async function ensureCompanyEnglishColumns(db: D1Database) {
  const columns = await db.prepare("PRAGMA table_info(companies)").all<{ name: string }>();
  const present = new Set(columns.results.map((column) => column.name));
  const missing = [
    ["name_en", "ALTER TABLE companies ADD COLUMN name_en TEXT NOT NULL DEFAULT ''"],
    ["thesis_en", "ALTER TABLE companies ADD COLUMN thesis_en TEXT NOT NULL DEFAULT ''"],
    ["en_source_url", "ALTER TABLE companies ADD COLUMN en_source_url TEXT NOT NULL DEFAULT ''"],
    ["en_status", "ALTER TABLE companies ADD COLUMN en_status TEXT NOT NULL DEFAULT 'pending'"],
    ["en_updated_at", "ALTER TABLE companies ADD COLUMN en_updated_at TEXT"],
  ].filter(([name]) => !present.has(name));
  if (missing.length) await db.batch(missing.map(([, statement]) => db.prepare(statement)));
}

function exchangeFor(code: string) { return code.startsWith("92") ? "BJ" : code.startsWith("6") ? "SH" : "SZ"; }
function normalizeEntry(row: Record<string, unknown>): CompanyEntry {
  const research = parseCompanyResearch(row.research_json);
  const profileJob = parseCompanyProfileJob(row.profile_job_json);
  return {
    mappingId: Number(row.mapping_id), companyId: Number(row.company_id), code: String(row.code), name: String(row.name), exchange: String(row.exchange),
    thesis: String(row.thesis ?? ""), nameEn: String(row.name_en ?? ""), thesisEn: String(row.thesis_en ?? ""),
    enSourceUrl: String(row.en_source_url ?? ""), enStatus: normalizeEnglishStatus(row.en_status), enUpdatedAt: row.en_updated_at ? String(row.en_updated_at) : null,
    active: Boolean(row.active), sectorId: Number(row.sector_id), sectorSlug: String(row.sector_slug),
    sectorName: String(row.sector_name), sectorShortName: String(row.sector_short_name), sectorDescription: String(row.sector_description),
    role: row.role === "candidate" ? "candidate" : "core", rationale: String(row.rationale ?? ""), sortOrder: Number(row.sort_order),
    ...(research?.code === String(row.code) ? { researchReviewedAt: research.reviewedAt, researchAliases: research.aliases } : {}),
    ...(profileJob?.code === String(row.code) ? { profileJob } : {}),
  };
}

function normalizeEnglishStatus(value: unknown): EnglishEnrichmentStatus {
  return value === "processing" || value === "verified" || value === "needs_review" || value === "failed" ? value : "pending";
}
