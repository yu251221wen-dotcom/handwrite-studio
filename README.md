# 墨迹排版台 V4.3

墨迹排版台是本地优先、可选在线临时会话的通用文档手写排版器。V4.3 在 V4.2.1 基础上增加全页纸张参数预览/确认、逐页流式高 DPI 导出、OCR Lite、罗马数字自然化和表格线显示策略；原有多页 Canvas、逐行编辑、Undo/Redo 与稳定 Seed 均保留。

## V4.3 Workflow Stability + OCR Lite

- 纸张参数可先临时预览到全部页面，翻页检查后再确认；取消不写历史，确认只产生一条 Undo，行级手动偏移与涂改不会被覆盖。
- PNG/JPG/PDF 按页串行生成并复用单页导出画布；每页完成后释放位图和 Canvas backing store，提供页数、百分比、格式、DPI 与取消状态，600 DPI 仍保留并明确提示。
- OCR Lite 支持清晰、基本水平的 PNG/JPG/扫描 PDF。识别在浏览器本地完成，先进入可编辑校对区，确认后转换为 `DocumentBlock[]` 并复用同一排版、coverage 和导出链路。
- 表格中的 `II / III / IV / V` 使用稳定 Seed 进入现有字体、墨色、旋转、比例和基线波动链路；分页、拖动和换背景不会改变字迹。
- `tableLineMode` 支持 `auto / hidden / adaptive / visible`；隐藏视觉线不会删除表格行列结构，显式模式可调颜色、透明度和线宽。
- SchemaVersion 继续为 3；OCR 临时草稿和全页临时预览不写入项目 JSON，确认后的 Block 与最终表格线配置可保存恢复。

## V4.2.1 Performance & Pagination Fix

- 编辑器只挂载当前页及相邻页 Canvas；离屏页保留等高占位并可点击切换，8–10 页文档不再同时重绘全部页面。
- 预览使用屏幕级像素倍率，150/300/600 DPI 仅在导出时启用；页面拆分为背景、文字、交互覆盖三层 Canvas，辅助线和选框变化不会重绘正文。
- 滑块预览经 `requestAnimationFrame` 节流，松开时只提交一次历史状态；墨迹、涂改、辅助线和选中状态与排版计算解耦。
- 字体就绪、字符墨迹与涂改索引均有缓存；洇墨、飞白、断墨等高成本效果默认关闭，需要时再显式开启。
- 段落、列表和诊断允许使用页尾最后一个纸线槽位；标题至少与一行正文同页，连续签名按组分页，处方保持四列且可使用最后一槽。
- 分页提供逐页诊断：可用/已用/剩余槽位、下一 Block 类型、可拆分性、换页原因与所需槽位；分页后会压实可避免的正文空槽。
- 页面间不再显示 `continuation` 标签；SchemaVersion 仍为 3，旧项目可直接打开。

## V4.2 Layout & Handwriting Appearance

- 横线纸上的普通段落、列表、诊断和相邻 Block 默认连续占用纸线；标题前最多留一条结构槽位，标题后不额外空行。
- 长段落继续优先使用当前页剩余槽位；处方默认每行 4 个固定逻辑单元，长药名只在自身单元内收缩，不推动后续列。
- 签名按正文流右对齐、整体分页，不再固定到物理页底。
- 页码支持自动、纸张原生、程序生成和隐藏；程序页码位于底部中央，原生页码背景不会叠加程序页码。
- `InkStyle` 独立于字符位置随机：支持蓝黑/深蓝/蓝/黑/自定义颜色、低频深浅、轻微洇墨、飞白和断墨强度，全部由稳定 Seed 驱动。
- `CorrectionStyle` 支持手动删除线、斜划、涂抹、插入号和补写；自动模式仅对保守判定的叙述正文生效，并排除标识、日期、数字、诊断、药物剂量与签名。
- SchemaVersion 保持 3；旧 V3 JSON 打开时补齐 V4.2 默认值，不重排已有页面，也不改变手动偏移和 Seed。

## Development Context

Before modifying this project, read:

