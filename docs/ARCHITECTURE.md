# 文档转仿手写应用架构

## 1 产品目标

本应用把 Word、PDF 或图片内容转换成可编辑的结构化文档，再套用模板、生成仿手写排版，并由用户逐行校准后导出图片或 PDF。病历可能包含敏感信息，因此默认采用本地处理，不把原文发送到第三方服务。

## 2 系统边界

```text
输入文件
  -> 文档解析层 DOCX PDF OCR
  -> 统一文档模型 Document JSON
  -> 字段匹配层 规则 关键词 可选语义模型
  -> 模板引擎 Template JSON
  -> 布局引擎 实际字宽换行 中文标点禁则 多页分页
  -> 手写渲染层 Seeded PRNG 低频趋势 字符批量绘制
  -> 可视化编辑器 逐行调整 撤销重做
  -> 导出引擎 PNG JPG PDF
```

前端负责模板选择、字段确认、画布排版和最终预览。后端使用本地 FastAPI 服务承载文件解析、OCR、图像分析和高分辨率导出。二者只通过稳定 JSON 契约通信，后续可把 OCR 或字段匹配替换为不同实现。

## 3 技术选择

- 前端：Next.js、React、TypeScript；双层 Canvas 分离背景与文字，逐字符批量绘制，行级命中区域负责选择和拖动。
- 后端：Python、FastAPI、Pydantic。
- 文档：python-docx、PyMuPDF；扫描件及图片通过可替换 OCR 适配器处理。
- 图像：Pillow、OpenCV；PDF 由后端按目标 DPI 合成。
- 数据：模板和项目状态使用 JSON；字体、背景和项目索引保存在本机 `data` 目录。
- 隐私：上传文件放入进程临时目录，任务结束或超时即清理；日志不记录正文和识别结果。

## 4 核心数据模型

- `Document`：来源信息、页面、结构块与解析告警。
- `FieldValue`：标准字段、原文、置信度和用户确认状态。
- `Template`：页面尺寸、背景、字段区域、基线、溢出与分页规则。
- `PageState`：真实页面、页面索引、模板 ID、独立背景和 `lines[]`。
- `LineLayout`：字段/全局字符区间、自动坐标、手工偏移、旋转、字距、字号和锁定状态。
- `HandwritingStyle`：墨色、自然度预设、八类字符扰动及固定状态。
- `CharacterRenderState`：由 `documentId + fieldId + characterGlobalIndex + Seed` 的确定性序列生成；分页、拖动、背景和缩放不进入状态键。
- `FontAsset` / `BackgroundAsset`：内置槽位、用户资源路径、启用状态与预览元数据。
- `ExportPreset`：格式、页面尺寸、DPI、质量和边距。

## 5 隐私与合规

产品用于获得许可的电子整理、排版和打印场景。涉及真实病历时，默认离线处理并提供去标识提示；提交合成手写内容前，用户应确认学校、医院或接收系统的规则。

## 6 渲染与性能

背景层仅在当前页背景或背景参数变化时重绘；文字层在行、字体、Seed 或自然度变化时通过 `requestAnimationFrame` 合并重绘。每个字符拥有独立状态，但不创建独立 React/Konva 节点。高分辨率导出重新绘制每一页，而不是放大预览位图。

## 7 V2 模块边界

- `lib/layout/text-measure.ts`：真实 Canvas 测宽与测试用确定性近似测宽。
- `lib/layout/line-breaker.ts`：按宽度换行和中文标点禁则。
- `lib/layout/paginator.ts`：首页/续页区域、页面状态与独立背景。
- `lib/layout/layout-engine.ts`：字段流、稳定行 ID、手工偏移恢复。
- `lib/layout/coverage.ts`：原文/版面覆盖率校验。
- `lib/history/history-store.ts`：75 步统一历史。
- `lib/handwriting/canvas-renderer.ts`：预览与任意 DPI 的同源渲染。
