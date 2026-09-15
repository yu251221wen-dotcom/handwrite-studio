# V4 横线适配与字体加载架构

V4.0 是 V3 无模板 DocumentBlock 工作流上的增量版本。它不改变分页、逐行编辑、字符随机 key 或导出协议，只在字体资源加载和页面视觉排版之间增加可验证的字体就绪门槛与页面级横线适配层。

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

V4.0 只处理基本水平、无明显透视的纸张。背景旋转超过容差时会提示用户先归零，不包含 Hough Transform、透视校正或 OCR。

## 页面状态与吸附

每个 `PageState` 保存独立的 `lineDetection`：

```text
enabled / lineY[] / averageSpacing / confidence
snapEnabled / offsetY / showLines / source
```

每条视觉行保存 `lineSnapOffset`，最终位置为：

```text
finalY = autoY + lineSnapOffset + manualOffsetY
```

重新检测或手动校准横线只重算 `lineSnapOffset`，不会覆盖自动布局坐标或用户拖动产生的 `manualOffsetY`。字符随机 key 仍只依赖文档、Block/字段、原文字符索引、字体、Seed 和手写参数，不依赖页码、坐标或背景，因此分页、拖动、换背景和横线吸附不会重生成笔迹。

检测辅助线只在编辑器预览背景层显示。`renderCompositeCanvas()` 会强制关闭选择框和辅助线，因此 PNG、JPG、PDF 保持干净。

## 性能与测试边界

横线检测只在用户点击“自动检测”时运行，不进入拖动或每帧渲染。字符仍使用 Canvas 批量绘制，不为每个字符创建 DOM、Konva 或 Fabric 节点。

回归测试覆盖标准横线、扫描噪声、粗线双边缘合并、纯白纸拒绝、页面级序列化、手动偏移保留、Seed key 稳定、字体切换坐标稳定，以及普通段落不受 List 紧凑间距影响。
