import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalog = JSON.parse(readFileSync(resolve(root, "data/research/2026-08-31-cross-sector-review.json"), "utf8"));
const cacheDir = resolve(root, "tmp/pdfs/annual-business-api-cache");
const outputPath = resolve(root, "docs/research/2026-09-01-annual-business-extracts.json");
mkdirSync(cacheDir, { recursive: true });

const LIST = "https://np-anotice-stock.eastmoney.com/api/security/ann";
const CONTENT = "https://np-cnotice-stock.eastmoney.com/api/content/ann";
const headers = {
  accept: "application/json,text/plain,*/*",
  referer: "https://data.eastmoney.com/",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36",
};
let nextRequestAt = 0;
const sleep = milliseconds => new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds));

async function cachedJson(key, url) {
  const path = resolve(cacheDir, `${key}.json`);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const wait = Math.max(0, nextRequestAt - Date.now());
    if (wait) await sleep(wait);
    nextRequestAt = Date.now() + 180;
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const text = await response.text();
      if (text.length > 9_000_000) throw new Error(`Oversized response: ${key}`);
      const value = JSON.parse(text);
      writeFileSync(path, `${JSON.stringify(value)}\n`);
      return value;
    } catch (error) {
      if (attempt === 6) throw error;
      await sleep(attempt * 900);
    }
  }
  throw new Error(`unreachable: ${key}`);
}

function annualReport(title = "") {
  if (/半年度|摘要|英文|审计报告|问询|回复|取消审核|H股公告/.test(title)) return false;
  return /20\d{2}\s*年?年度报告(?:全文)?\s*(?:[（(](?:更正后|修订版)[）)])?\s*$/.test(title);
}

async function findReport(code) {
  for (let page = 1; page <= 5; page += 1) {
    const url = new URL(LIST);
    url.search = new URLSearchParams({ sr: "-1", page_size: "50", page_index: String(page), ann_type: "A", client_source: "web", stock_list: code }).toString();
    const payload = await cachedJson(`${code}-list-${page}`, url);
    const match = payload.data?.list?.find(item => annualReport(item.title));
    if (match?.art_code) return match;
  }
  throw new Error("annual report not found");
}

async function reportText(artCode, code) {
  const chunks = [];
  let firstData = {};
  for (let page = 1; page <= 12; page += 1) {
    const url = new URL(CONTENT);
    url.search = new URLSearchParams({ art_code: artCode, client_source: "web", page_index: String(page) }).toString();
    const payload = await cachedJson(`${code}-${artCode}-${page}`, url);
    const data = payload.data ?? {};
    if (page === 1) firstData = data;
    chunks.push(data.notice_content ?? "");
    if (page === 1 && !data.notice_content) throw new Error("empty annual report content");
    if (page > 3 && locateBusiness(chunks.join("\n\n")).section) return { chunks, data: firstData };
  }
  return { chunks, data: firstData };
}

function locateBusiness(text) {
  const normalized = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const management = normalized.search(/管理层讨论与分析|经营情况讨论与分析/);
  const scope = management >= 0 ? normalized.slice(management) : normalized;
  const patterns = [
    /(?:^|\n)\s*[一二三四五六七八九十]+[、.]\s*报告期内公司从事的(?:主要)?业务(?:情况)?/,
    /(?:^|\n)\s*[一二三四五六七八九十]+[、.]\s*公司(?:的)?主要业务(?:及经营模式)?/,
    /报告期内公司从事的主要业务/,
    /(?:^|\n)\s*[一二三四五六七八九十]+[、.]\s*主要业务(?:及经营模式)?/,
  ];
  let found = null;
  for (const pattern of patterns) {
    const match = pattern.exec(scope);
    if (match && (!found || match.index < found.index)) found = match;
  }
  if (!found) return { section: "", heading: "" };
  const start = found.index;
  const afterHeading = start + found[0].length;
  const tail = scope.slice(afterHeading);
  const next = /\n\s*[一二三四五六七八九十]+[、.]\s*(?![（(])/.exec(tail);
  const end = next && next.index > 350 ? afterHeading + next.index : Math.min(scope.length, afterHeading + 12_000);
  const section = scope.slice(start, end).replace(/\n{3,}/g, "\n\n").trim();
  return { section, heading: found[0].trim() };
}

function stableUrl(value = "") { return value.replace(/\?.*$/, ""); }
function preview(section) {
  const lines = section.split("\n").map(line => line.trim()).filter(Boolean).filter(line => {
    const digits = (line.match(/\d/g) ?? []).length;
    return digits < Math.max(12, line.length * 0.35) && !/^单位[:：]/.test(line);
  });
  return lines.join("\n").slice(0, 2_400);
}

async function collect(company) {
  try {
    const report = await findReport(company.code);
    const { chunks, data } = await reportText(report.art_code, company.code);
    const located = locateBusiness(chunks.join("\n\n"));
    const year = report.title.match(/(20\d{2})\s*年?年度报告/)?.[1] ?? "";
    return {
      code: company.code, name: company.name, status: located.section ? "extracted" : "section_not_found",
      reportYear: year, reportTitle: report.title, publishedAt: String(report.notice_date ?? data.notice_date ?? "").slice(0, 10),
      sourceUrl: stableUrl(data.attach_url_web ?? data.attach_url ?? ""), artCode: report.art_code,
      heading: located.heading, sectionPreview: preview(located.section), chunksRead: chunks.length,
    };
  } catch (error) {
    return { code: company.code, name: company.name, status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

async function pool(items, concurrency, processor = collect) {
  const output = new Array(items.length); let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor; cursor += 1;
      try {
        output[index] = await processor(items[index]);
      } catch (error) {
        output[index] = { code: items[index].code, status: "failed", error: error instanceof Error ? error.message : String(error) };
      }
      process.stdout.write(`${index + 1}/${items.length} ${items[index].code} ${output[index].status ?? (output[index].report ? "found" : "failed")}\n`);
    }
  });
  await Promise.all(workers); return output;
}

const companies = catalog.companyAudit.map(({ code, name }) => ({ code, name }));
if (process.argv.includes("--lists-only")) {
  const records = await pool(companies, 1, async company => ({ company, report: await findReport(company.code) }));
  console.log(JSON.stringify({ total: records.length, found: records.filter(item => item.report).length }));
} else {
  const records = await pool(companies, 2);
  writeFileSync(outputPath, `${JSON.stringify({ reviewedAt: "2026-09-01", method: "Latest full annual-report body; management-discussion business section", records }, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, total: records.length, extracted: records.filter(item => item.status === "extracted").length, failed: records.filter(item => item.status !== "extracted").length }));
}
