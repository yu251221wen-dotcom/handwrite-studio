# PROJECT_STATUS.md

## 项目

墨迹排版台 / handwrite-studio

---

## 当前版本

- Version：4.0.0（V4.0）
- SchemaVersion：3
- 更新日期：2026-09-15
- GitHub：`https://github.com/yu251221wen-dotcom/handwrite-studio`
- V4 实现提交：`e6926cdf07dd0116e68ee6d9c34243de65596448`
- 横线吸附防重叠修复：`41ebf6e55ecb345c7c3b6534c51a3addff629405`

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
- [x] 上传字体 FontFace / document.fonts / Canvas 真实加载校验
- [x] 横线纸自动检测（水平、无透视）
- [x] 页面级横线坐标、置信度和校准状态
- [x] 文字基线吸附与检测辅助线
- [x] 横线行距、整体 Y 偏移、添加/删除/重置和布局建议
- [x] 横线吸附冲突回退，禁止两行正文吸到同一纸线
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
- [x] 公网字体/背景 HTTPS 资源链路
- [x] 失效匿名 Session 自动刷新一次
- [x] 长段落剩余页空间利用优化
- [x] 固定标题栏与三栏独立滚动
- [x] Template Mapping production path removed / disabled
- [x] Cloudflare Pages production frontend
- [x] Railway exact-origin CORS for the Pages frontend
- [ ] V4 clean-room / source ZIP

勾选依据为当前源码实现及最近验收记录；不代表暂缓路线功能已经完成。

---

## 当前未完成

- 透视校正
- OCR
- 字形级手写增强

---

## 当前最高优先级

当前阶段：V4.0 横线适配与字体加载收尾已完成并部署公网

1. Cloudflare Pages 正式前端保持可用
2. 保持 Session isolation、精确 CORS 和 `/health`
3. 保持 Golden Test Missing = 0
4. 保持 `autoY + lineSnapOffset + manualOffsetY` 和 Seed 稳定性
5. 不提前开发 OCR、透视或 AI 字形

---

## 下一阶段

V4.0 已完成。下一阶段可进入 V5 纸张倾斜和四角透视校准，但在用户明确开始前不提前开发；OCR、AI 字段匹配和 AI 字迹继续暂缓。

---

## 最近测试结果

- TypeScript：34 / 34 通过
- Python：16 / 16 通过
- Typecheck：通过
- ESLint：0 error
- Build：Vinext production build 通过
- Cloudflare Pages 静态导出：通过；4 个正式路由均生成到 `out/`
- FastAPI health：本地与公网均通过，`status=ok`、`version=4.0.0`
- Golden Test：Raw 3657 / Laid out 3657 / Missing 0；实际 Canvas `fillText` 覆盖率通过
- 公网 DOCX：合成长文档 Raw 3097 / Laid out 3097 / Missing 0，DocumentBlock 5，自动排版 7 页
- 横线检测：标准/噪声/粗线双边缘合并单测通过；纯白背景不会误启用吸附
- 公网横线预设：轻噪扫描横线纸识别 18 条，置信度 100%
- 公网上传背景：合成横线纸识别 15 条，置信度 100%；上传资源按 Session 隔离
- 横线稳定性：换 Seed 不改变最终 Y；分页、背景切换和拖动不进入字符随机 key
- 吸附冲突：不兼容行距命中同一纸线时回退冲突组的原始 `autoY`，最终 PNG/PDF 目视无文字重叠
- 公网自定义字体：Geist TTF 经 `FontFace.load()`、`document.fonts.load/ready/check` 和应用 Canvas 像素指纹验证成功，当前行真实选择 `Geist-Regular`
- 公网 Session isolation：新浏览器会话未读取到另一会话上传的字体、背景或长文档状态
- 公网 CORS：正式前端 Origin 允许，预检 200，`X-Session-ID` 已允许
- 公网资源：TTF 与合成 PNG 上传成功；返回 URL 为直接 HTTPS；文件响应 200 且 CORS 精确匹配正式前端
- 公网 PNG：V4 防重叠修复版实测 2480 × 3508 px（A4 300 DPI），不含红色检测辅助线
- 公网 PDF：V4 防重叠修复版为 A4 MediaBox，程序读取页数正确；长文档链路实测导出 7 页
- UI：桌面三栏结构保持；字体 30 资源位、背景 31 个不同预设；控制台 0 error/warning；移动端沿用 V3.1 已验收的非破版响应式结构
- Cloudflare Pages：4 个正式路由 `/`、`/font-library/`、`/background-library/`、`/showcase/` 均为 HTTP 200
- Clean-room：V3.0 最近一次通过；V4.0 尚未重新打包和执行 clean-room

