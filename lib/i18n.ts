import type { Locale } from "../app/components/LanguageProvider";

export const financialCopy = {
  zh: {
    title: "主营业务与财务", subtitle: "2023 年至今 · 经营、盈利与现金流", business: "主营业务", original: "中文原文", sourceCompanyName: "现用简称", mappingBusiness: "产业环节对应业务", annualSource: "年报来源", prospectusSource: "招股书来源", publishedAt: "披露日期", translationNote: "", core: "产业龙头", candidate: "活跃候选",
    loading: "正在读取公司主营业务与财务数据…", error: "财务数据暂时无法连接，不影响其他模块。", retry: "重新获取", unavailable: "暂无可核验的财务记录。",
    businessUnavailable: "暂未取得可核验的主营业务介绍。", businessTranslationPending: "主营业务介绍的英文翻译待更新。",
    reports: "报告期累计", quarter: "单季度", half: "半年", annual: "全年",
    allYears: "全部年份", year: "年份", view: "财务数据口径", period: "统计期间", revenue: "营业总收入", operatingRevenue: "营业收入", revenueGeneral: "收入", profit: "归母净利润", unit: "亿元", tableUnit: "金额：亿元人民币 · 比率：%", latest: "最新报告期", fetched: "数据更新时间", businessFetched: "资料更新时间",
    operatingMargin: "营业利润率", netMargin: "净利率", grossMargin: "毛利率", weightedRoe: "加权 ROE", roeHelp: "加权平均净资产收益率，不作年化处理",
    operatingCashFlow: "经营活动现金流净额", cash: "货币资金", totalAssets: "总资产", debtRatio: "资产负债率", revenueGrowth: "营收同比", profitGrowth: "归母净利润同比", yoy: "同比", endBalance: "期末余额", cumulativeBasis: "本年累计 · 未年化",
    performance: "经营业绩", profitability: "盈利能力", financialPosition: "现金流与财务状况", category: "财务指标分类",
    window: "报告期末范围", emptyView: "此年份或口径下暂无可核验数据。", missing: "— 表示数据不足或指标不适用，不代表零。",
    derivedRatios: "单季度及下半年的毛利率、净利率、加权 ROE 缺少可核验的独立口径，显示为 —；第一季度和上半年保留已披露数值。",
    balanceNote: "现金流对应所选统计期间；货币资金、总资产和资产负债率均为该报告期末数值。",
    notesTitle: "指标口径说明", notes: "收入采用营业总收入，利润采用归母净利润。报告期累计从当年 1 月 1 日起算；Q2/Q3/Q4 由相邻累计金额相减，下半年由全年减上半年。差额可能包含追溯调整。同比比较去年相同期间；亏损或零基数不显示易产生误解的增长率。",
    marginNotes: "累计期间的毛利率、净利率、营业利润率和加权 ROE 沿用已取得的指标值，不重算或年化。单季度、下半年仅用对应期间营业利润÷营业总收入计算营业利润率；不对累计比率相减、平均或反推利润。缺少必要字段、收入小于等于零时不计算该比率。资产负债数据不做差额。",
    reportCount: "个报告期", periodNames: { Q1: "第一季度", Q2: "第二季度", Q3: "第三季度", Q4: "第四季度", H1: "上半年", H2: "下半年", "9M": "前三季度", FY: "全年" },
    growthStatus: { normal: "", turn_profit: "扭亏为盈", turn_loss: "转为亏损", loss_narrowed: "亏损收窄", loss_widened: "亏损扩大", unchanged: "持平", zero_base: "上年同期为零", missing: "—" },
  },
  en: {
    title: "Business & Financials", subtitle: "Financial performance since 2023", business: "Principal Business", original: "Original Chinese", sourceCompanyName: "Current name", mappingBusiness: "Business by Industry Segment", annualSource: "Annual report", prospectusSource: "Prospectus", publishedAt: "Published", translationNote: "English translation; the linked Chinese disclosure is authoritative.", core: "Industry Leader", candidate: "Active Candidate",
    loading: "Loading business and financial data…", error: "Financial data is temporarily unavailable. Other modules are unaffected.", retry: "Retry", unavailable: "No verifiable financial records are available.",
    businessUnavailable: "A verifiable business description is not available yet.", businessTranslationPending: "An English translation of the latest business description is pending.",
    reports: "Year to Date", quarter: "Quarterly", half: "Half Year", annual: "Annual",
    allYears: "All years", year: "Year", view: "Financial reporting basis", period: "Period", revenue: "Total operating revenue", operatingRevenue: "Operating revenue", revenueGeneral: "Revenue", profit: "Net profit attributable to parent", unit: "CNY 100m", tableUnit: "Amounts: CNY 100 million · Ratios: %", latest: "Latest reporting period", fetched: "Data updated", businessFetched: "Profile updated",
    operatingMargin: "Operating margin", netMargin: "Net margin", grossMargin: "Gross margin", weightedRoe: "Weighted ROE", roeHelp: "Weighted average return on equity; not annualized",
    operatingCashFlow: "Net operating cash flow", cash: "Cash and bank balances", totalAssets: "Total assets", debtRatio: "Liabilities / assets", revenueGrowth: "Revenue YoY", profitGrowth: "Parent net profit YoY", yoy: "YoY", endBalance: "Period-end balance", cumulativeBasis: "Year to date · not annualized",
    performance: "Performance", profitability: "Profitability", financialPosition: "Cash Flow & Balance Sheet", category: "Financial metric category",
    window: "Reporting period ends", emptyView: "No verifiable records for this year or reporting basis.", missing: "— means insufficient data or an inapplicable metric, not zero.",
    derivedRatios: "Standalone gross margin, net margin and weighted ROE are unavailable for derived quarters and H2. Disclosed Q1 and H1 values remain available.",
    balanceNote: "Cash flow covers the selected period. Cash, total assets and the liabilities-to-assets ratio are period-end values.",
    notesTitle: "Metric Definitions", notes: "Revenue means total operating revenue; profit is attributable to the parent. Year-to-date amounts start on January 1. Q2/Q3/Q4 subtract the preceding cumulative period; H2 subtracts H1 from the annual total. Differences may include restatements. YoY compares the same period in the previous year; loss and zero bases use descriptive labels.",
    marginNotes: "Cumulative margins and weighted ROE use the retrieved indicators without recalculation or annualization. For derived quarters and H2, only operating margin is calculated from operating profit / total operating revenue. Cumulative percentages are never subtracted, averaged or used to reconstruct profit amounts. Missing inputs or non-positive revenue produce —. Balance-sheet values are never differenced.",
    reportCount: "reporting periods", periodNames: { Q1: "Q1", Q2: "Q2", Q3: "Q3", Q4: "Q4", H1: "H1", H2: "H2", "9M": "9M", FY: "FY" },
    growthStatus: { normal: "", turn_profit: "Turned profitable", turn_loss: "Turned to loss", loss_narrowed: "Loss narrowed", loss_widened: "Loss widened", unchanged: "Unchanged", zero_base: "Prior-year base is zero", missing: "—" },
  },
};

