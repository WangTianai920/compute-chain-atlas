export type CompanyResearch = {
  code: string;
  name: string;
  sector: string;
  reviewedAt: string;
  evidence: string;
  risk: string;
  stage: string;
  aliases: string[];
  sources: { title: string; url: string; publishedAt: string | null }[];
};

// Research metadata is persisted alongside the existing app metadata. Older
// databases do not have these keys and continue to render without a research card.
export function parseCompanyResearch(value: unknown): CompanyResearch | null {
  if (typeof value !== "string") return null;
  try {
    const item = JSON.parse(value) as CompanyResearch;
    if (!item || !/^\d{6}$/.test(item.code) || !/^\d{4}-\d{2}-\d{2}$/.test(item.reviewedAt)) return null;
    if (![item.name, item.sector, item.evidence, item.risk, item.stage].every(field => typeof field === "string" && field.trim())) return null;
    if (!Array.isArray(item.aliases) || !item.aliases.every(alias => typeof alias === "string")) return null;
    if (!Array.isArray(item.sources) || !item.sources.length || !item.sources.every(source => {
      if (!source || typeof source.title !== "string" || !source.title.trim() || typeof source.url !== "string") return false;
      const url = new URL(source.url);
      return url.protocol === "https:" && !url.username && !url.password
        && (source.publishedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(source.publishedAt));
    })) return null;
    return item;
  } catch {
    return null;
  }
}
