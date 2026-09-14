# AGENTS.md

## 1. 项目名称

墨迹排版台  
handwrite-studio

---

## 2. 项目定位

这是一个将 DOCX 等文档转换成自然手写风格多页图片或 PDF 的文档排版工具。

当前产品方向已经确定：

> 以“无模板结构保留排版”为核心。

不再继续开发复杂的固定模板字段自动映射系统。

项目最终目标是支持病历、教案、实习记录、学习笔记和普通 Word 文档转换为具有自然手写视觉效果的多页文档。

---

## 3. 当前核心产品流程

DOCX → 文档解析 → DocumentBlock → 结构保留 → 自动换行 → 自动分页 → 手写渲染 → 用户人工微调 → PNG / JPG / PDF。

支持本地隐私运行和 HTTPS 公网在线运行。

---

## 4. 固定 Golden Test

主要真实测试文件：

`tests/fixtures/cardiology-inpatient-record.docx`

该文件来源于用户提供的《心内大病历(1).docx》。以后所有重要排版改动必须优先使用该文件测试。

人工 3000 字、5000 字测试文本仅用于压力测试，不再作为主要产品功能验收样例。

---

## 5. Golden Test 内容要求

该真实病历至少包含：

- 入院记录
- 姓名、性别、年龄、职业、民族、婚姻状况、出生地
- 入院日期、记录日期、发病节气、病史陈述者、可靠程度
- 主诉、现病史、刻下症、既往史、过敏史、个人史、婚育史、家族史
- 中医望闻切诊、体格检查、专科检查、心脏相对浊音界
- 辅助检查、拟诊讨论
- 中医辨病辨证依据、中医鉴别诊断
- 西医诊断依据、西医鉴别诊断
- 初步诊断、诊疗计划、中药处方、中医外治
- 带教老师、规培医师

任何开发不能导致上述内容静默丢失。

---

## 6. 产品范围

### 必须长期保留

#### 文档处理

- DOCX 导入
- 原文结构解析
- 无模板排版
- 保留原文结构模式
- 简化正文模式

#### DocumentBlock

保留并继续完善：

- HeadingBlock
- ParagraphBlock
- KeyValueBlock
- ListBlock
- TableBlock
- PrescriptionBlock
- SignatureBlock

#### 排版

- `measureText()` 实际字宽测量
- 中文自动换行
- 标点禁则基础处理
- Block-aware 自动分页
- Heading keepWithNext
- Widow / Orphan 基础控制
- 多页连续编辑

#### 页面

- `pages[]`
- 新增、复制、删除和排序页面
- 页面背景
- 页面类型

#### 手写

- 字体管理
- TTF / OTF 上传
- 字符级随机扰动
- 低频连续书写趋势
- Seed 与 Seed 可复现
- 固定笔迹
- 整洁 / 自然 / 凌乱
- 手写自然度

#### 编辑

- 逐行选择和拖动
- X / Y
- 字号、字距、行距、旋转、字体
- Undo / Redo

#### 背景

- 白纸、横线纸、程序化纸张
- JPG / JPEG / PNG
- 用户上传背景
- Fit / Cover / Stretch
- brightness / contrast / saturation / blur / noise / rotation

#### 项目

- JSON 保存与恢复
- schema migration
- 自动布局坐标
- manualOffset
- 项目状态恢复

#### 导出

- PNG / JPG / PDF
- 真正多页 PDF
- A4
- 150 / 300 / 600 DPI

---

## 7. 已砍掉的产品方向

不再继续开发复杂模板字段映射，包括：

- 任意 DOCX 自动映射到固定病历模板字段
- mappedBlocks / unmappedBlocks 的复杂模板工作流
- 自动将正文强制塞进固定字段坐标
- 任意文档自动适配任意表单模板

旧代码如果仍存在，可以暂时保留兼容，但不再增加功能、不再修复杂映射算法、不允许影响无模板模式，后续可逐步删除。

---

## 8. “模板”以后重新定义

以后项目中的“模板”如果继续存在，仅指页面样式预设，例如页边距、背景、标题样式、默认字号、行距、字距、页眉、页脚和页面布局。

模板不再负责“把某段内容自动映射到某固定字段”。

---

## 9. 无模板模式是核心模式

默认优先 `no-template`。

### preserve-structure（保留原文结构）

这是默认模式，尽可能保留标题、段落、编号、列表、基本信息、表格、处方、签名和原文顺序。

### simplified（简化正文）

主要保留标题、段落和编号，适合教案、学习笔记和一般文本。

