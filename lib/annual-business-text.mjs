const FIGURE_CAPTION = /^\s*(?:图(?:片|表)?\s*\d*|示意图|figure\s*\d*)\s*[:：]/iu;
const SECTION_OR_PROSE_START = /^\s*(?:(?:\d+|[一二三四五六七八九十]+)[.．、]|[（(][一二三四五六七八九十\d]+[）)]|(?:公司|本公司|报告期内|目前|其中|上述|该(?:公司|系统|业务|产品)|依托|截至|20\d{2}\s*年))/u;
const FIGURE_REFERENCE = /(?:如[上下]图(?:所示)?|见下图|参见下图)/u;

function captionPayload(line) {
  return line.replace(FIGURE_CAPTION, "").trim();
}

function stripCaptionLines(block) {
  const lines = block.split("\n");
  const kept = [];
  let removedCaption = false;
  let skippingCaption = false;
  let forceSkipContinuation = false;

  for (const line of lines) {
    if (FIGURE_CAPTION.test(line)) {
      removedCaption = true;
      skippingCaption = true;
      forceSkipContinuation = captionPayload(line).length <= 2;
      continue;
    }
    if (!skippingCaption) {
      kept.push(line);
      continue;
    }
    if (forceSkipContinuation && line.trim()) {
      forceSkipContinuation = false;
      continue;
    }
    if (SECTION_OR_PROSE_START.test(line)) {
      skippingCaption = false;
      kept.push(line.replace(/^\s*(?:\d+|[一二三四五六七八九十]+)[.．、]\s*/u, ""));
    }
  }
  return { text: kept.join("\n").trim(), removedCaption };
}

export function removeFigureReferences(value) {
  let output = String(value ?? "");
  // Remove only the clause that points to an absent figure, retaining useful
  // text before the preceding comma where possible.
  output = output.replace(new RegExp(`[，,][ \\t]*[^\uff0c,\u3002！？；：\\n]{0,100}${FIGURE_REFERENCE.source}[：:]?[ \\t]*`, "gu"), "。");
  output = output.replace(new RegExp(`(^|[\u3002！？；：\\n])[ \\t]*[^\uff0c,\u3002！？；：\\n]{0,100}${FIGURE_REFERENCE.source}[：:]?[ \\t]*(?:(?:\\d+|[一二三四五六七八九十]+)[.．、][ \\t]*)?`, "gu"), "$1");
  return output;
}

export function cleanAnnualBusinessSection(value) {
  const normalized = String(value ?? "").replace(/\r/g, "\n");
  const keptBlocks = [];
  let afterCaption = false;
  for (const block of normalized.split(/\n\s*\n/)) {
    const cleaned = stripCaptionLines(block);
    if (cleaned.removedCaption) afterCaption = true;
    if (!cleaned.text) continue;
    const reportHeader = /20\s*\d{2}\s*年年度报告/u.test(cleaned.text) && cleaned.text.length <= 100;
    if (afterCaption && reportHeader) {
      keptBlocks.push(cleaned.text);
      continue;
    }
    const text = afterCaption
      ? cleaned.text.replace(/^\s*(?:\d+|[一二三四五六七八九十]+)[.．、]\s*/u, "")
      : cleaned.text;
    keptBlocks.push(text);
    afterCaption = false;
  }
  const withoutCaptions = keptBlocks.join("\n\n");
  return removeFigureReferences(withoutCaptions);
}

function collapseRepeatedSectionLead(value) {
  for (let width = Math.min(8, Math.floor(value.length / 2)); width >= 2; width -= 1) {
    const repeatedAt = value.indexOf(value.slice(0, width), width);
    if (repeatedAt > 0) return value.slice(repeatedAt);
  }
  return value;
}

