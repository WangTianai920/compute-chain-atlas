import assert from "node:assert/strict";
import test from "node:test";
import { parseCompanyProfileJob, queueCompanyProfileJob, updateCompanyProfileJob } from "../lib/company-profile-job.ts";
import {
  composeAnnualBusinessProfile,
  extractCoreBusiness,
  translateTextInChunks,
  translateAnnualBusinessProfile,
  validateProfileResult,
  type AnnualBusinessEvidence,
  type ProfileCompanyInput,
} from "../lib/company-profile-pipeline.ts";

const company: ProfileCompanyInput = {
  code: "600498",
  name: "烽火通信",
  thesis: "光通信系统设备与光纤光缆综合供应商",
  mappings: [
    { sectorSlug: "optical-network", sectorName: "光通信网络", sectorShortName: "光通信", role: "core", rationale: "提供光通信系统、传输与接入设备。" },
    { sectorSlug: "fiber-cable", sectorName: "光纤光缆", sectorShortName: "光纤光缆", role: "core", rationale: "覆盖光纤、光缆及相关器件的研发、生产与销售。" },
  ],
};

const evidence: AnnualBusinessEvidence = {
  report: {
    title: "烽火通信2025年年度报告",
    publishedAt: "2026-04-18",
    reportYear: "2025",
    sourceUrl: "https://example.com/600498-2025.pdf",
  },
  nameEn: "FiberHome Telecommunication Technologies Co., Ltd.",
  coreBusiness: "公司长期从事信息通信网络产品与解决方案的研发、生产和销售，业务覆盖光网络、宽带接入及数据通信等领域。公司面向运营商和行业客户提供传输、接入、承载与网络服务，并开展光纤、光缆及相关器件的研发、生产和销售。",
};

test("从年度报告主营业务章节提取核心业务正文", () => {
  const content = `公司的外文名称 FIBERHOME TELECOMMUNICATION TECHNOLOGIES Co., Ltd.\n公司的外文名称缩写 FIBERHOME\n报告期内公司从事的主要业务\n（一）公司长期从事信息通信网络产品与解决方案的研发、生产和销售，业务覆盖光网络、宽带接入及数据通信等领域。\n（二）公司面向运营商和行业客户提供传输、接入、承载与网络服务，并开展光纤、光缆及相关器件的研发、生产和销售。\n（三）公司持续推进通信设备核心技术研发，为客户提供端到端网络解决方案与运维服务。\n主要经营模式\n公司采用研发、生产、销售和服务一体化模式。`;
  const extracted = extractCoreBusiness(content);
  assert.match(extracted, /信息通信网络产品与解决方案/);
  assert.match(extracted, /光纤、光缆/);
  assert.doesNotMatch(extracted, /主要经营模式/);
});

test("主营业务提取排除控制权和公司治理披露", () => {
  const content = `报告期内公司从事的主要业务
公司研发、生产和销售液冷数据中心基础设施产品，并提供系统集成和技术服务。
公司接到控股股东关于控制权变化的通知，实际控制人变更为无实际控制人。
公司拥有完善的法人治理结构，本次变化不影响公司的生产经营和持续发展。
公司冷板液冷和浸没液冷产品应用于高密度算力中心。
主要经营模式`;
  const extracted = extractCoreBusiness(content);
  assert.match(extracted, /液冷数据中心基础设施产品/);
  assert.match(extracted, /高密度算力中心/);
  assert.doesNotMatch(extracted, /控股股东|控制权|实际控制人|法人治理/u);
});

