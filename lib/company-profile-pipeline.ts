import { extractOfficialEnglishName, findLatestAnnualReport, type AnnualReportDocument } from "./company-enrichment.ts";
import { parseAnnualBusiness, type AnnualBusinessProfile } from "./company-annual-business.ts";
import { annualBusinessNonBusinessPattern, cleanBusinessOnlyText, formatAnnualBusinessSummary } from "./annual-business-text.mjs";

export type ProfileMappingInput = {
  sectorSlug: string;
  sectorName: string;
  sectorShortName: string;
  role: "core" | "candidate";
  rationale: string;
};
export type ProfileCompanyInput = { code: string; name: string; thesis: string; mappings: ProfileMappingInput[] };
export type ProfileTranslationResult = { profile: AnnualBusinessProfile; nameEn: string; thesisEn: string };
export type AnnualReportMetadata = Omit<AnnualReportDocument, "content">;
export type AnnualBusinessEvidence = { report: AnnualReportMetadata; coreBusiness: string; nameEn: string };

export async function loadProfileCompany(db: D1Database, code: string): Promise<ProfileCompanyInput> {
  const rows = await db.prepare(`SELECT c.code,c.name,c.thesis,s.slug sector_slug,s.name sector_name,s.short_name sector_short_name,cs.role,cs.rationale
    FROM companies c JOIN company_sectors cs ON cs.company_id=c.id JOIN sectors s ON s.id=cs.sector_id
    WHERE c.code=? AND c.active=1 AND s.active=1 ORDER BY s.sort_order,cs.sort_order`).bind(code).all<Record<string, unknown>>();
  if (!rows.results.length) throw new Error("未找到有效标的或产业映射");
  return {
    code,
    name: String(rows.results[0].name),
    thesis: String(rows.results[0].thesis ?? "").trim(),
    mappings: rows.results.map(row => ({
      sectorSlug: String(row.sector_slug), sectorName: String(row.sector_name), sectorShortName: String(row.sector_short_name),
      role: row.role === "candidate" ? "candidate" : "core", rationale: String(row.rationale ?? "").trim(),
    })),
  };
}

export async function retrieveAnnualReport(company: ProfileCompanyInput, fetchImpl: typeof fetch = fetch) {
  return findLatestAnnualReport(company.code, fetchImpl);
}

export async function retrieveAnnualBusinessEvidence(company: ProfileCompanyInput, fetchImpl: typeof fetch = fetch, onReportFetched?: () => Promise<void>): Promise<AnnualBusinessEvidence> {
  const report = await findLatestAnnualReport(company.code, fetchImpl);
  await onReportFetched?.();
  const { content, ...metadata } = report;
  return { report: metadata, coreBusiness: extractCoreBusiness(content), nameEn: extractOfficialEnglishName(content) };
}

export function composeAnnualBusinessProfile(company: ProfileCompanyInput, report: AnnualReportMetadata, extractedBusiness: string): Omit<AnnualBusinessProfile, "summaryEn"> & { summaryEn?: string } {
  const coreBusiness = cleanBusinessOnlyText(extractedBusiness);
  if (coreBusiness.length < 80) throw new Error("年度报告主营业务正文不足，无法生成资料");
  const positioning = company.thesis.replace(/[。；;\s]+$/u, "");
  const summary = formatAnnualBusinessSummary(`根据${report.reportYear}年年度报告，${coreBusiness}`);
  const mappings = company.mappings.map(mapping => {
    const detail = (mapping.rationale || positioning).replace(/\s+/g, " ").trim();
    if (detail.length < 8) throw new Error(`请补充「${mapping.sectorName}」的产业环节业务说明`);
    return {
      sectorSlug: mapping.sectorSlug, sectorName: mapping.sectorName, sectorShortName: mapping.sectorShortName,
      role: mapping.role, detail, detailEn: "", boundary: null,
      sources: [{ title: report.title, url: report.sourceUrl, publishedAt: report.publishedAt }],
    };
  });
  return {
    code: company.code, name: company.name, reportYear: report.reportYear, reportTitle: report.title,
    publishedAt: report.publishedAt, sourceType: "annual_report", sourceUrl: report.sourceUrl,
    reviewedAt: new Date().toISOString().slice(0, 10), summary, mappings,
  };
}

export async function translateAnnualBusinessProfile(
  company: ProfileCompanyInput,
  evidence: AnnualBusinessEvidence,
  draft: ReturnType<typeof composeAnnualBusinessProfile>,
  translate: (text: string) => Promise<string>,
): Promise<ProfileTranslationResult> {
  const translateField = (text: string) => translateTextInChunks(text, translate);
  const businessSummary = draft.summary;
  const [businessSummaryEn, thesisEn, ...detailsEn] = await Promise.all([
    translateField(businessSummary),
    translateField(company.thesis),
    ...draft.mappings.map(mapping => translateField(mapping.detail)),
  ]);
  const nameEn = evidence.nameEn;
  const summaryEn = formatAnnualBusinessSummary(normalizeEnglish(businessSummaryEn), { locale: "en" });
  if (!isEnglish(nameEn) || !isEnglish(summaryEn) || !isEnglish(thesisEn) || detailsEn.some(value => !isEnglish(value))) throw new Error("英文翻译校验失败，需要重新处理");
  const profile: AnnualBusinessProfile = {
    ...draft,
    summaryEn,
    mappings: draft.mappings.map((mapping, index) => ({ ...mapping, detailEn: normalizeEnglish(detailsEn[index]) })),
  };
  return { profile, nameEn: normalizeEnglish(nameEn), thesisEn: normalizeEnglish(thesisEn) };
}

