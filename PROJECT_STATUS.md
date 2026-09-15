# PROJECT_STATUS.md

## 项目

墨迹排版台 / handwrite-studio

---

## 当前版本

- Version：4.2.0（V4.2，本地已完成；公网待推送授权）
- SchemaVersion：3
- 更新日期：2026-09-16
- GitHub：`https://github.com/yu251221wen-dotcom/handwrite-studio`
- V4 实现提交：`e6926cdf07dd0116e68ee6d9c34243de65596448`
- 横线吸附防重叠修复：`41ebf6e55ecb345c7c3b6534c51a3addff629405`
- V4 公网背景与单调吸附修复：`e83bb92`
- V4.1 背景感知纸线槽位布局：`1282c2f`
- V4.2 排版与手写外观：`3a24d79`

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
- [x] 横线吸附单调一一匹配（动态规划），禁止两行正文吸到同一纸线
- [x] 横线匹配诊断（文字行、纸线、基线差值、重复分配数）
- [x] 背景感知纸线槽位布局（横线纸以检测到的物理纸线作为纵向主坐标系）
- [x] 第一/最后可写横线、左右可写边界和基线偏移手动校准
- [x] 连续正文/列表逐纸线排布；标题和段间距用整条纸线槽位表达
- [x] V4.2 横线纸连续槽位：普通 Block 不留空行、标题/签名前至多一槽
- [x] 处方自动四列固定锚点、长药名单元内收缩与裁切
- [x] 签名正文流右对齐、整体续页、不固定页底
- [x] 页码 auto/native/generated/hidden；程序页码底部居中且可避让原生页码
- [x] 独立 InkStyle：墨色、低频深浅、洇墨、飞白、断墨
- [x] 独立 CorrectionStyle：手动划改/涂抹/插入/补写与保守自动模式
- [x] V4.2 外观状态保存到 Schema V3 JSON；旧 V3 无重排补默认值
- [x] 可写纸线耗尽后自动分页；不再在检测范围外虚构纸线
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
- [x] 公网 Session 创建与资源读取的单次瞬时失败重试
- [x] 字体/背景资源列表独立加载，一个资源失败不再拖垮另一个页面
- [x] 上传背景预览、检测与导出统一使用经 Session 验证的 Blob 资源
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
- SVG Path / 笔画级字形扰动（本轮仅做 Canvas 墨迹外观层）

---

## 当前最高优先级

当前阶段：V4.2 本地实现和验收已完成，等待明确授权推送到现有 GitHub `main` 并触发公网部署

1. Cloudflare Pages 正式前端保持可用
2. 保持 Session isolation、精确 CORS 和 `/health`
3. 保持 Golden Test Missing = 0
4. 保持 `autoY + lineSnapOffset + manualOffsetY`、纸线槽位唯一分配和 Seed 稳定性
5. 不提前开发 OCR、透视或 AI 字形

---

## 下一阶段

下一阶段仅建议 **V4.3 Real-case Polish**：继续用真实但不公开的本地样本做处方、签名、复杂页尾和墨迹参数微调。透视、OCR、AI 字段匹配和 AI 字迹继续暂缓。

---

## 最近测试结果