V4.0 完整源码测试与公网验收已通过；正式 ZIP 与 clean-room 需在单独的源码交付轮次更新。

---

## 当前 Golden 输出

- Preserve structure pages：10（V3.1.1 前为 11；减少可避免页尾空白）
- Simplified pages：10
- 300 DPI：2480 × 3508 px
- PDF：真正多页导出链路测试通过；页数与 `pages.length` 一致

---

## 当前本地地址

- Frontend：V4.0 运行于 `http://localhost:5173/`
- Showcase：V4.0 可由 `http://localhost:5173/showcase` 验收
- Backend：V4.0 运行于 `http://127.0.0.1:8000`
- Health：本地与公网均验证 `status=ok`、`version=4.0.0`

---

## 当前公网地址

- Frontend：`https://handwrite-studio.pages.dev/`
- API：`https://handwrite-studio-api-production.up.railway.app`
- Health：`https://handwrite-studio-api-production.up.railway.app/health`（HTTP 200，`status=ok`、`version=4.0.0`、`environment=production`）
- Showcase：`https://handwrite-studio.pages.dev/showcase/`

---

## 当前部署状态

Railway FastAPI production 后端已部署 V4.0：服务 `handwrite-studio-api`，构建器 `DOCKERFILE`，路径 `Dockerfile.api`。公网 HTTPS `/health` 已通过。`ALLOWED_ORIGINS` 精确设置为 `https://handwrite-studio.pages.dev`。Render 因绑卡要求停用。

Cloudflare Pages production 前端已部署 V4.0：项目 `handwrite-studio`，正式域名 `https://handwrite-studio.pages.dev`，生产构建命令 `pnpm build:pages`，输出目录 `out`。生产环境使用 `NEXT_PUBLIC_API_BASE_URL=https://handwrite-studio-api-production.up.railway.app` 和 `NODE_VERSION=22.16.0`。当前 production deployment 为提交 `41ebf6e`，预览部署 URL 为 `https://2dcb9e6d.handwrite-studio.pages.dev`。

---

## 当前已知问题

- Cloudflare / Vite 开发运行时可能在类型初始化时出现 `fetch failed` / `ECONNRESET`；production build 和本地生产预览稳定
- 旧 `chatgpt.site` 在手机移动网络触发 Cloudflare block，已停止作为正式公网入口
- Cloudflare Pages 已完成桌面浏览器及 390 × 844 移动视口验收；真实蜂窝移动网络仍需用户在手机实机打开正式域名确认
- 旧字段布局引擎与字段映射模块仍作为迁移兼容源码保留，但没有正式运行入口
- 自动排版后手工改页次可保存，但再次全局重排会重建自动页顺序
- 跨软件关闭的草稿恢复受浏览器 Session 生命周期限制，应使用项目 JSON
- 字体视觉一致性依赖同一设备字体或用户上传同一字体
- 高 DPI 导出按页串行绘制，耗时随页数增加
- 横线检测仅支持基本水平、无明显透视的纸张；旋转超过容差时会要求先归零
- 用户上传的纸张照片如果本身含旧文字，导出仍会保留这些背景内容；应使用空白纸张照片

---

## 当前交付文件

- ZIP：`../outputs/handwrite-studio-v3-final-cleanroom-20260913.zip`（旧 V3.0，不含 V4.0 修改）
- README：`README.md`
- Architecture：`docs/ARCHITECTURE.md`、`docs/V3-ARCHITECTURE.md`、`docs/V4-ARCHITECTURE.md`
- Deployment：`docs/DEPLOYMENT.md`
- Acceptance report：`../outputs/V3-final-acceptance-report-20260913.md`
- Golden PDF：`../outputs/v3-fixed-no-template-golden.pdf`
- Golden PNG：`../outputs/v3-fixed-golden-300dpi-page1.png`

---

## 最近 ZIP

- Filename：`handwrite-studio-v3-final-cleanroom-20260913.zip`
- SHA-256：`9B472C424B7C22A7410DEC9C3F663F6F9A1E8A68C8EBE1967BC8D8ACEBBAF3C9`
- File count：184
- Clean-room：该 ZIP 的 V3.0 验收通过；V4.0 尚未重新打包

---

## 当前包管理器

pnpm 11.19.0

---

## 项目开发原则

具体长期要求参见 `AGENTS.md`。本文件只维护当前状态。