export async function translateTextInChunks(text: string, translate: (chunk: string) => Promise<string>, maximumCharacters = 700) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("待翻译文本为空");
  const units = normalized.match(/[^。！？；]+[。！？；]?/gu) ?? [normalized];
  const chunks: string[] = [];
  let current = "";
  const flush = () => { if (current) chunks.push(current); current = ""; };
  for (const unit of units) {
    if (unit.length > maximumCharacters) {
      flush();
      for (let offset = 0; offset < unit.length; offset += maximumCharacters) chunks.push(unit.slice(offset, offset + maximumCharacters));
    } else if (current && current.length + unit.length > maximumCharacters) {
      flush(); current = unit;
    } else current += unit;
  }
  flush();
  return normalizeEnglish((await Promise.all(chunks.map(translate))).join(" "));
}

export function validateProfileResult(result: ProfileTranslationResult, expected: ProfileCompanyInput) {
  const parsed = parseAnnualBusiness(JSON.stringify(result.profile));
  if (!parsed || parsed.code !== expected.code) throw new Error("主营业务资料结构校验失败");
  const expectedSlugs = [...expected.mappings.map(mapping => mapping.sectorSlug)].sort();
  const actualSlugs = [...parsed.mappings.map(mapping => mapping.sectorSlug)].sort();
  if (JSON.stringify(expectedSlugs) !== JSON.stringify(actualSlugs)) throw new Error("产业映射与主营业务资料不一致");
  return { ...result, profile: parsed };
}

export async function writeProfileResult(db: D1Database, result: ProfileTranslationResult) {
  await db.batch([
    db.prepare("INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .bind(`company-annual-business:${result.profile.code}`, JSON.stringify(result.profile)),
    db.prepare(`UPDATE companies SET name_en=?,thesis_en=?,en_source_url=?,en_status='verified',en_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE code=?`)
      .bind(result.nameEn, result.thesisEn, result.profile.sourceUrl, result.profile.code),
  ]);
}

export function extractCoreBusiness(content: string) {
  const text = content.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\r/g, "\n").replace(/[\t\u00a0 ]+/g, " ").replace(/\n{3,}/g, "\n\n");
  const headings = [/报告期内公司从事的主要业务/u, /公司主要业务及产品/u, /主要业务及产品/u, /主营业务(?:情况|概况)?/u, /主要产品及服务/u, /发行人主营业务/u];
  const start = headings.map(pattern => text.search(pattern)).filter(index => index >= 0).sort((a, b) => a - b)[0] ?? -1;
  if (start < 0) throw new Error("年度报告中未定位到主营业务章节");
  const body = text.slice(start, start + 18_000);
  const endMatch = body.slice(120).search(/\n\s*(?:主要经营模式|报告期内公司所处行业|行业发展情况|核心竞争力分析|经营情况讨论与分析)/u);
  const section = (endMatch >= 0 ? body.slice(0, endMatch + 120) : body).replace(/^.{0,80}?(?:主要业务及产品|主营业务(?:情况|概况)?|主要产品及服务)\s*/u, "");
  const sentences = section.replace(/\n+/g, " ").split(/(?<=[。！？；])/u)
    .map(value => value.replace(/^\s*[（(]?[一二三四五六七八九十0-9]+[）)、.．]?\s*/u, "").trim())
    .filter(value => value.length >= 24 && value.length <= 600)
    .filter(value => /业务|产品|服务|研发|生产|销售|运营|解决方案|应用/u.test(value))
    .filter(value => !annualBusinessNonBusinessPattern.test(value))
    .filter(value => !/营业收入|净利润|同比|市场规模|行业政策/u.test(value));
  const selected: string[] = [];
  let length = 0;
  for (const sentence of sentences) {
    if (selected.some(value => value.includes(sentence) || sentence.includes(value))) continue;
    if (length + sentence.length > 1_650 && length >= 500) break;
    selected.push(sentence);
    length += sentence.length;
    if (selected.length >= 6 || length >= 1_300) break;
  }
  return cleanBusinessOnlyText(selected.join("").replace(/\s+/g, " ").trim());
}

function normalizeEnglish(value: string) { return value.replace(/\s+/g, " ").replace(/\s+([,.;:)])/g, "$1").trim(); }
function isEnglish(value: string) { return value.trim().length > 1 && /[A-Za-z]/.test(value) && !/[\p{Script=Han}]/u.test(value); }