export const ui = {
  zh: {
    brand: "A股算力产业链核心标的跟踪", navOverview: "产业全景", navSignals: "异动雷达", navNews: "产业资讯", navAdmin: "管理标的",
    heroEyebrow: "A股算力产业研究终端", heroTitle: "算力产业链重点上市公司监测", heroLede: "以细分市场份额和产业地位为基础，追踪13个产业环节重点A股公司的行情变化、异动证据与相关新闻。", browse: "浏览产业图谱",
    connected: "行情已连接", waitingSource: "等待行情源", trackedCompanies: "追踪公司", readingMappings: "正在读取产业映射", mappings: "条产业映射", sectors: "产业环节", todaySignals: "今日异动", stockSectorSignals: "个股与板块信号", sourceStatus: "数据源状态", sourceLive: "实时行情正常", retrying: "正在重试",
    allSectors: "全部方向", allSectorsDescription: "查看算力产业链13个关键环节的全部重点上市公司。", companies: "家公司", panorama: "产业全景", mappingCount: "条映射", targets: "家标的", quotePending: "行情待更新",
    leaders: "产业龙头标的", trackedTargetsTitle: "产业重点标的", dualLayer: "产业地位与盘面变化双层呈现。", refresh30: "交易时段每 30 秒自动刷新。", all: "全部", core: "产业龙头", candidate: "活跃候选", search: "搜索公司、代码或环节",
    companyCode: "公司 / 代码", sector: "产业环节", latestPrice: "最新价", todayChange: "今日涨跌", turnoverAmount: "成交额", marketCap: "总市值", waitingQuote: "等待行情", noMatch: "没有匹配的标的", moreMappings: "更多", collapseMappings: "收起", allMappings: "全部产业环节",
    loadLead: "数据暂时没有连接成功：", loadTail: "。页面会自动重试。", overviewDescription: "覆盖算力产业链13个关键环节，公司按产业方向展示；同一公司涉及多个环节时会形成多条产业映射。",
    signalsTitle: "异动雷达", todaySignificant: "今日显著异动", signalMethod: "板块信号以产业方向成分股涨跌幅中位数为基准，识别阈值为绝对值5%；", signalMethod2: "个股信号在剔除板块共同波动后，结合成交活跃度与历史波动特征综合判定。", sectorMove: "板块集体异动", sameDirection: "家同方向", sectorMedian: "产业方向中位数 · 已剔除共同波动", stockMove: "个股异动", noSignals: "暂无显著异动",
    newsTitle: "产业重要资讯", latestNews: "最新资讯", industryNews: "产业资讯", newsDescription: "新闻来自公开财经媒体与算力基础设施行业媒体。", verifyOriginal: "内容经算力产业强相关筛选，点击标题可跳转原文核验。", recentNewsAria: "近三日产业资讯", noNewsDay: "当天暂未获取到相关资讯。", originalCn: "中文原文",
    footer: "数据仅供产业研究与信息参考，不构成任何投资建议。行情可能存在延迟，请以交易所及持牌机构数据为准。",
    roleCore: "产业龙头", roleCandidate: "活跃候选", justNow: "刚刚",
  },
  en: {
    brand: "China A-Share Compute Chain Tracker", navOverview: "Industry Map", navSignals: "Move Radar", navNews: "Industry News", navAdmin: "Manage",
    heroEyebrow: "A-SHARE COMPUTE INDUSTRY RESEARCH", heroTitle: "Tracking China’s Listed Compute Infrastructure Leaders", heroLede: "Monitor key A-share companies across 13 compute-infrastructure segments, based on market share and industry position, with price moves, evidence and related news.", browse: "Explore the Industry Map",
    connected: "Market feed connected", waitingSource: "Waiting for market feed", trackedCompanies: "Companies", readingMappings: "Loading industry mappings", mappings: "industry mappings", sectors: "Segments", todaySignals: "Today’s Signals", stockSectorSignals: "stock and sector signals", sourceStatus: "Data source", sourceLive: "Live quotes available", retrying: "Retrying",
    allSectors: "All Segments", allSectorsDescription: "View tracked companies across all 13 key segments of the compute infrastructure chain.", companies: "companies", panorama: "Full chain", mappingCount: "mappings", targets: "tracked", quotePending: "Quote pending",
    leaders: "Industry Leaders", trackedTargetsTitle: "Tracked Companies", dualLayer: "Industry position and market movement are shown separately.", refresh30: "Quotes refresh every 30 seconds during trading sessions.", all: "All", core: "Industry Leaders", candidate: "Active Candidates", search: "Search company, ticker or segment",
    companyCode: "Company / Ticker", sector: "Segment", latestPrice: "Last Price", todayChange: "Day Change", turnoverAmount: "Turnover", marketCap: "Market Cap", waitingQuote: "Waiting for quote", noMatch: "No matching companies", moreMappings: "more", collapseMappings: "Collapse", allMappings: "All segments",
    loadLead: "Data could not be loaded: ", loadTail: ". The page will retry automatically.", overviewDescription: "The map covers 13 key compute-infrastructure segments. A company appears once for each segment in which it has a tracked role.",
    signalsTitle: "Move Radar", todaySignificant: "Significant Moves Today", signalMethod: "Sector signals use the median move of constituents, with an absolute threshold of 5%;", signalMethod2: "stock signals remove common sector movement, then assess trading activity and historical volatility.", sectorMove: "Sector-wide move", sameDirection: "moving together", sectorMedian: "Segment median · common movement removed", stockMove: "Stock move", noSignals: "No significant moves",
    newsTitle: "Industry Intelligence", latestNews: "New items today", industryNews: "Industry News", newsDescription: "News is collected from public financial and compute-infrastructure industry sources.", verifyOriginal: "Items are screened for direct compute-chain relevance; open a headline to verify the original source.", recentNewsAria: "Industry news from the last three days", noNewsDay: "No relevant items were retrieved for this day.", originalCn: "Original CN",
    footer: "For industry research and information only. Nothing on this site is investment advice. Quotes may be delayed; refer to exchanges and licensed data providers.",
    roleCore: "Industry Leader", roleCandidate: "Active Candidate", justNow: "Just now",
  },
} as const;

