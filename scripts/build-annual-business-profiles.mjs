import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatAnnualBusinessSummary } from "../lib/annual-business-text.mjs";

const root = resolve(import.meta.dirname, "..");
const dbPath = resolve(root, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite");
const extracts = JSON.parse(readFileSync(resolve(root, "docs/research/2026-09-01-annual-business-pdf-extracts.json"), "utf8"));
const review = JSON.parse(readFileSync(resolve(root, "data/research/2026-08-31-cross-sector-review.json"), "utf8"));
const translations = JSON.parse(readFileSync(resolve(root, "data/research/2026-09-01-annual-business-translations.json"), "utf8"));
const outputPath = resolve(root, "data/research/2026-09-01-annual-business-profiles.json");

const audit = new Map(review.companyAudit.map(item => [item.code, item]));
const additional = new Map(review.mappings.map(item => [`${item.code}:${item.sector}`, item]));
const translationsByCode = new Map(translations.profiles.map(item => [item.code, item]));
const manualSummaries = {
  "000066": "根据2025年年度报告，公司业务分为计算产业、系统装备及其他业务。计算产业围绕自主智算形成从计算芯片、关键部件、台式机、笔记本、服务器、网络交换设备到应用系统的产品谱系，并面向党政、金融、能源、电信、交通和教育等行业提供解决方案；系统装备覆盖专用通信、特种计算和海洋信息化。算力产业链重点包括自主服务器、智算终端、算力网络及服务器电源。",
  "002409": "根据2025年年度报告，公司电子材料业务覆盖半导体前驱体材料、显示及半导体用光刻胶材料、电子级硅微粉等产品，并保留聚氨酯保温材料等传统业务。半导体前驱体用于高端存储芯片和逻辑芯片制程，光敏树脂及相关材料服务显示与半导体客户；公司通过自主研发和与芯片、显示客户协同验证推进产品产业化。",
  "300567": "根据2025年年度报告，公司主营业务聚焦半导体、显示和新能源三类检测系统的研发、生产与销售。半导体产品覆盖前道量检测、后道电测、先进封装量检测及核心器件，包括膜厚量测、光学关键尺寸量测、电子束缺陷检测、明场光学缺陷检测和自动测试设备，用于晶圆制造、封装测试及良率控制。",
  "300602": "根据2025年年度报告，公司研发、设计、生产电磁屏蔽材料与器件、热管理材料与器件、基站天线、防护功能器件、轻量化材料及功能组件，并提供整体解决方案。热管理产品包括导热界面材料、石墨散热材料、散热模组、风扇、均温板、热管、液冷板和冷却液分配单元，面向服务器、数据中心、通信设备、新能源汽车及储能等场景。",
  "300655": "根据2025年年度报告，公司业务覆盖高纯化学品、光刻胶、锂电池材料和工业化学品。半导体材料侧重点包括电子级双氧水、氨水、硝酸等超纯湿电子化学品，以及I-line等光刻胶及配套清洗材料，用于晶圆制造中的光刻、清洗和蚀刻工艺；同时经营锂电池粘结材料和工业硫酸等产品。",
  "600050": "根据2025年年度报告，公司以联网通信为基础，经营移动、固网宽带和产业互联网服务，并将算网数智作为增长重点。面向政企客户提供联通云、数据中心、智算资源、算力网络、大数据、物联网及行业数字化解决方案；在算力产业链中同时对应运营商云与算力服务、IDC/AIDC基础设施和智算资源运营。",
  "601728": "根据2025年年度报告，公司主营移动通信、固网及智慧家庭、产业数字化等综合信息服务。产业数字化业务依托天翼云、数据中心、算力网络和安全能力，为政企客户提供云计算、智算资源、机柜托管、网络连接及行业解决方案；公司在全国布局云和算力基础设施，因此同时覆盖运营商云、IDC/AIDC和算力服务环节。",
  "603118": "根据2025年年度报告，公司产品覆盖PON、AP、DSL、小基站、FWA和机顶盒等网通设备，交换机、服务器、核心路由器等数通设备，以及汽车电子和智能硬件制造。网通及数通业务主要采用ODM、JDM、OEM和EMS模式，为通信设备商及运营商提供宽带接入、数据通信终端和服务器的研发、生产与交付服务。",
  "603228": "根据2025年年度报告，公司专业从事印制电路板研发、生产和销售，产品矩阵包括多层板、HDI、高多层板、柔性线路板、金属基线路板及刚挠结合板。通信与数据基础设施产品面向AI加速卡、通用及AI服务器、高速交换机、400G/800G/1.6T光模块和存储设备，并提供高层数、厚铜电源板及高阶HDI等方案。",
  "688047": "根据2025年年度报告，公司主营处理器及配套芯片的研制、销售和技术服务，并提供基础软硬件解决方案。产品以龙芯自主指令系统为基础，覆盖面向服务器和个人计算机的处理器、面向工控和嵌入式设备的芯片，以及桥片和安全模块等配套芯片，应用于政企终端、服务器、工业控制、网络通信和信息化设备。",
  "688106": "根据2025年年度报告，公司从事特种气体和大宗气体的研发、生产、销售与综合供气服务。半导体相关产品包括超纯氨、高纯氧化亚氮、电子级正硅酸乙酯、高纯二氧化碳和高纯氢等电子特气，以及氮、氧、氩、氦等电子大宗载气，可通过现场制气、管道供气和瓶装配送等方式服务晶圆制造及泛半导体客户。",
  "688668": "根据2025年年度报告，公司研发、生产高速通信连接器及组件和汽车连接器及组件。通信产品包括高速背板连接器、I/O连接器、高速铜缆连接器、精密壳体、散热器和液冷散热器，最终应用于服务器、数据中心和通信基站；报告期内112G系列需求增长，224G系列开始量产。汽车产品主要服务新能源汽车电控、电池和高压连接场景。",
};
const preferred = /主营业务|主要业务|主要从事|主要产品|产品包括|业务包括|业务涵盖|产品体系|提供|服务于|应用于|覆盖|研发、生产|研发、设计|研发、制造|生产和销售|投资、建设|运营/;
const lowValue = /愿景|使命|价值观|荣获|获评|获得.*称号|营业收入|净利润|每股收益|同比|市场规模|行业发展|行业情况|所处行业|竞争格局|宏观|政策/;

function cleanSection(value) {
  return String(value ?? "")
    .replace(/\r/g, "\n")
    .replace(/[\u00a0\t ]+/g, " ")
    .replace(/[^\n]{0,45}20\s*25\s*年年度报告(?:全文)?\s*\d*\s*\/\s*\d*/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/^(?:报告期内公司(?:所)?从事的(?:主要)?业务(?:、经营模式、行业情况说明)?|发行人主营业务情况|主营业务(?:概况|基本情况)?|主要产品及服务)\s*/u, "")
    .trim();
}

function annualSummary(record, company) {
  const positioning = company.existingThesis.replace(/[。；]$/, "");
  if (manualSummaries[record.code]) return formatAnnualBusinessSummary(manualSummaries[record.code]);
  const cleaned = cleanSection(record.sectionText);
  const boundary = cleaned.search(/(?:新增重要非主营业务情况|\n?\s*[（(][二2][）)]\s*主要经营模式|\n?\s*二[、.]\s*报告期内公司所处行业)/);
  const business = (boundary > 260 ? cleaned.slice(0, boundary) : cleaned).slice(0, 10_000);
  const companyLead = new RegExp(`^(?:${company.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${company.name.replace(/[-—][WU].*$/, "")})`);
  const sentences = business.replace(/\n+/g, " ")
    .split(/(?<=[。！？])/)
    .map(sentence => sentence
      .replace(/^\s*[（(]?[一二三四五六七八九十0-9]+[）)、.．]?\s*/, "")
      .replace(/^(?:公司主营业务|主营业务概况|主要业务、主要产品或服务情况|主要业务及产品|主要业务)\s*/, "")
      .trim())
    .filter(sentence => sentence.length >= 24 && sentence.length <= 500)
    .filter(sentence => (sentence.match(/\d/g) ?? []).length < Math.max(16, sentence.length * .22))
    .filter(sentence => /[。！？；]$/.test(sentence))
    .filter(sentence => companyLead.test(sentence) || /^(?:报告期内[，,]?|公司|本公司|集团|作为|目前[，,]?|主要业务|主营业务|核心产品|主要产品|公司产品|产品主要|产品包括|业务主要|业务包括|覆铜板|在[^，,]{2,22}领域)/.test(sentence))
    .filter(sentence => !/^公司需遵守|^公司秉承|^公司坚持|^公司将/.test(sentence))
    .filter(sentence => !lowValue.test(sentence) || preferred.test(sentence));
  const ranked = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: (preferred.test(sentence) ? 4 : 0) + (/产品|业务|服务/.test(sentence) ? 2 : 0) + (/应用|客户|场景|解决方案/.test(sentence) ? 1 : 0) - (lowValue.test(sentence) ? 2 : 0),
  })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 5).sort((a, b) => a.index - b.index);
  const selected = [];
  let length = 0;
  for (const item of ranked) {
    if (selected.some(value => value.includes(item.sentence) || item.sentence.includes(value))) continue;
    if (length + item.sentence.length > 560 && length >= 220) continue;
    selected.push(item.sentence);
    length += item.sentence.length;
    if (length >= 340 && selected.length >= 2) break;
  }
  const annual = selected.join("").replace(/\s+/g, " ").trim();
  let summary = annual
    ? `根据${record.reportYear || "2025"}年${record.sourceType === "prospectus" ? "招股书" : "年度报告"}，${annual}`
    : `根据${record.reportYear || "2025"}年${record.sourceType === "prospectus" ? "招股书" : "年度报告"}及主营业务披露，公司在算力产业链中提供相关产品与服务。`;
  const evidence = (company.additionalSectors ?? []).map(slug => additional.get(`${record.code}:${slug}`)?.evidence).filter(Boolean);
  for (const detail of evidence) {
    if (summary.length + positioning.length + 12 >= 320) break;
    summary += ` ${detail}`;
  }
  return formatAnnualBusinessSummary(polishSummary(summary.slice(0, 720)));
}

