# 算力图谱

面向 A 股算力产业链的重点标的追踪网站，按“产业核心 + 市场活跃”双层龙头体系覆盖 13 个细分环节。当前种子数据包含 81 家公司、83 条产业环节映射；后续可在密码后台继续增补。

## 功能

- 产业全景主页：实时行情、近期涨跌、产业筛选和搜索
- 独立异动雷达页：只展示可观察事实，匹配到可核验资讯时提供原文链接
- 独立产业资讯页：统一展示产业新闻及原文入口
- 公司详情：带坐标轴与悬浮数据的近期走势图、龙头逻辑、公司新闻与公告
- 密码后台：新增、编辑、停用或删除跟踪标的
- 数据持久化：Cloudflare D1；行情与资讯来自公开财经数据源

## 云端或本地运行

建议 Node.js 22.18.0（见 `.nvmrc`）。云端环境配置见 [云端开发说明](docs/cloud-development.md)。

```bash
bash scripts/cloud-setup.sh
npm run dev:local
```

本地管理员密码通过 `.dev.vars` 中的 `ADMIN_PASSWORD` 和 `ADMIN_SESSION_SECRET` 配置；该文件不会提交。

## 校验

```bash
npm run cloud:check
npm run cloud:smoke
```

## 部署

项目直接运行在 Cloudflare Pages 与 D1 免费托管上。生产环境管理员密码存储为托管平台密钥，不写入源码。

Cloudflare 直连部署说明保存在 `cloudflare-pages/README.md`；应用入口为 `worker/index.ts`。


## 2026-08-31 本地研究扩充

本次仅扩充本地库：83 → 133 家去重公司，保持既有 13 个产业方向。新增 50 家均列为候选，原有记录和评级保持不变。详情包含公开来源、披露时间、业务阶段与风险。英文资料未经核验，暂不进入英文列表。

完整清单和边界见 [本地扩充核验清单](docs/research/2026-08-31-expansion-review.md)，机器可读资料见 [研究数据](data/research/2026-08-31-expansion.json)。此批不修改初始种子版本，不会随网页部署自动写入生产库。

本地导入入口为 `scripts/apply-research-expansion.mjs --local-db <项目 .wrangler 内的现有 SQLite 路径>`。默认只预演；加 `--apply` 时先备份，再在事务内新增缺失公司。重复执行不覆盖人工修改、评级或停用状态。脚本不接受远程数据库。

## 2026-08-31 全量跨板块复核

对本地 133 家公司逐家完成主营简介筛查，并对拟新增业务逐项核验年报、公告或公司官网资料。43 家公司补充 69 条候选映射，总映射数由 135 增至 204，多板块公司由 2 家增至 44 家。公司数、原 135 条映射及评级保持不变；首页不设置“本次新增”筛选或角标。

完整结果和未追加边界见 [全量跨板块核查清单](docs/research/2026-08-31-cross-sector-review.md)，机器可读资料见 [跨板块研究数据](data/research/2026-08-31-cross-sector-review.json)。本地导入入口为 `scripts/apply-cross-sector-review.mjs --local-db <项目 .wrangler 内的现有 SQLite 路径>`，默认预演，加 `--apply` 时自动备份并在事务内只新增缺失映射；不会修改原记录或连接远程数据库。
