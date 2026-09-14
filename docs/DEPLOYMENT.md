# 墨迹排版台 V3 部署说明

## 目标拓扑

- 前端：Cloudflare Sites/Vinext，正式 HTTPS。
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

1. 构建前设置 `NEXT_PUBLIC_API_BASE_URL=https://实际API域名`。
2. 执行 `pnpm install --frozen-lockfile` 与 `pnpm build`。
3. 通过项目现有 `.openai/hosting.json` 与 Sites 发布流程部署构建产物。
4. 获得前端 URL 后，把 Railway 的 `ALLOWED_ORIGINS` 精确更新为该 URL 并重新部署 API。

生产构建不得保留 localhost API。代码中的本地地址只存在于统一 API client 的开发默认值和 `.env.example`，React 组件不硬编码 API。

## 公网验收

- 首页与 `/showcase` 可打开。
- 使用脱敏 DOCX 验证保留原文结构、简化正文、字体/背景、逐行编辑、页面管理、PNG 和 PDF。
- 验证 `/health`、无 CORS 错误、刷新不串 Session。
- 用两个独立浏览器会话分别上传不同资源和项目，确认互不可见。
- 用移动设备宽度打开首页和 Showcase，确认可浏览且基本按钮不溢出。

## 授权边界

正式发布需要用户拥有并授权 Sites 与 Railway。没有授权时只能完成可部署代码、构建和本地/clean-room 验收，不能声称已生成正式公网 URL。