两者必须共用同一套 Layout Engine。

---

## 10. Block 数据模型原则

ParsedDocument 应以 `blocks[]` 作为主要结构。每个 Block 必须有稳定 ID，至少保存：

- blockId
- type
- sourceOrder
- sourceStart
- sourceEnd
- sourceText

不得只保存最终视觉行。

---

## 11. Source Traceability

任何最终文字都应尽量能够追踪到原文。必须保留 `sourceOrder`、`sourceStart`、`sourceEnd` 和 `sourceText`。以后 OCR 接入时也遵循相同结构。

---

## 12. 数据完整性原则

这是最高优先级原则之一。任何情况下禁止静默删除用户正文。

Coverage Validator 至少统计：

- Raw characters
- Recognized characters
- Laid out characters
- Explicitly ignored characters
- Missing characters

正式验收要求 `Missing = 0`。如果用户明确删除内容，可以记录为 Explicitly ignored，但不能记录为 Missing。

---

## 13. Golden Test 验收标准

使用 `cardiology-inpatient-record.docx` 必须验证：

- 基本信息存在
- 主诉、现病史、既往史完整
- 中医望闻切、体格检查、专科检查完整
- 心脏浊音界结构可读
- 辅助检查和拟诊讨论存在
- 初步诊断、诊疗计划、中药处方完整
- SignatureBlock、带教老师、规培医师存在
- Missing = 0

---

## 14. TableBlock 原则

表格不能被压成不可读连续字符串。必须尽量保留 rows、columns、cells 和 column alignment。心脏相对浊音界是固定测试对象。

---

## 15. PrescriptionBlock 原则

中药的“药名 + 剂量”应视为相对原子 item，例如“黄芪 15g”，不能轻易拆为“黄芪”和“15g”。处方支持 2 列、3 列、4 列和 auto。

---

## 16. SignatureBlock 原则

支持带教老师、规培医师、实习医师、住院医师、主治医师、教师和学生。SignatureBlock 尽量整体保持在同一页。

---

## 17. 自动布局与人工布局分离

必须长期保持：

`finalX = autoX + manualOffsetX`

`finalY = autoY + manualOffsetY`

禁止拖动后直接永久覆盖自动布局坐标，这样重新排版后才能尽量保留用户微调。

---

## 18. 手写 Seed 稳定性原则

同一个 documentId、blockId / fieldId、characterGlobalIndex、seed 和 handwriting settings 必须得到相同笔迹。

核心随机 Key 禁止依赖 pageIndex、x、y 或 background。因此换背景、拖动、页面重排和自动分页不能无理由改变字迹。

---

## 19. 页面删除安全原则

删除空白页可以直接进行。删除含正文页面不得静默丢失正文，优先自动重新排版内容。如果用户要求同时删除内容，必须明确确认。所有页面操作必须支持 Undo。

---

## 20. 输出规范

- A4 150 DPI：1240 × 1754
- A4 300 DPI：2480 × 3508
- A4 600 DPI：4961 × 7016

默认使用 A4 + 300 DPI。

---

## 21. PDF 原则

PDF 必须真正多页，`page count = pages.length`，页面尺寸正确，不依赖 `window.print()` 作为唯一正式导出，并且视觉效果与 Canvas 一致。

---

## 22. 600 DPI 内存原则

600 DPI 页面非常大。避免一次同时在浏览器内存中保存大量 4961 × 7016 Canvas。优先单页生成、导出、释放，再处理下一页。以后长文档 600 DPI 重点防止内存爆炸。

---

## 23. 字体原则

支持 TTF、OTF、本地字体和用户上传字体。不得为了凑“30 字体”下载来源不明或版权不清晰字体，内置字体必须合法可分发。

---

## 24. 隐私原则

项目可能处理真实病历，必须默认遵守：

- 不发送正文给第三方 AI
- 不发送给第三方 Analytics
- 不把完整病历写普通日志
- 不把测试真实病历放公网静态资源
- 临时文件有 TTL
- 用户数据隔离，用户 A 看不到用户 B 数据

---

## 25. 本地模式

本地模式必须长期保留。即使以后公网部署完成，也必须支持前端本地启动和 FastAPI 本地启动，敏感病历用户可完全本地处理。

---

## 26. 公网是正式产品要求

以后最终交付不能只有 localhost、127.0.0.1 或局域网地址，必须提供 HTTPS 公网地址。最终报告至少包含 Frontend URL、API URL 和 Showcase URL。

---

## 27. 公网部署原则