export function cleanAnnualBusinessSummary(value) {
  let output = removeFigureReferences(value);
  output = output.replace(/,\s*as shown in (?:the )?figure below\s*:\s*/giu, ". ");
  output = output.replace(/(^|[.!?]\s+)the characteristics of [^.!?]{0,160}? (?:are|is) as shown in (?:the )?figure below\s*:\s*/giu, "$1");
  output = output.replace(/(^|[.!?;]\s*)figure\s*\d*\s*:\s*[^.!?;]{0,240}?(?:\d+\.\s*|(?=(?:the\s+)?company(?:'s|\s)))/giu, "$1");
  output = output.replace(/the process flow of [^.!?;]{0,140}? is as follows\s*:\s*\d+\.\s*/giu, "");
  output = output.replace(/in terms of server and peripheral remanufacturing server remanufacturing business/giu, "in the server and peripheral remanufacturing business");
  output = output.replace(/([.!?]\s+)in the server and peripheral remanufacturing business/giu, "$1In the server and peripheral remanufacturing business");
  output = output.replace(/([.!?]\s+)company's\s+/giu, "$1The company's ");
  output = output.replace(/(^|[。！？；]\s*)(?:图(?:片|表)?\s*\d*|示意图)\s*[:：][^。！？；]{0,240}?(?:\d+|[一二三四五六七八九十]+)[.．、]\s*([^。！？；]{2,70}?业务方面[，,])/gu, (_match, boundary, sectionLead) => `${boundary}${collapseRepeatedSectionLead(sectionLead)}`);
  output = output.replace(/(^|[。！？；]\s*)(?:图(?:片|表)?\s*\d*|示意图)\s*[:：][^。！？；]{0,240}?(?:\d+|[一二三四五六七八九十]+)[.．、]\s*(?=[\p{Script=Han}A-Za-z])/gu, "$1");
  output = output.replace(/(^|[。！？；]\s*)(?:图(?:片|表)?\s*\d*|示意图)\s*[:：][^。！？；]{0,160}?(?=(?:公司(?:的|所|在|目前|主要|致力于)|本公司|报告期内|目前|其中|上述))/gu, "$1");
  output = output.replace(/(^|[。！？；]\s*)(?:图(?:片|表)?\s*\d*|示意图)\s*[:：][^。！？；]{0,240}(?=[。！？；]|$)/gu, "$1");
  return output.trim();
}

const ZH_TRACKING_START = /(?:产业链跟踪重点(?:为)?|(?:算力|计算力)产业链重点包括)\s*[：:]?\s*/u;
const EN_TRACKING_START = /(?:(?:the\s+)?focus\s+of\s+(?:the\s+)?(?:industrial|industry)\s+chain\s+tracking\s+is|(?:the\s+)?(?:industrial|industry)\s+chain\s+tracking\s+focuses\s+on|(?:the\s+)?computing\s+power\s+industry\s+chain\s+focuses\s+on|industry-chain\s+tracking\s+focus)\s*:?\s*/iu;

const ZH_GOVERNANCE_DISCLOSURE = /控股股东|实际控制人|控制权|股权结构|股权变动|股份变动|股份质押|股份减持|董事会构成|董事会成员|法人治理|公司治理|上市公司规范化运作|公司章程|股东大会|股东权利|注册资本|注册地址|中介机构|保荐机构|会计师事务所|独立性产生影响|损害公司利益/u;
const EN_GOVERNANCE_DISCLOSURE = /controlling shareholder|actual controller|control rights?|change(?:s)? of control|shareholding structure|changes? in shares?|share pledge|share reduction|board of directors|corporate governance|legal person governance|articles of association|shareholders?['’]? meeting|shareholders?['’]? rights?|registered capital|registered address|sponsor(?:ing)? institution|accounting firm|integrity and independence|harm (?:the )?company['’]?s interests/iu;
const ZH_HISTORY_OR_PROMOTION = /成立于|创立于|自\s*\d{4}\s*年成立以来|脱胎于|证券交易所上市|登陆资本市场|使命|愿景|价值观|荣获|获评|被评定|入选.+(?:企业|榜单|名单)|百强企业|保驾护航/u;
const EN_HISTORY_OR_PROMOTION = /was (?:established|founded)|since (?:its )?(?:establishment|founding)|was spun out of|listed on the .+ stock exchange|(?:with|as) (?:its|the) mission (?:of|to)|(?:with|has|its|corporate|company['’]s) (?:the )?vision (?:of|to)|global vision and layout|innovation-driven company|core values?|core capabilities lead|continuous and large-scale iterative investment|after years of development and long-term accumulation|formed relative competitive advantages|good reputation and brand influence|was (?:rated|named|selected) (?:as|into|for)|won (?:the )?award|top 100|successfully escorted many major events|provided support for (?:the )?g20/iu;
const ZH_FINANCIAL_PERFORMANCE = /营业收入|净利润|每股收益|毛利率|同比(?:增长|下降|上升)|收入占比|贡献收入|利润率|总营收|营收(?:比重|占比)|第二增长曲线/u;
const EN_FINANCIAL_PERFORMANCE = /operating performance during the reporting period|operating revenue|net profit|earnings per share|gross profit margin|year-on-year|revenue (?:share|contribution)|accounted for .+ revenue|proportion of .+ revenue|total revenue|profit margin|second growth curve/iu;
const ZH_STRONG_BUSINESS = /主营业务|主要业务|业务|产品|服务|研发|研究|开发|设计|生产|制造|销售|运营|经营模式|解决方案|设备|芯片|材料|系统|平台|客户|应用|产能|出货|市场份额|技术|数据中心|算力|服务器|网络|存储|光模块|连接器|印制电路板|PCB/u;
const EN_STRONG_BUSINESS = /main business|business|products?|services?|research|develop|design|produc|manufactur|sales|operat|business model|solutions?|equipment|chips?|materials?|systems?|platforms?|customers?|applications?|capacity|shipments?|market share|technolog|data cent(?:er|re)|computing|servers?|networks?|storage|optical modules?|connectors?|printed circuit boards?|PCB/iu;

function sentenceUnits(value, locale) {
  const text = String(value ?? "");
  if (locale !== "en") return text.match(/[^。！？]+[。！？]+|[^。！？]+$/gu) ?? [];
  const units = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (!/[.!?]/u.test(character)) continue;
    if (character === "." && /\d/u.test(text[index - 1] ?? "") && /\d/u.test(text[index + 1] ?? "")) continue;
    const following = text.slice(index + 1).match(/^\s*([^\s]?)/u)?.[1] ?? "";
    if (character === "." && /[,;:)]/u.test(following)) continue;
    const previousToken = text.slice(start, index).match(/([A-Za-z]+)$/u)?.[1] ?? "";
    if (character === "." && (/^(?:co|ltd|inc|corp|dr|mr|ms|no|vs|etc)$/iu.test(previousToken) || /^[A-Z]$/u.test(previousToken))) continue;
    units.push(text.slice(start, index + 1));
    start = index + 1;
  }
  if (start < text.length) units.push(text.slice(start));
  return units;
}

function stripChineseNonBusinessLead(sentence) {
  return sentence
    .replace(/^公司成立于\s*\d{4}\s*年[，,]\s*(?=主要从事|是一家)/u, "公司")
    .replace(/^报告期内经营业绩情况[：:][^。]{0,36}?报告期内[，,]?\s*/u, "报告期内，")
    .replace(/^公司业务概述[：:][^。]{0,36}?公司/u, "公司")
    .replace(/^主要产品及用途报告期内[，,]?\s*/u, "报告期内，");
}

function stripEnglishNonBusinessLead(sentence) {
  return sentence
    .replace(/^\s*the company was (?:established|founded) in \d{4}\s+and\s+(?=is mainly engaged)/iu, "The company ")
    .replace(/^\s*operating performance during the reporting period\s*:\s*[^.]{0,70}?during the reporting period,?\s*/iu, "During the reporting period, ")
    .replace(/^\s*the company['’]?s business overview\s*:\s*[^.]{0,70}?the company\s*/iu, "The company ");
}

export function cleanBusinessOnlyText(value, locale = "zh") {
  const english = locale === "en";
  const cleaned = cleanAnnualBusinessSummary(value).replace(/\s+/g, " ").trim();
  const introPattern = english
    ? /^(According to (?:the )?20\d{2} (?:annual report|prospectus)(?: and main business disclosures)?,\s*)/iu
    : /^(根据20\d{2}年(?:年度报告|招股书)(?:及主营业务披露)?[，,]\s*)/u;
  const intro = cleaned.match(introPattern)?.[1] ?? "";
  const body = intro ? cleaned.slice(intro.length) : cleaned;
  const kept = [];
  for (const rawUnit of sentenceUnits(body, english ? "en" : "zh")) {
    let unit = english ? stripEnglishNonBusinessLead(rawUnit.trim()) : stripChineseNonBusinessLead(rawUnit.trim());
    if (!unit) continue;
    if ((english ? EN_GOVERNANCE_DISCLOSURE : ZH_GOVERNANCE_DISCLOSURE).test(unit)) continue;
    if ((english ? EN_HISTORY_OR_PROMOTION : ZH_HISTORY_OR_PROMOTION).test(unit)) continue;
    if ((english ? EN_FINANCIAL_PERFORMANCE : ZH_FINANCIAL_PERFORMANCE).test(unit)) continue;
    if (!(english ? EN_STRONG_BUSINESS : ZH_STRONG_BUSINESS).test(unit)) continue;
    kept.push(unit);
  }
  let joined = kept.join(english ? " " : "").replace(/\s+/g, " ").trim();
  if (english && intro) joined = joined.replace(/^It\b/u, "the company").replace(/^The\b/u, "the");
  return `${intro}${joined}`.trim();
}

function splitTrackingFocus(value, locale) {
  const pattern = locale === "en" ? EN_TRACKING_START : ZH_TRACKING_START;
  const match = pattern.exec(value);
  if (!match) return { body: value, focus: "" };
  const before = value.slice(0, match.index).trim();
  const after = value.slice(match.index + match[0].length).trim();
  let focusEnd = after.length;
  for (let index = 0; index < after.length; index += 1) {
    const character = after[index];
    if (locale === "en" && character === "." && /\d/u.test(after[index - 1] ?? "") && /\d/u.test(after[index + 1] ?? "")) continue;
    if ((locale === "en" ? /[.!?]/u : /[。！？]/u).test(character)) { focusEnd = index + 1; break; }
  }
  const focus = after.slice(0, focusEnd).trim();
  const remainder = after.slice(focusEnd).trim();
  const body = [before, remainder].filter(Boolean).join(locale === "en" ? " " : "");
  return { body, focus };
}

export function formatAnnualBusinessSummary(value, { locale = "zh" } = {}) {
  const normalized = cleanAnnualBusinessSummary(value);
  const split = splitTrackingFocus(normalized, locale);
  return cleanBusinessOnlyText(split.body, locale);
}

export const annualBusinessNonBusinessPattern = new RegExp(`${ZH_GOVERNANCE_DISCLOSURE.source}|${ZH_HISTORY_OR_PROMOTION.source}|${ZH_FINANCIAL_PERFORMANCE.source}`, "u");
export const annualBusinessEnglishNonBusinessPattern = new RegExp(`${EN_GOVERNANCE_DISCLOSURE.source}|${EN_HISTORY_OR_PROMOTION.source}|${EN_FINANCIAL_PERFORMANCE.source}`, "iu");

export const annualBusinessFigureArtifactPattern = /(?:^|[\u3002！？；\n]\s*)(?:图(?:片|表)?\s*\d*|示意图)\s*[:：]|(?:如[上下]图(?:所示)?|见下图|参见下图)|(?:^|[.!?;]\s*)figure\s*\d*\s*:|as shown in (?:the )?figure below/iu;