1. `AGENTS.md`
2. `PROJECT_STATUS.md`

`AGENTS.md` contains long-term project rules.

`PROJECT_STATUS.md` contains the current implementation state and next task.

Do not duplicate long-term requirements in each development prompt.

## V4.1 Background-aware Layout

- 启用横线适配后，每行正文直接占用一个连续纸线槽位，不再先按普通 `autoY` 排版后就近吸附。
- 普通段落、List 和诊断条目默认连续逐线书写；块间像素间距只会换算成跳过 0/1/N 条完整纸线。
- 首条和末条可写横线决定每页可用槽位，槽位用完后由同一 Block-aware 引擎自动分页。
- 横线检测同时估算可写左右边界；第一条可写横线、最后一条可写横线、左边界、右边界和整体基线偏移均可手动调整。
- `manualOffsetX/Y`、字符 Seed、Block 来源索引和 Missing=0 完整性约束保持不变。
- 没有启用横线的背景继续使用原有普通像素排版分支。

## V4.0 基础能力

- 上传 TTF/OTF 经过 `FontFace.load()`、`document.fonts.load()`、`document.fonts.ready` 和验收 Canvas 像素校验；失败时明确禁用，不允许静默回退。
- 页面级横线适配保存检测开关、横线 Y 坐标、平均行距、置信度、吸附开关、整体 Y 偏移和辅助线显示状态。
- 内置横线纸直接使用精确坐标；用户上传水平横线纸使用纯前端行投影检测，不引入 OpenCV 或新的部署依赖。
- 基线位置使用 `autoY + lineSnapOffset + manualOffsetY`；V4.1 纸线槽位分支直接把 `autoY` 放在目标纸线基线上。换 Seed 不改变位置，拖动行仍只修改手动偏移。
- 支持自动检测、开启/关闭吸附、行距/Y 偏移校准、添加/删除横线、重置和字号/行距建议；检测辅助线不会进入 PNG/PDF。
- List/诊断 Block 使用更紧凑的专用行距，普通正文排版不变。

## V3.1 基础能力

- 排版方式：统一使用 `no-template`；默认“保留原文结构”，另有“简化正文”。
- DocumentBlock：Heading、Paragraph、KeyValue、List、Table、Prescription、Signature，均保存原文顺序和来源区间。
- Block-aware 分页：标题与下文同页、长段落优先使用当前页剩余空间、表格按行、中药按 item/row、签名尽量整体保留，并提供基础 widow/orphan 控制。
- 页面管理：新增空白页、复制、上下移动、拖拽排序、安全删除；页面变更进入统一 Undo/Redo 历史。
- 页面级 `pageType`、`pageTemplateId`、背景、Fit/Cover/Stretch 和变换参数均可保存恢复。
- 旧固定病历模板和 mapped/unmapped 状态仅保留 JSON 迁移兼容，正式 UI、DOCX API 和布局路由均不再调用。
- Block-aware coverage 显示 Raw、Recognized、Laid out、Ignored、Missing；验收要求 Missing = 0。
- 文档布局设置：A4 页边距、字号、行距、字距、段距、首行缩进、标题字号、基本信息列数和处方列数。
- `schemaVersion: 3`；支持 V1→V2→V3 和 V2→V3 迁移。
- 自动保存只写当前匿名会话的解析后 ProjectState，不保存原 DOCX 二进制。

## 继续保留的 V2 能力

- 双层 Canvas：背景与文字独立。
- 字符级水平/垂直偏移、旋转、字号、宽高、基线、深浅和低频连续趋势。
- 同文档、同字体、同参数、同 Seed 完全复现；随机 key 不依赖页码、坐标或背景。
- 逐行选择、拖动、锁定，以及 X/Y、字号、字距、旋转和行距调整。
- 30 个字体资源位、TTF/OTF 上传；30 种程序化纸张和 JPG/JPEG/PNG 上传。
- 150/300/600 DPI PNG/JPG；A4 300 DPI 为 2480×3508；FastAPI 合成真正多页 PDF。

## 隐私与在线会话