- TypeScript：45 / 45 通过
- Python：16 / 16 通过
- Typecheck：通过
- ESLint：0 error
- Build：Vinext production build 通过
- Cloudflare Pages 静态导出：通过；4 个正式路由均生成到 `out/`
- FastAPI health：本地通过，`status=ok`、`version=4.2.0`；公网仍为 V4.1，待推送部署
- Golden Test：Raw 3657 / Laid out 3657 / Missing 0；实际 Canvas `fillText` 覆盖率通过
- 公网 DOCX：合成长文档 Raw 3097 / Laid out 3097 / Missing 0，DocumentBlock 5，自动排版 7 页
- 横线检测：标准/噪声/粗线双边缘合并单测通过；纯白背景不会误启用吸附
- 横线布局：检测纸线是纵向主坐标系；正文/列表连续占用物理纸线；纸线索引严格递增；重复分配为 0；纸线不足时分页，不在边缘外延伸虚构纸线
- 背景感知 Golden：Raw 3657 / Laid out 3657 / Missing 0；每页 20 条可写纸线，共 10 页
- V4.2 Golden：Preserve structure 9 页、Simplified 9 页、背景感知 10 页；Raw 3657 / Laid out 3657 / Missing 0；Canvas 实际字符绘制覆盖通过
- V4.2 排版：处方 `auto` 为 `4 + 4 + 1` 单元；签名两行整体续页并右对齐；普通段落/列表连续占用纸线槽位
- V4.2 墨迹：同参数同 Seed 完全一致、换 Seed 不同；key 不含 pageIndex/x/y/background；飞白/断墨只在透明文字层切出细纹，不擦除背景
- V4.2 页码：程序页码位于底部中央；背景标记原生页码后程序页码隐藏；两种状态均经浏览器预览和 300 DPI PNG 验证
- V4.2 涂改：合成示例“姓名”双删除线与“患者”上方补写进入最终导出；原文字仍完整绘制，Missing 保持 0
- V4.2 浏览器：三栏 UI、墨迹面板、涂改面板、页码模式实际可操作；编辑器和 Showcase 控制台 0 error/warning
- V4.2 PNG：浏览器真实导出并程序读取为 2480 × 3508 RGBA PNG
- V4.2 PDF：当前 FastAPI 真实生成 3 页，程序读取 page count = 3；每页约 595.28 × 842.03 pt（A4），Poppler 回渲检查通过
- V4.1 浏览器验收：淡蓝横线 40 识别 21 条，连续正文使用相邻纸线；首尾可写横线改为 3–6 后自动分为 2 页；恢复后 1–21 行，左右边界校准生效
- 公网横线预设：轻噪扫描横线纸识别 18 条，置信度 100%
- 公网上传背景：真实 UI 连续上传合成 PNG 与 JPG 均成功；同一 Session 列表可见两项，上传资源按 Session 隔离
- 公网背景检测：合成横线纸识别 21 条，平均行距 37 px，置信度 100%；8 行文字按 `1→1、2→2、3→3、4→5、5→6、6→7、7→8、8→9` 匹配，所有基线差值为 -2 px，重复分配 0
- 横线稳定性：换 Seed 不改变最终 Y；分页、背景切换和拖动不进入字符随机 key
- 吸附防重叠：旧冲突组回退已由全局单调一一匹配替代；段间距通过跳过纸线保留，最终 PNG/PDF 无文字重叠
- 公网自定义字体：Geist TTF 经 `FontFace.load()`、`document.fonts.load/ready/check` 和应用 Canvas 像素指纹验证成功，当前行真实选择 `Geist-Regular`
- 公网 Session isolation：新浏览器会话未读取到另一会话上传的字体、背景或长文档状态
- 公网 CORS：正式前端 Origin 允许，预检 200，`X-Session-ID` 已允许
- 公网资源：TTF 与合成 PNG 上传成功；返回 URL 为直接 HTTPS；文件响应 200 且 CORS 精确匹配正式前端
- 公网 PNG：从 V4.1 正式 Pages UI 导出，实测 2480 × 3508 px（A4 300 DPI）；淡蓝横线背景与文字槽位均存在，不含红色检测辅助线
- 公网 PDF：从 V4.1 正式 Pages UI 独立导出，程序读取为 1 页；300 DPI 回渲尺寸 2481 × 3509，与 PNG 对齐后平均像素差 0.531 / 255，无浏览器页眉、默认边距或额外页面；长文档链路另由 Golden 覆盖 10 页
- UI：桌面三栏结构保持；字体 30 资源位、背景 31 个不同预设；控制台 0 error/warning；移动端沿用 V3.1 已验收的非破版响应式结构
- Cloudflare Pages：4 个正式路由 `/`、`/font-library/`、`/background-library/`、`/showcase/` 均为 HTTP 200
- Clean-room：V3.0 最近一次通过；V4.1 尚未重新打包和执行 clean-room