export const sectorEnglish: Record<string, { name: string; shortName: string; description: string }> = {
  "compute-chip": { name: "Compute Processors", shortName: "Processors", description: "AI training and inference are driving rapid processor iteration. Domestic substitution is advancing across performance, software ecosystems and supply resilience." },
  "memory-interconnect": { name: "Memory & High-Speed Interconnect Chips", shortName: "Memory & I/O", description: "Larger models and clusters require greater memory bandwidth and faster interconnects, supporting upgrades in DDR5, CXL and high-performance storage." },
  "ai-server": { name: "Servers & AI Appliances", shortName: "AI Servers", description: "Growth in training and inference workloads is lifting AI-server demand, while competition expands from hardware configuration to cluster delivery, energy efficiency and operations." },
  optical: { name: "Optical Modules & Components", shortName: "Optical", description: "Intelligent-computing clusters are accelerating high-speed optical upgrades from 800G to faster generations, benefiting optical chips, components and modules." },
  "pcb-copper": { name: "Copper Links, PCBs & CCLs", shortName: "PCB & Copper", description: "AI servers and switches require more board layers, higher-grade materials and faster transmission, driving high-layer PCBs, high-frequency laminates and high-speed copper links." },
  network: { name: "Switches & Network Equipment", shortName: "Networking", description: "Larger intelligent-computing clusters demand greater switching capacity and reliability, supporting upgrades in high-speed Ethernet, switching silicon and network equipment." },
  cooling: { name: "Liquid Cooling & Thermal Control", shortName: "Cooling", description: "Rising rack power density is accelerating liquid-cooling adoption, making cold plates, immersion systems and precision thermal control critical data-centre infrastructure." },
  idc: { name: "Data Centres & IDC", shortName: "Data Centres", description: "Intelligent-computing centres demand more power, racks, connectivity and campus resources, favouring operators with prime locations and strong delivery capabilities." },
  power: { name: "UPS, Power & Distribution", shortName: "Power", description: "Higher AI-server power draw is driving upgrades in high-power supplies, UPS, HVDC and distribution systems, with efficiency and reliability as key metrics." },
  cloud: { name: "Carriers, Cloud & Compute Services", shortName: "Cloud & Compute", description: "Telecom and cloud providers continue to build compute networks as demand shifts from general cloud capacity toward heterogeneous compute, orchestration and enterprise services." },
  "semi-equipment": { name: "Semiconductor Equipment", shortName: "Semi Equipment", description: "Fab expansion and equipment localisation are driving demand across etch, deposition, cleaning, thermal processing and CMP." },
  "semi-material": { name: "Semiconductor Materials", shortName: "Semi Materials", description: "Advanced-node and memory capacity expansion is raising demand for high-purity wafers, photoresists, electronic gases, targets and CMP materials." },
  "compute-rental": { name: "Compute Leasing & Operations", shortName: "Compute Leasing", description: "GPU compute services are expanding with model training and inference demand. Competition depends on resource access, utilisation, customer mix and operating capability." },
};

