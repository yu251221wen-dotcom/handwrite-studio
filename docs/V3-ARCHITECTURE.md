# 墨迹排版台 V3 架构

## 架构目标

V3.1 不替换 V2 的渲染和编辑核心，而是在 DOCX 与 `pages[].lines[]` 之间使用可追溯的 DocumentBlock 层。无模板 Block 排版是唯一正式布局链路。

```text
DOCX
  -> FastAPI XML parser
  -> ParsedDocument blocks[]
  -> no-template Block layout
  -> Block-aware paginator
  -> pages[] -> blockIds[] + lines[]
  -> background canvas + handwriting canvas
  -> PNG/JPG or multi-page PDF
```

## 数据模型

- `DocumentBlock` 是 discriminated union：Heading、Paragraph、KeyValue、List、Table、Prescription、Signature。
- 每个 Block 保存 `blockId`、`sourceOrder`、`sourceStart`、`sourceEnd`、`sourceText`，可以回溯原文。
- `PageState` 保存 `pageType`、`pageTemplateId`、`blockIds`、独立背景与 `lines`。
- `LineLayout` 继续使用 `finalX = autoX + manualOffsetX`、`finalY = autoY + manualOffsetY`；新增 `blockId`、`blockType`、视觉类型和列宽。
- `ProjectStateV3` 保存 Block、ignored、布局设置和完整页面状态；mapped/unmapped 仅作为旧 JSON 的弃用兼容字段。

## 布局与分页

- 普通段落仍由 `measureText()` 驱动的 `breakTextByWidth()` 换行。
- 标题使用 `keepWithNext` 和 `minLinesAfterHeading`，避免孤立在页底。
- 段落允许跨页，并用 `minLinesAtPageBottom/Top` 做基础 widow/orphan 控制。
- 表格按 row 分页，列位置由 Canvas 列宽绘制，不把表格压成连续字符串。
- 处方按药物 item 分组，药名和剂量不拆开。
- 签名块默认不可拆分。
- 重新布局按稳定 line id 恢复手工偏移；字符随机仍由 documentId、blockId/fieldId、character index 与 Seed 决定。

## 旧模板兼容边界

固定病历模板、字段映射和未映射工作流已从正式 UI、DOCX API 与布局路由移除。旧 V3 JSON 中的 `layoutMode: template` 在读取时规范化为 `no-template`；旧布局引擎源码仅为低风险历史兼容保留，不被生产路径导入。

## Coverage

Block-aware coverage 对每个 Block 比较规范化原文和最终自动排版行，独立统计 Raw、Recognized、Laid out、Explicitly ignored 与 Missing。自定义复制页不参与原文覆盖率，避免用户主动复制内容造成误报。

## 公网边界

- 浏览器执行字符随机、拖动、背景预览和页面绘制。
- FastAPI 只负责 DOCX 解析、资源保存、项目临时保存和 PDF 合成。
- `NEXT_PUBLIC_API_BASE_URL` 是唯一前端 API 入口。
- 服务端按 `X-Session-ID` 隔离资源；可直接加载的字体/背景 URL 携带不可猜测 Session token。
- 生产 CORS 只接受 `ALLOWED_ORIGINS`。
- Session 默认 24 小时，创建新会话时清理过期目录。

## 迁移

- V1 先迁移为 V2，再迁移为 V3。
- V2 字段转换为可追溯的 paragraph Block，并规范化为 `no-template`；原页面仍补齐 `pageType`、`pageTemplateId`、`blockIds` 以避免迁移时丢失已保存布局。
- V3 JSON 可以完整保存并恢复无模板设置、页面顺序、背景和手工坐标。