- 本地隐私模式不调用第三方 AI，也不采集正文 Analytics。
- 在线模式先创建 128-bit 随机匿名 Session；文档解析、字体、背景、项目和临时导出按 Session 目录隔离。服务重启导致匿名 Session 失效时，前端会重新建会话并重试一次。
- 原 DOCX 只在请求内存中解析，不写浏览器持久存储；临时目录默认 24 小时过期。
- 上传检查扩展名、MIME、大小和文件签名，服务端资源使用 UUID 文件名。
- 公网 Showcase 只使用 `lib/demo` 中的脱敏合成内容；真实 cardiology fixture 仅位于 `tests/fixtures`，不会进入 `public` 或 Showcase bundle。

## 包管理器

项目统一使用 `pnpm 11.19.0`，以 `pnpm-lock.yaml` 为唯一 lock 文件。

## 本地启动

需要 Node.js 22.13+ 和 Python 3.11+。复制 `.env.example` 为 `.env.local`（前端）并在后端进程设置同名服务端变量；默认值可直接用于本机开发。

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

另开一个 PowerShell：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r server\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8000
```

- 编辑器：`http://localhost:5173/`
- V4 Showcase：`http://localhost:5173/showcase`
- FastAPI health：`http://127.0.0.1:8000/health`

## 测试

先创建 `.venv` 并安装 Python 依赖。TypeScript Golden 测试会调用当前项目自己的 Python 解析器；HTTP 验收会启动独立临时 API 进程。Python 版本通过 `server/requirements-lock.txt` 锁定。

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

真实 Golden fixture 使用 ASCII 文件名 `tests/fixtures/cardiology-inpatient-record.docx`。它只用于获授权的本地测试和最终源码包，不会发布到公网静态目录。

## 字体版权

30 个字体资源位由 4 个本机系统字体引用和 26 个用户自定义槽位组成。项目不捆绑来源或授权不明确的中文手写字体。用户上传字体按 Session 保存，不会成为其他用户的字体。

## 部署

前端公网版本使用 Cloudflare Pages 的 Next.js 静态导出，FastAPI 使用 `Dockerfile.api` 部署到 Railway。本地/Vinext 构建保持不变；Pages 使用独立的 `pnpm build:pages`，产物目录为 `out`。生产环境必须设置真实 `NEXT_PUBLIC_API_BASE_URL`、HTTPS `PUBLIC_API_BASE_URL` 与精确 `ALLOWED_ORIGINS`，不得使用通配 CORS。详见 [部署说明](docs/DEPLOYMENT.md)、[V3 文档排版架构](docs/V3-ARCHITECTURE.md) 和 [V4 横线适配架构](docs/V4-ARCHITECTURE.md)。

## 本轮明确暂缓

2026-09-13 字符漏绘修复：Block 行保存 `sourceCharacterIndices`，布局分列符不消耗原文字迹状态；旧 V3 JSON 打开时补充该索引，不移动已有行。状态不足或索引损坏时绘制/导出明确报错，不再静默导出残缺图片。Golden 测试直接记录 Canvas `fillText` 调用，逐页校验实际绘出的字符，而不仅比较排版元数据。

完整性检查比较实际行文本，不使用映射标记或原文副本代替最终绘制内容；发现缺失或损坏会阻止导出。

当前限制：自动排版后手工改页次可保存，但再次全局重排会重建自动页顺序；跨软件关闭的草稿恢复受浏览器 Session 生命周期限制，请使用保存 JSON；字体依赖本机已安装字体或用户上传，跨设备应上传同一字体以保持视觉一致。高 DPI 导出按页串行绘制，耗时与页数相关。

PaddleOCR 服务、手写字 OCR、复杂多栏/表格 OCR 重建、AI/LLM 字段匹配、Hough Transform、自动透视校正、四角透视拖拽、弯曲纸张、SVG Path 笔画扰动、自动圈画与 AI 生成笔迹仍未实现。OCR Lite 和横线检测只支持无明显透视、基本水平的清晰输入；自动涂改仅为低概率、安全文本规则，不是语义纠错或 AI 生成。
