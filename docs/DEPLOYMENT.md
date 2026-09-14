# 墨迹排版台 V3 部署说明

## 目标拓扑

- 前端：Cloudflare Pages 标准静态项目，正式 `*.pages.dev` HTTPS。
- API：Railway Docker Web Service，正式 HTTPS。
- 本地版：继续使用 `localhost:5173` 与 `127.0.0.1:8000`。

## API 部署

1. 在 Railway 连接包含本项目的代码仓库。
2. 选择 Docker 并指定 `Dockerfile.api`。
3. 设置 `ALLOWED_ORIGINS=https://实际前端域名`。
4. 设置 `PUBLIC_API_BASE_URL=https://实际API域名`，用于生成字体和背景文件的 HTTPS URL。
5. 保持 `ENVIRONMENT=production`、`TEMP_FILE_TTL_HOURS=24`、`MAX_UPLOAD_SIZE_MB=20`。
6. 部署后验证 `https://实际API域名/health` 返回 status、3.x version 和 production environment。

API 不需要数据库。默认使用临时磁盘保存匿名 Session；文件过期清理，服务重启也可能清空，符合临时会话设计。若需要跨重启保存，应在后续接入私有对象存储并保持相同 Session 边界。

## 前端部署

当前页面全部可静态生成，DOCX、字体、背景、项目与 PDF 等业务请求在浏览器中直接访问 Railway API。Cloudflare Pages 使用独立静态构建入口，不改变本地/Vinext 构建。

1. 在 Cloudflare Dashboard 创建 Pages 项目并连接 GitHub 仓库 `yu251221wen-dotcom/handwrite-studio`。
2. Production branch 设置为 `main`。
3. Framework preset 选择 `Next.js (Static HTML Export)`。
4. Build command 设置为 `pnpm build:pages`。
5. Build output directory 设置为 `out`。
6. Root directory 留空（仓库根目录）。
7. 环境变量设置 `NEXT_PUBLIC_API_BASE_URL=https://handwrite-studio-api-production.up.railway.app`；如平台未自动选择 Node 22，再设置 `NODE_VERSION=22.16.0`。
8. 获得 `https://<project>.pages.dev` 后，把 Railway 的 `ALLOWED_ORIGINS` 精确更新为该 Origin 并重新部署 API。

静态导出由 `HANDWRITE_STATIC_EXPORT=1` 条件启用；只有 `pnpm build:pages` 使用它。普通 `pnpm build`、`pnpm dev` 与 FastAPI 后端不受影响。

生产构建不得保留 localhost API。代码中的本地地址只存在于统一 API client 的开发默认值和 `.env.example`，React 组件不硬编码 API。

## 公网验收

- 首页与 `/showcase` 可打开。
- 使用脱敏 DOCX 验证保留原文结构、简化正文、字体/背景、逐行编辑、页面管理、PNG 和 PDF。
- 验证 `/health`、无 CORS 错误、刷新不串 Session。
- 用两个独立浏览器会话分别上传不同资源和项目，确认互不可见。
- 用移动设备宽度打开首页和 Showcase，确认可浏览且基本按钮不溢出。

## 授权边界

正式发布需要用户拥有并授权 Sites 与 Railway。没有授权时只能完成可部署代码、构建和本地/clean-room 验收，不能声称已生成正式公网 URL。
