# 云端开发

代码主仓库：[WangTianai920/compute-chain-atlas](https://github.com/WangTianai920/compute-chain-atlas)。

## Codex 环境配置

在个人 ChatGPT 账户的 [Codex 环境设置](https://chatgpt.com/codex/cloud/settings/environments)中，为该私有仓库创建仅本人使用的环境。

| 项目 | 设置 |
| --- | --- |
| 仓库 | `WangTianai920/compute-chain-atlas` |
| 默认分支 | `main` |
| Node.js | `22.18.0`（环境若只提供主版本，选 `22`） |
| 安装脚本 | `bash scripts/cloud-setup.sh` |
| 维护脚本 | `bash scripts/cloud-setup.sh` |
| 环境变量 | `COMPUTE_CHAIN_LOCAL_ONLY=1`、`WRANGLER_SEND_METRICS=false` |
| 生产密钥 | 不需要，也不应加入普通开发环境 |

安装脚本从锁文件安装依赖，不部署网站、不连接远程 D1、不导入生产数据库。它也可在缓存恢复后重新运行。

## 验证与预览

```bash
npm run cloud:check
npm run cloud:smoke
npm run dev:local -- --hostname 0.0.0.0 --port 5173
```

`cloud:check` 执行所有现有测试、ESLint 和构建；`cloud:smoke` 启动临时预览，检查首页、未登录的管理会话与开发库中的公司列表，并在检查后关闭服务。

首次数据请求会自动创建隔离的 D1 开发数据库和种子数据，保存在环境内的 `.wrangler/`。无需复制原电脑上的数据库文件。该数据不是当前生产数据库的完整镜像；仓库中的扩充研究资料可按 README 的本地导入流程使用。

没有外部网络访问时，行情、新闻和年报查询可能不可用；页面不得将其显示为实时数据。远程 AI 和公司资料工作流在 `COMPUTE_CHAIN_LOCAL_ONLY=1` 模式下关闭。需要联调这些服务时，另行配置开发专用绑定。

管理后台默认未启用。如需测试登录，仅为当前开发环境配置 `.dev.vars` 中的 `ADMIN_PASSWORD` 和 `ADMIN_SESSION_SECRET`，不要使用生产值或提交该文件。

年报 PDF 研究脚本另外需要 Python 和 `pypdf`。它不参与常规应用测试和构建，下载缓存位于项目的 `tmp/pdfs/`。

## 后续工作方式

从上述仓库的最新 `main` 启动云端任务，按 `AGENTS.md` 开发、验证，再通过 GitHub 提交或 Pull Request 留存代码。上传代码和云端开发均不会自动发布到 Cloudflare；生产发布需要单独授权。

## 删除原电脑目录前

先确认个人账户下的云端环境实际完成一次安装、测试、构建和 HTTP 检查。GitHub 源码导入不包含原始 Git 历史、`.dev.vars`、`.env*`、数据库、生产备份、归档或 `.openai` 工作站配置。这些内容应由所有者决定另行安全留存或放弃，不能把源码上传等同于完整目录备份。

本文件说明可复现配置；迁移是否完成，以云端实际运行结果为准。