function polishSummary(value) {
  let output = value.replace(/[\p{Script=Han}（）()·]{2,55}\s*2025\s*年年度报告(?:全文)?\s*[—-]?\s*\d+\s*[—-]?/gu, " ");
  for (let index = 0; index < 3; index += 1) output = output.replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, "$1");
  return output.replace(/\s+/g, " ").replace(/，\s+/g, "，").replace(/。\s+/g, "。").trim();
}

function publishedDate(record) {
  const urlDate = record.sourceUrl?.match(/\/(20\d{2})-(\d{2})-(\d{2})\//);
  if (urlDate) return `${urlDate[1]}-${urlDate[2]}-${urlDate[3]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(record.publishedAt ?? "")) return record.publishedAt;
  if (/^\d{10,13}$/.test(record.publishedAt ?? "")) return new Date(Number(record.publishedAt) * (record.publishedAt.length === 10 ? 1000 : 1)).toISOString().slice(0, 10);
  return null;
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = db.prepare(`SELECT c.code,c.name,c.thesis,s.slug sector_slug,s.name sector_name,s.short_name sector_short_name,cs.role,cs.rationale
  FROM companies c JOIN company_sectors cs ON cs.company_id=c.id JOIN sectors s ON s.id=cs.sector_id
  WHERE c.active=1 AND s.active=1 ORDER BY c.code,s.sort_order,cs.sort_order`).all();
db.close();
const mappingsByCode = Map.groupBy(rows, row => row.code);

const companies = extracts.records.map(record => {
  if (record.status !== "extracted" || !record.sourceUrl || !record.sectionText) throw new Error(`Incomplete annual disclosure: ${record.code}`);
  const company = audit.get(record.code);
  if (!company) throw new Error(`Missing company audit: ${record.code}`);
  const translation = translationsByCode.get(record.code);
  if (!translation) throw new Error(`Missing annual-business translation: ${record.code}`);
  const mappings = (mappingsByCode.get(record.code) ?? []).map(mapping => {
    const research = additional.get(`${record.code}:${mapping.sector_slug}`);
    const detail = research?.evidence ?? company.existingThesis ?? mapping.rationale;
    const mappingTranslation = translation.mappings.find(item => item.sectorSlug === mapping.sector_slug);
    if (!mappingTranslation || mappingTranslation.sourceDetail !== detail || !mappingTranslation.detailEn) throw new Error(`Stale annual-business translation: ${record.code}:${mapping.sector_slug}`);
    const sources = research?.sources?.length ? research.sources : [{ url: record.sourceUrl, title: record.reportTitle, publishedAt: publishedDate(record) }];
    return {
      sectorSlug: mapping.sector_slug, sectorName: mapping.sector_name, sectorShortName: mapping.sector_short_name,
      role: mapping.role, detail, detailEn: mappingTranslation.detailEn, boundary: research?.risk ?? null, sources,
    };
  });
  const summary = annualSummary(record, company);
  const translatedSourceSummary = formatAnnualBusinessSummary(translation.sourceSummary);
  if (translatedSourceSummary !== summary || !translation.summaryEn) throw new Error(`Stale annual-business summary translation: ${record.code}\nsource=${translatedSourceSummary}\ngenerated=${summary}`);
  return {
    code: record.code, name: record.name, reportYear: record.reportYear || "2025", reportTitle: record.reportTitle,
    publishedAt: publishedDate(record), sourceType: record.sourceType ?? "annual_report", sourceUrl: record.sourceUrl,
    reviewedAt: "2026-09-02", summary, summaryEn: formatAnnualBusinessSummary(translation.summaryEn, { locale: "en" }), mappings,
  };
});

const payload = {
  reviewedAt: "2026-09-02",
  methodology: "Latest complete 2025 annual-report core-business disclosure; prospectus fallback only where no listed-company annual report exists. Governance, ownership, corporate-history, promotional, financial-performance and industry-chain tracking-focus disclosures are excluded.",
  companies,
};
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, companies: companies.length, mappings: companies.reduce((sum, item) => sum + item.mappings.length, 0), minSummary: Math.min(...companies.map(item => item.summary.length)), maxSummary: Math.max(...companies.map(item => item.summary.length)) }));
