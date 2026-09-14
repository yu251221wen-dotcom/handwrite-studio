# PROJECT_STATUS.md

## 项目

墨迹排版台 / handwrite-studio

---

## 当前版本

- Version：3.1.0（V3.1）
- SchemaVersion：3
- 更新日期：2026-09-14
- GitHub：`https://github.com/yu251221wen-dotcom/handwrite-studio`
- Git commit：以仓库 `main` 当前 HEAD 为准

---

## 当前产品模式

- 核心模式：无模板模式（`no-template`）
- 支持：`preserve-structure`、`simplified`
- 复杂模板映射：Removed / Disabled；正式 UI、DOCX API 和布局路由均不再调用，旧源码和 JSON 字段仅保留迁移兼容

---

## 当前 Golden Test

- Fixture：`tests/fixtures/cardiology-inpatient-record.docx`
- 来源：《心内大病历(1).docx》
- Raw：3657
- Laid out：3657
- Missing：0
- DocumentBlocks：77

以上为最近一次完整 V3 clean-room / Canvas 实际绘制覆盖率验收结果。

---

## 当前已完成

- [x] DOCX import
- [x] DocumentBlock
- [x] HeadingBlock
- [x] ParagraphBlock
- [x] KeyValueBlock
- [x] ListBlock
- [x] TableBlock
- [x] PrescriptionBlock
- [x] SignatureBlock
- [x] preserve-structure
- [x] simplified
- [x] measureText wrap
- [x] Block-aware pagination
- [x] pages[]
- [x] page manager
- [x] Undo / Redo
- [x] font manager
- [x] background manager
- [x] custom fonts
- [x] custom backgrounds
- [x] character-level handwriting
- [x] deterministic Seed
- [x] fixed handwriting
- [x] PNG
- [x] JPG
- [x] multi-page PDF
- [x] 150 DPI
- [x] 300 DPI
- [x] 600 DPI
- [x] Project JSON
- [x] schema migration
- [x] coverage validator
- [x] session isolation
- [x] /health
- [x] Template Mapping production path removed / disabled
- [ ] V3.1 clean-room

勾选依据为当前源码实现及最近验收记录；不代表暂缓路线功能已经完成。

---

## 当前未完成

- 横线自动检测
- 横线文字吸附
- 透视校正
- OCR
- 字形级手写增强

---

## 当前最高优先级

当前阶段：V3.1 公网交付完成

1. 保持 Frontend / API / Showcase 公网地址可用
2. 保持 Session isolation、精确 CORS 和 `/health`
3. 保持 Golden Test Missing = 0
4. 不破坏当前 V3.1 功能
5. 后续按路线进入 V4，不提前开发 OCR、透视或 AI 字形

---

## 下一阶段

当前先完成 V3.1 正式公网部署；其后才进入 V4 横线纸自动检测与文字基线吸附。暂时不要提前开发 OCR、透视或 AI 字形。

---

## 最近测试结果

- TypeScript：23 / 23 通过
- Python：16 / 16 通过
- Typecheck：通过
- ESLint：0 error
- Build：production build 通过
- FastAPI health：通过，`status=ok`、`version=3.1.0`
- Golden Test：Raw 3657 / Laid out 3657 / Missing 0；实际 Canvas `fillText` 覆盖率通过
- 公网 DOCX：合成长文档 Raw 3097，DocumentBlock 5，弃用字段映射结果 0
- 公网 Session isolation：同一项目 Session A 读取 200，Session B 读取 404
- 公网 CORS：正式前端 Origin 允许，预检 200，`X-Session-ID` 已允许
- 公网 PDF：三张 2480 × 3508 页面导出 HTTP 200，实测 PDF 3 页、A4 MediaBox
- Clean-room：V3.0 最近一次通过；V3.1 尚未重新打包和执行 clean-room

V3.1 本轮完整源码测试已通过；正式 ZIP 与 clean-room 将在部署授权和本轮交付打包时更新。

---

## 当前 Golden 输出

- Preserve structure pages：11
- Simplified pages：10
- 300 DPI：2480 × 3508 px
- PDF：真正多页导出链路测试通过；页数与 `pages.length` 一致

---

## 当前本地地址

- Frontend：V3.1 未启动；`http://localhost:5173/` 当前仍是旧 V3.0 clean-room 实例
- Showcase：V3.1 未启动；现有 5173 Showcase 仍是旧实例
- Backend：V3.1 验收进程已停止；`http://127.0.0.1:8000` 当前仍是旧 V3.0 实例
- Health：V3.1 已在隔离端口验证 `status=ok`、`version=3.1.0` 后停止

---

## 当前公网地址

- Frontend：`https://handwrite-studio-yu251221wen.fast-drum-0976.chatgpt.site/`
- API：`https://handwrite-studio-api-production.up.railway.app`
- Health：`https://handwrite-studio-api-production.up.railway.app/health`（HTTP 200，`status=ok`、`version=3.1.0`、`environment=production`）
- Showcase：`https://handwrite-studio-yu251221wen.fast-drum-0976.chatgpt.site/showcase`

---

## 当前部署状态

Railway FastAPI production 后端已部署成功：服务 `handwrite-studio-api`，GitHub `main` 提交 `b65a4b6441a143b3654d25478d1da5002fa221da`，构建器 `DOCKERFILE`，路径 `Dockerfile.api`。公网 HTTPS `/health` 已通过。Render 因绑卡要求停用。

Sites 前端已公开发布，生产构建使用 `NEXT_PUBLIC_API_BASE_URL=https://handwrite-studio-api-production.up.railway.app`。Railway `ALLOWED_ORIGINS` 已精确设置为正式前端 Origin，不使用通配符。

---

## 当前已知问题

- Cloudflare / Vite 开发运行时可能在类型初始化时出现 `fetch failed` / `ECONNRESET`；production build 和本地生产预览稳定
- 当前本机代理访问 `chatgpt.site` 偶发 `ERR_CONNECTION_CLOSED`；同一正式首页与 Showcase 已分别成功完成浏览器渲染，Sites 部署状态为 `succeeded`
- 旧字段布局引擎与字段映射模块仍作为迁移兼容源码保留，但没有正式运行入口
- 自动排版后手工改页次可保存，但再次全局重排会重建自动页顺序
- 跨软件关闭的草稿恢复受浏览器 Session 生命周期限制，应使用项目 JSON
- 字体视觉一致性依赖同一设备字体或用户上传同一字体
- 高 DPI 导出按页串行绘制，耗时随页数增加

---

## 当前交付文件

- ZIP：`../outputs/handwrite-studio-v3-final-cleanroom-20260913.zip`（旧 V3.0，不含本轮 V3.1 修改）
- README：`README.md`
- Architecture：`docs/ARCHITECTURE.md`、`docs/V3-ARCHITECTURE.md`
- Deployment：`docs/DEPLOYMENT.md`
- Acceptance report：`../outputs/V3-final-acceptance-report-20260913.md`
- Golden PDF：`../outputs/v3-fixed-no-template-golden.pdf`
- Golden PNG：`../outputs/v3-fixed-golden-300dpi-page1.png`

---

## 最近 ZIP

- Filename：`handwrite-studio-v3-final-cleanroom-20260913.zip`
- SHA-256：`9B472C424B7C22A7410DEC9C3F663F6F9A1E8A68C8EBE1967BC8D8ACEBBAF3C9`
- File count：184
- Clean-room：该 ZIP 的 V3.0 验收通过；V3.1 尚未重新打包

---

## 当前包管理器

pnpm 11.19.0

---

## 项目开发原则

具体长期要求参见 `AGENTS.md`。本文件只维护当前状态。