type CompanyEnglish = { name: string; thesis: string };
export const companyEnglish: Record<string, CompanyEnglish> = {
  "688256": { name: "Cambricon", thesis: "Domestic AI training and inference chip platform spanning cloud and edge computing." },
  "688041": { name: "Hygon Information", thesis: "Leading domestic supplier of high-end processors and DCUs, with a combined CPU and accelerator portfolio." },
  "688047": { name: "Loongson Technology", thesis: "CPU supplier built on an independent instruction-set architecture for desktops, servers and industrial systems." },
  "300474": { name: "Jingjia Micro", thesis: "Domestic graphics-processor developer expanding into general-purpose computing." },
  "603893": { name: "Rockchip Electronics", thesis: "Edge-AI and SoC platform positioned for AIoT and on-device inference." },
  "688008": { name: "Montage Technology", thesis: "Major global supplier of memory-interface chips with PCIe and CXL interconnect products." },
  "688825": { name: "CXMT", thesis: "Listed platform of ChangXin Memory Technologies and a domestic DRAM leader integrating R&D, design, manufacturing and sales." },
  "603986": { name: "GigaDevice", thesis: "Domestic leader in NOR Flash and MCUs, spanning memory and control chips." },
  "300223": { name: "Beijing Ingenic", thesis: "Automotive memory and computing-chip platform with a broad storage portfolio." },
  "688525": { name: "Biwin Storage", thesis: "Storage-solutions provider expanding advanced packaging and memory for edge AI." },
  "001309": { name: "DML", thesis: "Flash-controller and storage-module specialist whose earnings are linked to the memory cycle." },
  "000977": { name: "Inspur Electronic Information", thesis: "Leading domestic server and AI-server provider spanning training, inference and intelligent-computing clusters." },
  "603019": { name: "Sugon", thesis: "High-performance computing and server platform with full-stack compute-infrastructure capabilities." },
  "601138": { name: "Foxconn Industrial Internet", thesis: "Global leader in server manufacturing and cloud-network equipment, deeply embedded in the AI hardware supply chain." },
  "603296": { name: "Huaqin Technology", thesis: "Leading smart-device ODM rapidly expanding its server and data-centre business." },
  "002261": { name: "Talkweb Information", thesis: "Domestic compute-system and industry-solutions provider focused on public-sector and enterprise deployments." },
  "300308": { name: "Zhongji Innolight", thesis: "Global leader in high-speed data-centre optical modules, including 800G and faster products." },
  "300502": { name: "Eoptolink Technology", thesis: "Core supplier of high-speed optical modules with substantial data-centre exposure." },
  "300394": { name: "TFC Optical Communication", thesis: "Optical-component platform supplying precision components for high-speed optical modules." },
  "002281": { name: "Accelink Technologies", thesis: "Integrated optical-chip, component and module supplier with strong domestic-substitution exposure." },
  "000988": { name: "HGTECH", thesis: "Optical-communications and laser platform expanding high-speed data-centre modules." },
  "002463": { name: "WUS Printed Circuit", thesis: "Core PCB supplier for enterprise communications and high-end servers." },
  "002916": { name: "Shennan Circuits", thesis: "Integrated leader across PCBs, packaging substrates and electronic assembly." },
  "600183": { name: "Shengyi Technology", thesis: "Major global copper-clad laminate producer benefiting from high-speed, high-frequency AI-server upgrades." },
  "300476": { name: "Victory Giant Technology", thesis: "High-layer PCB producer expanding with AI-server and premium graphics-card customers." },
  "300913": { name: "Zhaolong Interconnect", thesis: "Supplier of high-speed data cables and assemblies benefiting from copper interconnects in data centres." },
  "000938": { name: "Unisplendour", thesis: "Enterprise networking and cloud-infrastructure leader; H3C spans switches, servers and China’s x86 server market." },
  "000063": { name: "ZTE", thesis: "Telecom-equipment leader spanning carrier networks, servers and data-centre switching." },
  "301165": { name: "Ruijie Networks", thesis: "Important supplier of enterprise switches and data-centre networking equipment." },
  "688702": { name: "Centec Networks", thesis: "Domestic Ethernet switching-silicon company focused on data centres and carrier networks." },
  "301191": { name: "Phoenix Telecom", thesis: "Network-equipment ODM covering switches, routers and wireless products." },
  "002837": { name: "Envicool", thesis: "Leader in data-centre thermal management and liquid cooling, with room- and rack-level solutions." },
  "301018": { name: "Shenling Environment", thesis: "Supplier of specialised data-centre air-conditioning and liquid-cooling systems." },
  "300499": { name: "Goaland Energy Conservation", thesis: "Liquid-cooling technology platform serving data centres and power-electronics thermal management." },
  "300990": { name: "Tongfei Refrigeration", thesis: "Industrial thermal-control supplier expanding into energy storage and data-centre liquid cooling." },
  "603912": { name: "Canatal Data-Centre Environmental Tech", thesis: "Provider of precision environmental-control equipment and solutions for data centres." },
  "600845": { name: "Baosight Software", thesis: "Industrial-software and IDC leader with data-centre resources in core Shanghai locations." },
  "300442": { name: "Range Technology", thesis: "Large-scale data-centre cluster operator expanding AIDC capacity and integrated rack, compute and operating services." },
  "603881": { name: "AtHub", thesis: "Wholesale data-centre operator serving leading internet and cloud customers." },
  "300383": { name: "Sinnet", thesis: "Third-party IDC and cloud-services provider with resources across Beijing, Tianjin, Hebei and other regions." },
  "300738": { name: "Kings Data", thesis: "Internet data-centre operator developing self-owned facilities across multiple regions." },
  "002335": { name: "Kehua Data", thesis: "Leader in UPS and data-centre energy systems, spanning power distribution, storage and IDC operations." },
  "002518": { name: "KSTAR", thesis: "UPS and data-centre infrastructure supplier with power and thermal-control products." },
  "002851": { name: "Megmeet", thesis: "Power-electronics platform developing high-power server supplies." },
  "300870": { name: "Honor Electronic", thesis: "Core server-power supplier benefiting from higher AI-server power requirements." },
  "002364": { name: "Zhongheng Electric", thesis: "HVDC and data-centre power supplier developing high-voltage direct-current systems." },
  "600941": { name: "China Mobile", thesis: "China’s largest telecom operator, investing continuously in compute networks, cloud and intelligent-computing centres." },
  "601728": { name: "China Telecom", thesis: "Integrated cloud-network carrier with Tianyi Cloud and a nationwide compute-infrastructure footprint." },
  "600050": { name: "China Unicom", thesis: "Integrated connectivity-and-compute platform serving enterprise cloud and intelligent-computing demand." },
  "688158": { name: "UCloud", thesis: "Independent cloud provider offering GPU cloud and intelligent-computing services." },
  "300846": { name: "Capital Online", thesis: "Global cloud-network provider offering GPU compute cloud and low-latency inference nodes." },
  "002371": { name: "NAURA Technology", thesis: "Leading domestic semiconductor-equipment platform spanning etch, deposition and cleaning." },
  "688012": { name: "AMEC", thesis: "Leading etch and thin-film deposition equipment supplier entering advanced process nodes." },
  "688082": { name: "ACM Research Shanghai", thesis: "Leader in semiconductor cleaning equipment expanding into plating and furnace systems." },
  "688072": { name: "Piotech", thesis: "Core domestic thin-film deposition equipment supplier covering PECVD and ALD." },
  "688120": { name: "Hwatsing Technology", thesis: "Domestic CMP equipment leader expanding into thinning and wet-process tools." },
  "688019": { name: "Anji Microelectronics", thesis: "Domestic leader in CMP slurries and functional wet electronic chemicals." },
  "688126": { name: "National Silicon Industry Group", thesis: "Domestic platform for large-diameter semiconductor silicon wafers." },
  "300346": { name: "Nata Opto-electronic Material", thesis: "Supplier of electronic specialty gases, photoresists and precursor materials." },
  "002409": { name: "Yoke Technology", thesis: "Platform spanning semiconductor precursors, photoresist support materials and electronic materials." },
  "300666": { name: "Jiangfeng Electronic Materials", thesis: "Domestic leader in high-purity sputtering targets for advanced-node customers." },
  "300857": { name: "Sharetronic Data Technology", thesis: "Integrated smart-hardware and compute-services operator with scaled GPU capacity." },
  "603220": { name: "Zhongbei Communications", thesis: "Extending from communications services into intelligent-cluster construction and compute leasing." },
  "603629": { name: "LTT", thesis: "Operates GPU cloud and compute-leasing services through owned and contracted capacity." },
  "301396": { name: "Hongjing Technology", thesis: "Compute services have become a major revenue source as the company expands server assets." },
  "688099": { name: "Amlogic", thesis: "Holds a 17.7% global share in smart-home terminal SoCs, integrating NPUs for AIoT and edge computing." },
  "688123": { name: "Giantec Semiconductor", thesis: "Held about 14% of the global EEPROM market in 2024 and has a meaningful position in DDR5 SPD chips." },
  "688766": { name: "Puya Semiconductor", thesis: "Ranks among the top five global NOR Flash suppliers; historical disclosures put EEPROM share above 5%." },
  "688313": { name: "Henan Shijia Photons", thesis: "Domestic optical-chip supplier with an estimated 9% disclosed market share, covering PLC, AWG and DFB laser chips." },
  "688498": { name: "Yuanjie Semiconductor", thesis: "Domestic optical-chip supplier with an estimated 7% disclosed market share and expanding high-speed laser-chip products." },
  "002938": { name: "Avary Holding", thesis: "A domestic PCB share leader with about 12.4% of the market." },
  "002384": { name: "Dongshan Precision", thesis: "Holds about 7.5% of China’s PCB market, spanning premium circuit boards and precision electronics manufacturing." },
  "920808": { name: "Sugon Data Energy", thesis: "Accounted for 55.7% of China’s compute-centre liquid-cooling equipment shipments in 2024, ranking first domestically for several years." },
  "688652": { name: "Kingsemi Equipment", thesis: "Holds more than 15% of China’s dedicated semiconductor process-exhaust equipment market and also develops temperature-control and wafer-transfer systems." },
  "688729": { name: "Beijing E-Town Semiconductor", thesis: "Holds 13.05% of the global rapid-thermal-processing market; public tender samples show over 80% domestic share in photoresist-stripping tools." },
  "688037": { name: "Kingsemi", thesis: "Domestic mass-production supplier with roughly 10% share in front-end photoresist coating and developing equipment." },
  "603690": { name: "Puretech", thesis: "Major domestic wet-cleaning equipment supplier with more than 5% share under public revenue and market-size estimates." },
  "688268": { name: "Huate Gas", thesis: "Holds more than 10% domestic share in multiple electronic specialty gases, with some products reaching 20%–60%." },
  "300054": { name: "Dinglong", thesis: "Held 38.5% of domestic CMP pad supply and 16.8% of China’s overall CMP materials market in 2025." },
  "688233": { name: "Thinkon Semiconductor", thesis: "Holds roughly 13%–15% of the global single-crystal silicon materials market for integrated-circuit etching." },
  "603650": { name: "Red Avenue New Materials", thesis: "Subsidiary Beijing Kehua is a core domestic semiconductor photoresist supplier, with a disclosed 60% share in G-line photoresist." },
  "600498": { name: "FIBERHOME TELECOMMUNICATION TECHNOLOGIES Co., Ltd.", thesis: "An information and communications network products and solutions provider whose core business is rooted in optical communications and extends across data communications and network infrastructure." },
  "603002": { name: "Epoxy Base Electronic Material Corporation Limited", thesis: "A supplier of electronic-grade epoxy resins and copper-clad laminates, covering key upstream PCB materials and expanding into high-frequency, high-speed and high-Tg laminate products." },
};