test("生成、翻译并校验覆盖全部产业映射的主营业务资料", async () => {
  const draft = composeAnnualBusinessProfile(company, evidence.report, evidence.coreBusiness);
  const businessSummary = draft.summary;
  const translations = new Map([
    [businessSummary, "According to the 2025 annual report, the company develops, manufactures and sells information and communications network products and solutions, including optical networks, broadband access and data communications."],
    [company.thesis, "An integrated supplier of optical communications systems, optical fiber and cable products."],
    [draft.mappings[0].detail, "Provides optical communications systems and transmission and access equipment."],
    [draft.mappings[1].detail, "Develops, manufactures and sells optical fiber, cable and related components."],
  ]);
  const translated = await translateAnnualBusinessProfile(company, evidence, draft, async text => translations.get(text) ?? "");
  const validated = validateProfileResult(translated, company);
  assert.equal(validated.nameEn, evidence.nameEn);
  assert.equal(validated.profile.summaryEn.includes("annual report"), true);
  assert.doesNotMatch(validated.profile.summary, /产业链跟踪重点/u);
  assert.doesNotMatch(validated.profile.summaryEn, /Industry-chain tracking focus/iu);
  assert.deepEqual(validated.profile.mappings.map(item => item.sectorSlug), ["optical-network", "fiber-cable"]);
  assert.equal(validated.profile.mappings.every(item => item.sources[0].url === evidence.report.sourceUrl), true);
});

test("拒绝缺少产业映射或含中文的英文结果", async () => {
  const draft = composeAnnualBusinessProfile(company, evidence.report, evidence.coreBusiness);
  await assert.rejects(
    translateAnnualBusinessProfile(company, evidence, draft, async () => "English 译文"),
    /英文翻译校验失败/,
  );
  const validDraft = { ...draft, summaryEn: "English summary", mappings: draft.mappings.slice(0, 1).map(item => ({ ...item, detailEn: "English detail" })) };
  assert.throws(
    () => validateProfileResult({ profile: validDraft, nameEn: evidence.nameEn, thesisEn: "English thesis" }, company),
    /产业映射与主营业务资料不一致/,
  );
});

test("任务状态只接受完整且可识别的数据", () => {
  const now = new Date().toISOString();
  const job = { id: "600498-1-abcd1234", code: "600498", status: "running", stage: "translate", progress: 65, attempt: 2, createdAt: now, updatedAt: now, completedAt: null, error: null };
  assert.deepEqual(parseCompanyProfileJob(JSON.stringify(job)), job);
  assert.equal(parseCompanyProfileJob(JSON.stringify({ ...job, progress: 120 })), null);
  assert.equal(parseCompanyProfileJob(JSON.stringify({ ...job, code: "60049" })), null);
});

test("详细主营业务按完整句子分段翻译并重新合并", async () => {
  const source = "公司研发并销售算力网络产品与解决方案。".repeat(120);
  const received: string[] = [];
  const result = await translateTextInChunks(source, async chunk => {
    received.push(chunk);
    return `Translated section ${received.length}.`;
  }, 180);
  assert.equal(received.length > 1, true);
  assert.equal(received.every(chunk => chunk.length <= 180 && chunk.endsWith("。")), true);
  assert.equal(received.join(""), source);
  assert.match(result, /^Translated section 1\./);
});

test("失败重试生成新任务，旧任务不能覆盖新任务状态", async () => {
  const values = new Map<string, string>();
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      return {
        bind(...next: unknown[]) { args = next; return this; },
        async first() { return sql.startsWith("SELECT") && values.has(String(args[0])) ? { value: values.get(String(args[0])) } : null; },
        async run() { values.set(String(args[0]), String(args[1])); return { success: true }; },
      };
    },
  } as unknown as D1Database;
  const first = await queueCompanyProfileJob(db, "600498");
  assert.equal(first.attempt, 1);
  assert.equal((await updateCompanyProfileJob(db, "600498", first.id, { status: "failed", error: "上游暂不可用" }))?.status, "failed");
  const retry = await queueCompanyProfileJob(db, "600498");
  assert.equal(retry.attempt, 2);
  assert.equal(await updateCompanyProfileJob(db, "600498", first.id, { status: "completed" }), null);
  assert.equal(parseCompanyProfileJob(values.get("company-profile-job:600498"))?.id, retry.id);
});