V4.1 完整源码测试、本地验收和公网验收均已通过。正式 ZIP 与 clean-room 仍需在单独的源码交付轮次更新。

---

## 当前 Golden 输出

- Preserve structure pages：10（V3.1.1 前为 11；减少可避免页尾空白）
- Simplified pages：10
- 300 DPI：2480 × 3508 px
- PDF：真正多页导出链路测试通过；页数与 `pages.length` 一致

---

## 当前本地地址

- Frontend：V4.2 运行于 `http://localhost:5173/`
- Showcase：V4.2 运行于 `http://localhost:5173/showcase`
- Backend：V4.2 运行于 `http://127.0.0.1:8000`
- Health：本地验证 `status=ok`、`version=4.2.0`

---

## 当前公网地址

- Frontend：`https://handwrite-studio.pages.dev/`
- API：`https://handwrite-studio-api-production.up.railway.app`
- Health：`https://handwrite-studio-api-production.up.railway.app/health`（HTTP 200，`status=ok`、`version=4.1.0`、`environment=production`）
- Showcase：`https://handwrite-studio.pages.dev/showcase/`

当前公网仍为 V4.1；V4.2 推送因外发授权未获批准而暂停，没有绕过授权发布。

---

## 当前部署状态

Railway FastAPI production 后端已部署 V4.1：服务 `handwrite-studio-api`，构建器 `DOCKERFILE`，路径 `Dockerfile.api`。公网 HTTPS `/health` 已通过。`ALLOWED_ORIGINS` 精确设置为 `https://handwrite-studio.pages.dev`。Render 因绑卡要求停用。

Cloudflare Pages production 前端当前仍部署 V4.1：项目 `handwrite-studio`，正式域名 `https://handwrite-studio.pages.dev`，生产构建命令 `pnpm build:pages`，输出目录 `out`。生产环境使用 `NEXT_PUBLIC_API_BASE_URL=https://handwrite-studio-api-production.up.railway.app` 和 `NODE_VERSION=22.16.0`。V4.2 本地提交为 `3a24d79`，等待明确授权推送后由现有流水线发布。

---

## 当前已知问题

- Railway 冷启动或瞬时网络中断仍可能增加首次加载时间；前端会对 Session 创建和资源读取自动重试一次
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

- ZIP：`../outputs/handwrite-studio-v3-final-cleanroom-20260913.zip`（旧 V3.0，不含 V4.0/V4.1 修改）
- README：`README.md`
- Architecture：`docs/ARCHITECTURE.md`、`docs/V3-ARCHITECTURE.md`、`docs/V4-ARCHITECTURE.md`
- Deployment：`docs/DEPLOYMENT.md`
- Acceptance report：`../outputs/V3-final-acceptance-report-20260913.md`
- Golden PDF：`../outputs/v3-fixed-no-template-golden.pdf`
- Golden PNG：`../outputs/v3-fixed-golden-300dpi-page1.png`
- V4 修复公网 PDF：`../outputs/v4-fix-public-export.pdf`
- V4 修复公网 PNG：`../outputs/v4-fix-public-export-300dpi.png`
- V4.1 背景感知公网 PDF：`output/pdf/v4.1-background-aware-public.pdf`
- V4.1 背景感知公网 PNG：`output/png/v4.1-background-aware-public-300dpi.png`
- V4.2 本地 300 DPI PNG：`output/png/v4.2-layout-appearance-final-300dpi.png`
- V4.2 本地三页 PDF：`output/pdf/v4.2-layout-appearance-demo-3pages.pdf`

---

## 最近 ZIP

- Filename：`handwrite-studio-v3-final-cleanroom-20260913.zip`
- SHA-256：`9B472C424B7C22A7410DEC9C3F663F6F9A1E8A68C8EBE1967BC8D8ACEBBAF3C9`
- File count：184
- Clean-room：该 ZIP 的 V3.0 验收通过；V4.1 尚未重新打包

---

## 当前包管理器

pnpm 11.19.0

---

## 项目开发原则

具体长期要求参见 `AGENTS.md`。本文件只维护当前状态。