export function localizeSector<T extends { slug: string; name: string; shortName: string; description: string }>(sector: T, locale: Locale): T {
  if (locale === "zh") return sector;
  const translated = sectorEnglish[sector.slug];
  return translated ? { ...sector, ...translated } : sector;
}

type EnglishCompanyFields = { nameEn?: string; thesisEn?: string; enStatus?: string };

export function localizeCompany<T extends { code: string; name: string; thesis: string } & EnglishCompanyFields>(company: T, locale: Locale): T {
  if (locale === "zh") return company;
  if (company.enStatus === "verified" && isEnglishCompanyText(company.nameEn, company.thesisEn)) {
    return { ...company, name: company.nameEn!, thesis: company.thesisEn! };
  }
  const translated = companyEnglish[company.code];
  return translated ? { ...company, ...translated } : company;
}

export function hasEnglishCompany(company: { code: string } & EnglishCompanyFields) {
  return (company.enStatus === "verified" && isEnglishCompanyText(company.nameEn, company.thesisEn)) || Boolean(companyEnglish[company.code]);
}

function isEnglishCompanyText(name?: string, thesis?: string) {
  return Boolean(name && thesis && /[A-Za-z]/.test(name) && /[A-Za-z]/.test(thesis) && !isChineseContent(`${name}${thesis}`));
}

