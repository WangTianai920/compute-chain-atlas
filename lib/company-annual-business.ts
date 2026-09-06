export type AnnualBusinessSource = { title: string; url: string; publishedAt: string | null };
export type AnnualBusinessMapping = {
  sectorSlug: string; sectorName: string; sectorShortName: string; role: "core" | "candidate";
  detail: string; detailEn: string; boundary: string | null; sources: AnnualBusinessSource[];
};
export type AnnualBusinessProfile = {
  code: string; name: string; reportYear: string; reportTitle: string; publishedAt: string | null;
  sourceType: "annual_report" | "prospectus"; sourceUrl: string; reviewedAt: string;
  summary: string; summaryEn: string; mappings: AnnualBusinessMapping[];
};

const date = (value: unknown) => value === null || typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const safeUrl = (value: unknown) => {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
};

export function parseAnnualBusiness(value: unknown): AnnualBusinessProfile | null {
  if (typeof value !== "string") return null;
  try {
    const item = JSON.parse(value) as AnnualBusinessProfile;
    if (!item || !/^\d{6}$/.test(item.code) || !/^20\d{2}$/.test(item.reportYear) || !date(item.publishedAt) || !date(item.reviewedAt)) return null;
    if (![item.name, item.reportTitle, item.summary, item.summaryEn].every(field => typeof field === "string" && field.trim()) || !safeUrl(item.sourceUrl)) return null;
    if (/[\p{Script=Han}]/u.test(item.summaryEn)) return null;
    if (item.sourceType !== "annual_report" && item.sourceType !== "prospectus") return null;
    if (!Array.isArray(item.mappings) || !item.mappings.length) return null;
    const seen = new Set<string>();
    for (const mapping of item.mappings) {
      if (!mapping || seen.has(mapping.sectorSlug) || !/^[a-z0-9-]+$/.test(mapping.sectorSlug)) return null;
      seen.add(mapping.sectorSlug);
      if (![mapping.sectorName, mapping.sectorShortName, mapping.detail, mapping.detailEn].every(field => typeof field === "string" && field.trim())) return null;
      if (/[\p{Script=Han}]/u.test(mapping.detailEn)) return null;
      if (mapping.role !== "core" && mapping.role !== "candidate") return null;
      if (mapping.boundary !== null && (typeof mapping.boundary !== "string" || !mapping.boundary.trim())) return null;
      if (!Array.isArray(mapping.sources) || !mapping.sources.length || !mapping.sources.every(source => source && typeof source.title === "string" && source.title.trim() && safeUrl(source.url) && date(source.publishedAt))) return null;
    }
    return item;
  } catch { return null; }
}
