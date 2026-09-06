export const PROFILE_JOB_HEADER = "x-company-profile-job";

export type CompanyProfileJobStatus = "queued" | "running" | "completed" | "failed";
export type CompanyProfileJobStage = "queued" | "annual_report" | "extract" | "compose" | "translate" | "validate" | "write" | "completed";
export type CompanyProfileJob = {
  id: string;
  code: string;
  status: CompanyProfileJobStatus;
  stage: CompanyProfileJobStage;
  progress: number;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  reportYear?: string;
  sourceUrl?: string;
};

const keyFor = (code: string) => `company-profile-job:${code}`;

export function parseCompanyProfileJob(value: unknown): CompanyProfileJob | null {
  if (typeof value !== "string") return null;
  try {
    const item = JSON.parse(value) as CompanyProfileJob;
    if (!item || !/^\d{6}$/.test(item.code) || typeof item.id !== "string" || !item.id.startsWith(`${item.code}-`)) return null;
    if (!["queued", "running", "completed", "failed"].includes(item.status)) return null;
    if (!["queued", "annual_report", "extract", "compose", "translate", "validate", "write", "completed"].includes(item.stage)) return null;
    if (!Number.isInteger(item.attempt) || item.attempt < 1 || !Number.isFinite(item.progress) || item.progress < 0 || item.progress > 100) return null;
    if (![item.createdAt, item.updatedAt].every(value => typeof value === "string" && !Number.isNaN(Date.parse(value)))) return null;
    if (item.completedAt !== null && (typeof item.completedAt !== "string" || Number.isNaN(Date.parse(item.completedAt)))) return null;
    if (item.error !== null && typeof item.error !== "string") return null;
    return item;
  } catch { return null; }
}

export async function readCompanyProfileJob(db: D1Database, code: string) {
  const row = await db.prepare("SELECT value FROM app_meta WHERE key=?").bind(keyFor(code)).first<{ value: string }>();
  return parseCompanyProfileJob(row?.value);
}

export async function queueCompanyProfileJob(db: D1Database, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("股票代码必须是6位数字");
  const previous = await readCompanyProfileJob(db, code);
  const now = new Date().toISOString();
  const job: CompanyProfileJob = {
    id: `${code}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    code,
    status: "queued",
    stage: "queued",
    progress: 0,
    attempt: (previous?.attempt ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    error: null,
  };
  await writeJob(db, job);
  return job;
}

export async function updateCompanyProfileJob(db: D1Database, code: string, id: string, patch: Partial<CompanyProfileJob>) {
  const current = await readCompanyProfileJob(db, code);
  if (!current || current.id !== id) return null;
  const next: CompanyProfileJob = { ...current, ...patch, id, code, updatedAt: new Date().toISOString() };
  await writeJob(db, next);
  return next;
}

async function writeJob(db: D1Database, job: CompanyProfileJob) {
  await db.prepare("INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(keyFor(job.code), JSON.stringify(job)).run();
}