export function localizeSource(source: string, locale: Locale) {
  if (locale === "zh") return source;
  const sources: Record<string, string> = { "东方财富": "Eastmoney", "新浪财经": "Sina Finance", "公司公告": "Company Filing", "上市公司公告": "Company Filing" };
  return sources[source] ?? source;
}

export function isChineseContent(value: string) { return /[\u3400-\u9fff]/.test(value); }
export function matchesContentLanguage(title: string, locale: Locale) { return locale === "zh" ? isChineseContent(title) : !isChineseContent(title) && /[a-z]/i.test(title); }

export function localizeMarketLabel(label: string, locale: Locale) {
  if (locale === "zh") return label;
  return ({ "休市": "Market Closed", "盘前": "Pre-market", "开盘集合竞价": "Opening Auction", "开盘准备": "Pre-open", "交易中": "Market Open", "午间休市": "Lunch Break", "收盘集合竞价": "Closing Auction", "已收盘": "Market Closed" } as Record<string, string>)[label] ?? label;
}

export function localizeApiError(message: string, locale: Locale) {
  if (locale === "zh") return message;
  if (/请先登录/.test(message)) return "Please sign in to the administrator console";
  if (/密码不正确/.test(message)) return "Incorrect password";
  if (/管理员密码尚未/.test(message)) return "The administrator password is not configured";
  if (/股票代码必须/.test(message)) return "The stock ticker must contain six digits";
  if (/请填写公司名称/.test(message)) return "Enter a company name";
  if (/请选择产业方向/.test(message)) return "Select an industry segment";
  if (/请选择龙头类型/.test(message)) return "Select a tracking role";
  if (/缺少记录编号/.test(message)) return "The record identifier is missing";
  if (/无效内容/.test(message)) return "The market-data service returned an invalid response";
  if (/暂时不可用/.test(message)) return "Live market data is temporarily unavailable";
  if (/加载失败|没有连接成功/.test(message)) return "Market data could not be loaded";
  if (/未找到/.test(message)) return "The requested company could not be found";
  return message;
}

