# Cloudflare 直连部署

生产短网址直接运行 `worker/index.ts` 构建出的应用 Worker，并绑定 Cloudflare D1 数据库。OpenAI Sites 仅保留为版本化备份，不参与公开页面、静态资源或 API 的请求链路。

发布时应先运行 `npm test`，再运行 `npm run pages:stage`，将 `dist/pages` 作为同一次 Cloudflare Pages 高级模式部署发布。CSS、脚本和图片统一通过部署内的 `ASSETS` 绑定读取，版本化资源使用长期不可变缓存；动态页面和 `/api/market` 由同一 Worker 处理。
