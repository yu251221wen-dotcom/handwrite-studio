# V4.1 横线适配与背景感知排版架构

V4.1 是 V3 无模板 DocumentBlock 工作流上的增量版本。它不改变逐行编辑、字符随机 key 或导出协议，在 V4.0 横线检测基础上增加独立的纸线槽位分页分支。

## 字体加载链路

`FontManager` 上传 TTF/OTF 后调用后端资源 API，并在选择字体前完成以下步骤：

1. 使用 `FontFace.load()` 下载并解析字体；
2. 写入 `document.fonts`，等待 `document.fonts.load()` 与 `document.fonts.ready`；
3. 使用应用自己的验收 Canvas 绘制预览文本，检查像素指纹没有回退到通用 serif、sans-serif 或 monospace；
4. 只有通过校验的字体才会写入当前行的 `fontId` 并用于预览或导出。

Canvas 绘制前再次调用 `ensureFontsReady()`，`renderTextLayer()` 内调用 `assertFontReady()`。字体缺失或加载失败时，预览和导出均明确报错，不生成使用系统回退字体的假成功文件。

## 横线检测链路

`lib/background/line-detection.ts` 是独立于 React 的纯算法模块：

- 内置 `ruled` 背景直接根据背景 spacing 生成精确横线坐标；
- 用户图片先按当前 Fit/Cover/Stretch、缩放、偏移和色彩参数绘制到 A4 尺寸离屏 Canvas；
- 行投影检测比较每一行与上下邻域的亮度差，并结合横向连贯度抑制文字、纸纹和扫描散点；
- 连续或相邻的粗线边缘先合并，再依据重复间距筛选候选线；
- 少于 3 条或置信度不足时返回空结果，不自动打开吸附。

V4.1 只处理基本水平、无明显透视的纸张。背景旋转超过容差时会提示用户先归零，不包含 Hough Transform、透视校正或 OCR。

## 页面状态与吸附

每个 `PageState` 保存独立的 `lineDetection`：

```text
enabled / lineY[] / averageSpacing / confidence
snapEnabled / offsetY / showLines / source
firstUsableLine / lastUsableLine
writableLeft / writableRight
```

每条视觉行保存 `lineSnapOffset`、`assignedPaperLineY` 和 `assignedPaperLineIndex`，最终位置为：

```text
finalY = autoY + lineSnapOffset + manualOffsetY
```

V4.1 启用横线适配后不再以普通像素 `autoY` 为纵向主坐标。`lib/layout/background-aware-layout.ts` 先根据首末可写横线生成页面槽位；`block-layout-engine.ts` 让每个视觉行直接占用一个槽位，槽位用完后自动分页。普通段落、List 和诊断条目默认连续占用纸线；Block 的像素间距先换算成跳过 0/1/N 条完整纸线，避免产生不必要的大段空白。页面上的已检测纸线不会向物理范围之外虚构延伸。

横线检测会从横线连续像素估算 `writableLeft` 和 `writableRight`，并以此决定换行宽度和自动 X 坐标。背景面板允许手动调整首条/末条可写横线、左右边界和整体 baseline offset，并显示 `writableTop`、`writableBottom` 与可用槽位数。

未启用横线时继续进入原有普通 Block-aware 像素分页器。旧 V4 项目在反序列化时由 `normalizeLineDetection()` 补充新字段，不修改 SchemaVersion、既有行 ID、手动偏移或 Seed。

旧项目或独立调用仍可使用单调动态规划吸附：在保持正文顺序的前提下最小化总移动距离，并严格递增纸线索引，因此同一条纸线不会分配给两个文字视觉行。`manualOffsetY` 始终作为纸线基线后的独立偏移保留，Seed 不参与坐标计算。背景面板显示每一行的文字基线、已分配纸线、差值和重复分配计数，便于直接验收。

字符随机 key 仍只依赖文档、Block/字段、原文字符索引、字体、Seed 和手写参数，不依赖页码、坐标或背景，因此分页、拖动、换背景和横线吸附不会重生成笔迹。

## 公网背景资源链路

字体列表与背景列表独立加载，任一资源失败不会再把另一类资源一并置为失败。匿名 Session 建立与资源读取对一次瞬时网络错误自动重试；上传背景的预览、横线检测和 PNG/PDF 导出都通过同一受限 API 资源读取函数取得 Blob，并拒绝非当前 API 域名，避免预览和导出使用两条不同的跨域链路。

检测辅助线只在编辑器预览背景层显示。`renderCompositeCanvas()` 会强制关闭选择框和辅助线，因此 PNG、JPG、PDF 保持干净。

## 性能与测试边界

横线检测只在用户点击“自动检测”时运行，不进入拖动或每帧渲染。字符仍使用 Canvas 批量绘制，不为每个字符创建 DOM、Konva 或 Fabric 节点。

回归测试覆盖标准横线、扫描噪声、粗线双边缘合并、纯白纸拒绝、可写左右边界估算、单调一一匹配、连续槽位、首末可写线分页、整纸线 Block 间距、页面级序列化、手动偏移保留、Seed key 稳定、Golden Missing=0、字体切换坐标稳定、公网会话瞬时失败重试、PNG/JPG 背景上传与精确 CORS，以及无横线普通排版不回归。

## V4.2.1 分页槽位修复

分页器现在记录逐页 `PaginationDiagnostic`，包括可用、已用和剩余槽位，下一 Block 类型、可拆分性、换页原因及所需槽位。普通段落、列表与诊断可以使用页尾最后一个槽位；标题使用“标题 + 至少一行正文”的 widow 规则；连续签名作为一个原子组，仅在当前页不足两个签名槽位时整体续页；处方保持四列并允许占用最后一槽。纸线分页完成后还会把下一页可拆分正文回填到上一页剩余槽位，并重新建立页面 `blockIds`。