export function localizeChineseFact(fact: string, locale: Locale) {
  if (locale === "zh" || !fact) return fact;
  let translated = fact
    .replace(/股价上涨([\d.]+)%/g, "share price up $1%")
    .replace(/股价下跌([\d.]+)%/g, "share price down $1%")
    .replace(/高于(.+?)中位数([\d.]+)个百分点/g, "$2 percentage points above the $1 median")
    .replace(/低于(.+?)中位数([\d.]+)个百分点/g, "$2 percentage points below the $1 median")
    .replace(/量比([\d.]+)/g, "volume ratio $1")
    .replace(/成交明显放大/g, "turnover expanded materially")
    .replace(/日内振幅([\d.]+)%/g, "intraday range $1%")
    .replace(/超过近20日常态波动([\d.]+)倍/g, "$1× the typical 20-day move")
    .replace(/换手率([\d.]+)%/g, "turnover rate $1%")
    .replace(/中位数上涨([\d.]+)%/g, "median up $1%")
    .replace(/中位数下跌([\d.]+)%/g, "median down $1%")
    .replace(/(\d+)\/(\d+)家公司同方向/g, "$1/$2 companies moving together")
    .replace(/个股未显著偏离板块中位数/g, "the stock did not materially diverge from the sector median")
    .replaceAll("；", "; ");
  const sectorTerms: Array<[string, string]> = [
    ["存储与高速互联芯片", "Memory & High-Speed Interconnect Chips"], ["算力租赁与算力运营", "Compute Leasing & Operations"], ["铜连接、PCB与覆铜板", "Copper Links, PCBs & CCLs"], ["运营商、云与算力服务", "Carriers, Cloud & Compute Services"], ["服务器与AI一体机", "Servers & AI Appliances"], ["光模块与光器件", "Optical Modules & Components"], ["交换机与网络设备", "Switches & Network Equipment"], ["UPS、电源与供配电", "UPS, Power & Distribution"], ["液冷与温控", "Liquid Cooling & Thermal Control"], ["数据中心与IDC", "Data Centres & IDC"],
    ["芯片", "Processors"], ["存储互联", "Memory & I/O"], ["服务器", "AI Servers"], ["光模块", "Optical"], ["PCB铜连", "PCB & Copper"], ["网络设备", "Networking"], ["液冷温控", "Cooling"], ["数据中心", "Data Centres"], ["算力电源", "Power"], ["云算服务", "Cloud & Compute"], ["半导体设备", "Semi Equipment"], ["半导体材料", "Semi Materials"], ["算力租赁", "Compute Leasing"],
  ];
  for (const [source, target] of sectorTerms) translated = translated.replaceAll(source, target);
  return translated.replace(/([A-Za-z])median/g, "$1 median");
}
