export type CompanyEnglishInput = { code: string; name: string; thesis: string };
export type CompanyEnglishResult = { nameEn: string; thesisEn: string; sourceUrl: string };

type Announcement = { art_code?: string; title?: string; notice_date?: string };
type AnnouncementListResponse = { data?: { list?: Announcement[] } };
type AnnouncementContentResponse = {
  data?: { notice_content?: string; attach_url_web?: string; attach_url?: string; art_code?: string };
};
export type AnnualReportDocument = { title: string; publishedAt: string | null; reportYear: string; content: string; sourceUrl: string };

export type CompanyEnrichmentDependencies = {
  fetchImpl?: typeof fetch;
  translate: (text: string) => Promise<string>;
};

const LIST_ENDPOINT = "https://np-anotice-stock.eastmoney.com/api/security/ann";
const CONTENT_ENDPOINT = "https://np-cnotice-stock.eastmoney.com/api/content/ann";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 8_000_000;

export async function enrichCompanyEnglishData(
  company: CompanyEnglishInput,
  dependencies: CompanyEnrichmentDependencies,
): Promise<CompanyEnglishResult> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const report = await findLatestAnnualReport(company.code, fetchImpl);
  const nameEn = extractOfficialEnglishName(report.content);
  if (!isUsableEnglish(nameEn, 200)) throw new Error("年度报告中未找到可验证的英文公司名称");

  const thesisEn = normalizeEnglish(await dependencies.translate(company.thesis));
  if (!isUsableEnglish(thesisEn, 1_500)) throw new Error("英文入选逻辑生成失败，需要人工复核");

  return { nameEn, thesisEn, sourceUrl: report.sourceUrl };
}

export function extractOfficialEnglishName(content: string) {
  const normalized = content.replace(/\r/g, "");
  const match = normalized.match(/公司的外文名称\s+([\s\S]{1,240}?)(?=\n\s*公司的外文名称缩写|\n\s*公司的法定代表人)/);
  return normalizeEnglish(match?.[1] ?? "");
}

export function isAnnualReportTitle(title: string) {
  return /年度报告/.test(title) && !/半年度|摘要|英文/.test(title);
}

export async function findLatestAnnualReport(code: string, fetchImpl: typeof fetch): Promise<AnnualReportDocument> {
  const candidates: Announcement[] = [];
  const targetYear = new Date().getUTCFullYear() - 1;
  for (let page = 1; page <= 4; page += 1) {
    const url = new URL(LIST_ENDPOINT);
    url.search = new URLSearchParams({
      sr: "-1",
      page_size: "50",
      page_index: String(page),
      ann_type: "A",
      client_source: "web",
      stock_list: code,
    }).toString();
    const payload = await fetchJson<AnnouncementListResponse>(url, fetchImpl);
    candidates.push(...(payload.data?.list ?? []).filter(item => item.art_code && isAnnualReportTitle(item.title ?? "")));
    if (candidates.some(item => annualReportYear(item) >= targetYear)) break;
  }
  const annualReport = candidates.sort(compareAnnualReports)[0];
  if (!annualReport?.art_code) throw new Error("未检索到公司年度报告");

  const contentUrl = new URL(CONTENT_ENDPOINT);
  contentUrl.search = new URLSearchParams({ art_code: annualReport.art_code, client_source: "web", page_index: "1" }).toString();
  const contentPayload = await fetchJson<AnnouncementContentResponse>(contentUrl, fetchImpl);
  const content = contentPayload.data?.notice_content ?? "";
  if (!content) throw new Error("年度报告正文暂时不可用");
  const publishedAt = /^\d{4}-\d{2}-\d{2}/.test(annualReport.notice_date ?? "") ? annualReport.notice_date!.slice(0, 10) : null;
  const reportYear = String(annualReportYear(annualReport) || (publishedAt ? Number(publishedAt.slice(0, 4)) : new Date().getUTCFullYear()) - 1);
  return {
    title: annualReport.title ?? `${reportYear}年年度报告`,
    publishedAt,
    reportYear,
    content,
    sourceUrl: normalizeSourceUrl(contentPayload.data?.attach_url_web
      ?? contentPayload.data?.attach_url
      ?? `https://data.eastmoney.com/notices/detail/${code}/${annualReport.art_code}.html`),
  };
}

function annualReportYear(item: Announcement) { return Number(item.title?.match(/(20\d{2})年年度报告/)?.[1] ?? 0); }
function compareAnnualReports(left: Announcement, right: Announcement) {
  return annualReportYear(right) - annualReportYear(left) || String(right.notice_date ?? "").localeCompare(String(left.notice_date ?? ""));
}

function normalizeSourceUrl(value: string) {
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `https://np-cnotice-stock.eastmoney.com${value}`;
  return value.replace(/^http:/, "https:");
}

async function fetchJson<T>(url: URL, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json,text/plain,*/*", "user-agent": "Compute-Chain-Atlas/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`公告数据源返回 ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("公告数据源响应过大");
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new Error("公告数据源响应过大");
  try { return JSON.parse(body) as T; }
  catch { throw new Error("公告数据源返回了无效内容"); }
}

function normalizeEnglish(value: string) {
  return value.replace(/\s+/g, " ").replace(/\s+([,.;:)])/g, "$1").trim();
}

function isUsableEnglish(value: string, maximumLength: number) {
  return value.length > 1 && value.length <= maximumLength && /[A-Za-z]/.test(value) && !/[\u3400-\u9fff]/.test(value);
}