公网版本必须支持 HTTPS、手机网络访问、不依赖同一局域网、Session 隔离、上传安全、正确 CORS 和可用的 `/health`。开发 Tunnel 只能用于调试，不算最终公网交付。

---

## 28. API 地址

禁止前端各处硬编码 localhost 或 127.0.0.1，统一使用 `NEXT_PUBLIC_API_BASE_URL`。

---

## 29. Environment

必须保留 `.env.example`，至少包含：

```dotenv
NEXT_PUBLIC_API_BASE_URL=
ALLOWED_ORIGINS=
UPLOAD_DIR=
TEMP_FILE_TTL_HOURS=
MAX_UPLOAD_SIZE_MB=
ENVIRONMENT=
```

禁止真实 secrets 提交源码。

---

## 30. Session

公网无登录阶段使用匿名 Session。不同 Session 的 DOCX、字体、背景、项目、PDF 和 PNG 必须相互隔离。

---

## 31. 上传安全

服务器上传不能直接使用用户原始文件名作为真实路径，必须使用 UUID / random ID，防止 path traversal、overwrite 和 arbitrary execution，并限制扩展名、MIME 和文件大小。

---

## 32. Showcase

公网 Showcase 只能使用合成数据或脱敏数据，不能出现真实患者姓名、病案号、地址和真实敏感信息。

---

## 33. 暂缓功能

未经用户明确要求前，不主动开发：

- OCR / PaddleOCR / 扫描 PDF OCR
- LLM / AI 字段匹配
- 自动横线检测 / Hough Transform
- 自动透视 / 四点透视
- SVG Path 字形扰动 / AI 字迹
- 自动涂改 / 圈画

---

## 34. 后续路线

### V3.1

- 清理复杂模板映射代码
- 只保留无模板主流程
- 完成正式公网部署

### V4

- 横线纸检测
- 横线位置识别
- 文字基线吸附横线

### V5

- 用户上传真实纸张
- 纸张倾斜
- 四角校准
- 透视适配

### V6

- 图片 OCR
- 扫描 PDF OCR
- OCR → DocumentBlock

### V7

- 字形级手写增强
- glyph variants
- Path deformation

不得无理由跳阶段。

---

## 35. 开发原则

每次收到新任务：

1. 先读取 `AGENTS.md`
2. 再读取 `PROJECT_STATUS.md`
3. 再检查相关源码
4. 只修改本轮相关模块
5. 不重建项目
6. 不重复实现已有功能
7. 不重新询问已写入本文件的长期要求

---

## 36. 节约上下文原则

以后不要在每次回复中重复整个项目背景，除非用户要求。完成任务后只简要汇报本轮修改、测试、未完成、本地地址、公网地址和交付文件。长期规则已经在 `AGENTS.md`，不要每次重新复述。

---

## 37. 测试要求

重要修改至少运行 TypeScript tests、Python tests、Typecheck、ESLint、Production build 和 FastAPI `/health`。

涉及文档排版时额外运行 Golden Test，要求 Missing = 0。

---

## 38. Clean-room

正式 ZIP 必须执行：空目录 → 解压 → 安装依赖 → 测试 → Build → 启动 → 验收。禁止依赖旧工作目录。

---

## 39. 包管理器

项目只允许保留一个主要包管理器方案。README、package.json、lock 和 CI 必须一致，不得同时出现多个互相矛盾版本。

---

## 40. Fixture 文件名

最终 ZIP 中 fixture 尽量使用 ASCII 文件名，避免 Linux unzip 中文乱码，例如 `cardiology-inpatient-record.docx`。

---

## 41. 不允许 Fake UI

任何按钮、开关和选项只要出现在正式 UI，就必须有实际功能。如果尚未实现，不要显示为可用状态。

---

## 42. 不允许为验收造假

以下不算完成：

- 只显示假页面数量
- 只在 UI 写“300 DPI”
- 只在 README 声称功能存在
- 测试只测试元数据却不测试实际渲染
- 公网 URL 实际不可访问

验收必须尽量测试实际产物。

---

## 43. 渲染验证

涉及文档内容完整性时，优先验证真正 Canvas render / `fillText`，而不是仅验证 layout metadata。

---

## 44. 生产稳定优先

优先级：

1. 数据不丢
2. 可复现
3. 稳定
4. 性能
5. 视觉质量
6. 高级功能

不要为了视觉效果破坏内容完整性。

---

## 45. 用户明确决定

目前产品决策已经确定：

> 复杂模板映射不再作为核心功能。

> 无模板模式是正式主产品。

以后不要主动恢复复杂 Template Mapping。
