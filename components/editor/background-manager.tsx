"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { Check, Plus, RotateCcw, ScanLine, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { Switch } from "@/components/ui/switch";
import { RafSlider } from "./raf-slider";
import { DEFAULT_LINE_DETECTION, respaceHorizontalLines } from "@/lib/background/line-detection";
import type { LineSnapDiagnostic } from "@/lib/background/line-detection";
import type { BackgroundAdjustments, BackgroundAsset, BackgroundTransform, HorizontalLineDetection } from "@/lib/handwriting/types";

function thumbStyle(asset: BackgroundAsset) {
  const spacing = asset.spacing ?? 12;
  if (asset.kind === "uploaded" && asset.fileUrl) return { backgroundColor: asset.baseColor, backgroundImage: `url(${asset.fileUrl})`, backgroundSize: "cover" };
  if (asset.pattern === "ruled") return { backgroundColor: asset.baseColor, backgroundImage: `repeating-linear-gradient(0deg,transparent 0,transparent ${spacing / 2}px,${asset.lineColor} ${spacing / 2 + 1}px)` };
  if (asset.pattern === "grid" || asset.pattern === "ledger") return { backgroundColor: asset.baseColor, backgroundImage: `linear-gradient(${asset.lineColor} 1px,transparent 1px),linear-gradient(90deg,${asset.lineColor} 1px,transparent 1px)`, backgroundSize: `${spacing / 2}px ${spacing / 2}px` };
  if (asset.pattern === "dots") return { backgroundColor: asset.baseColor, backgroundImage: `radial-gradient(${asset.lineColor} 1px,transparent 1px)`, backgroundSize: `${spacing / 2}px ${spacing / 2}px` };
  return { backgroundColor: asset.baseColor, backgroundImage: asset.vignette ? "radial-gradient(circle,#fff0 45%,#66554420)" : asset.shadow ? "linear-gradient(135deg,#fff0 50%,#52606a20)" : "none" };
}

function Adjustment({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return <div className="space-y-2"><div className="flex justify-between text-xs text-slate-500"><span>{label}</span><span>{value}{unit}</span></div><RafSlider ariaLabel={label} value={value} min={min} max={max} onCommit={onChange} /></div>;
}

export function BackgroundManager({ backgrounds, selectedId, adjustments, transform, lineDetection, snapDiagnostics, detecting, previewingAll, onSelect, onAdjust, onTransform, onLineDetection, onDetectLines, onApplySuggestedLayout, onPreviewAll, onConfirmAll, onCancelAll, onUploaded }: { backgrounds: BackgroundAsset[]; selectedId: string; adjustments: BackgroundAdjustments; transform: BackgroundTransform; lineDetection: HorizontalLineDetection; snapDiagnostics: LineSnapDiagnostic[]; detecting: boolean; previewingAll: boolean; onSelect: (id: string) => void; onAdjust: (value: BackgroundAdjustments) => void; onTransform: (value: BackgroundTransform) => void; onLineDetection: (value: HorizontalLineDetection) => void; onDetectLines: () => void; onApplySuggestedLayout: (fontSize: number, lineHeight: number) => void; onPreviewAll: () => void; onConfirmAll: () => void; onCancelAll: () => void; onUploaded: (asset: BackgroundAsset) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState(`${backgrounds.filter((item) => item.kind === "preset").length} 种程序生成预设；图片保存在本机`);
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setStatus("正在载入背景…"); const body = new FormData(); body.append("file", file);
    try {
      const response = await apiFetch("/api/backgrounds", { method: "POST", body });
      if (!response.ok) throw new Error(String((await response.json() as { detail?: string }).detail ?? "背景上传失败"));
      const asset = await response.json() as BackgroundAsset;
      onUploaded(asset); onSelect(asset.id); setStatus(`已启用 ${asset.name}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "背景上传失败"); }
    event.target.value = "";
  };
  const set = (key: keyof BackgroundAdjustments, value: number) => onAdjust({ ...adjustments, [key]: value });
  const suggestedFontSize = Math.max(12, Math.min(28, Math.round(lineDetection.averageSpacing * 0.43)));
  const suggestedLineHeight = Math.max(28, Math.min(72, Math.round(lineDetection.averageSpacing)));
  const firstUsableLine = Math.max(0, Math.min(Math.max(0, lineDetection.lineY.length - 1), lineDetection.firstUsableLine));
  const lastUsableLine = Math.max(firstUsableLine, Math.min(Math.max(0, lineDetection.lineY.length - 1), lineDetection.lastUsableLine < 0 ? lineDetection.lineY.length - 1 : lineDetection.lastUsableLine));
  const usableLineCount = lineDetection.lineY.length ? lastUsableLine - firstUsableLine + 1 : 0;
  const updateDetection = (patch: Partial<HorizontalLineDetection>) => onLineDetection({ ...lineDetection, ...patch });
  const addLine = () => {
    const last = lineDetection.lineY.at(-1) ?? 60;
    const next = last + lineDetection.averageSpacing < 838 ? last + lineDetection.averageSpacing : Math.max(8, (lineDetection.lineY[0] ?? 60) - lineDetection.averageSpacing);
    updateDetection({ enabled: true, source: "manual", lineY: [...lineDetection.lineY, next].sort((left, right) => left - right) });
  };
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">纸张背景</h2><p className="mt-1 text-xs leading-5 text-slate-400">{status}</p></div><Button size="sm" onClick={() => input.current?.click()}><Upload />上传</Button></div>
      <input ref={input} className="sr-only" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={upload} />
      <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1">
        {backgrounds.map((background) => <button key={background.id} onClick={() => onSelect(background.id)} className={`relative rounded-xl border p-2 text-left ${selectedId === background.id ? "border-[#287e86] bg-[#eff9f8]" : "border-slate-200"}`}><span style={thumbStyle(background)} className="mb-2 block h-16 rounded-lg border border-black/5" /><span className="block truncate text-xs text-slate-600">{background.name}</span>{selectedId === background.id && <Check className="absolute right-2 top-2 size-4 rounded-full bg-white p-0.5 text-[#287e86] shadow" />}</button>)}
      </div>
      <div className="space-y-4 border-t border-slate-100 pt-4">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">{(["fit", "cover", "stretch"] as const).map((mode) => <button key={mode} onClick={() => onTransform({ ...transform, fitMode: mode })} className={`rounded-md px-1 py-1.5 text-xs ${transform.fitMode === mode ? "bg-white font-medium shadow-sm" : "text-slate-500"}`}>{mode === "fit" ? "适应" : mode === "cover" ? "填充" : "拉伸"}</button>)}</div>
        <Adjustment label="背景缩放" value={Math.round(transform.scale * 100)} min={50} max={180} unit="%" onChange={(value) => onTransform({ ...transform, scale: value / 100 })} />
        <Adjustment label="水平位置" value={transform.offsetX} min={-160} max={160} unit=" px" onChange={(value) => onTransform({ ...transform, offsetX: value })} />
        <Adjustment label="垂直位置" value={transform.offsetY} min={-200} max={200} unit=" px" onChange={(value) => onTransform({ ...transform, offsetY: value })} />
        <Adjustment label="亮度" value={adjustments.brightness} min={70} max={130} unit="%" onChange={(value) => set("brightness", value)} />
        <Adjustment label="对比度" value={adjustments.contrast} min={70} max={130} unit="%" onChange={(value) => set("contrast", value)} />
        <Adjustment label="饱和度" value={adjustments.saturation} min={0} max={150} unit="%" onChange={(value) => set("saturation", value)} />
        <Adjustment label="模糊" value={adjustments.blur} min={0} max={3} unit=" px" onChange={(value) => set("blur", value)} />
        <Adjustment label="噪点" value={adjustments.noise} min={0} max={100} unit="%" onChange={(value) => set("noise", value)} />
        <Adjustment label="旋转" value={adjustments.rotation} min={-4} max={4} unit="°" onChange={(value) => set("rotation", value)} />
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold"><ScanLine className="size-4 text-[#287e86]" />横线适配</div><p className="mt-1 text-[11px] text-slate-400">{lineDetection.lineY.length ? `${lineDetection.lineY.length} 条 · 置信度 ${Math.round(lineDetection.confidence * 100)}%` : "尚未检测横线"}</p></div><Button size="sm" disabled={detecting} onClick={onDetectLines}>{detecting ? "检测中…" : "自动检测"}</Button></div>
          <div className="flex items-center justify-between text-xs text-slate-600"><span>启用横线适配</span><Switch checked={lineDetection.enabled} onCheckedChange={(enabled) => updateDetection({ enabled, snapEnabled: enabled && lineDetection.snapEnabled })} /></div>
          <div className="flex items-center justify-between text-xs text-slate-600"><span>文字基线吸附</span><Switch disabled={!lineDetection.enabled || !lineDetection.lineY.length} checked={lineDetection.snapEnabled} onCheckedChange={(snapEnabled) => updateDetection({ snapEnabled })} /></div>
          <div className="flex items-center justify-between text-xs text-slate-600"><span>显示检测线</span><Switch disabled={!lineDetection.enabled || !lineDetection.lineY.length} checked={lineDetection.showLines} onCheckedChange={(showLines) => updateDetection({ showLines })} /></div>
          <Adjustment label="检测行距" value={Math.round(lineDetection.averageSpacing)} min={18} max={90} unit=" px" onChange={(averageSpacing) => updateDetection({ averageSpacing, source: "manual", lineY: respaceHorizontalLines(lineDetection.lineY, averageSpacing) })} />
          <Adjustment label="整体 Y 偏移" value={lineDetection.offsetY} min={-20} max={20} unit=" px" onChange={(offsetY) => updateDetection({ offsetY, source: "manual" })} />
          {lineDetection.lineY.length > 0 && <div className="space-y-3 rounded-lg bg-white p-2">
            <div className="text-[11px] text-slate-500">可写区域 Y {Math.round(lineDetection.lineY[firstUsableLine])}–{Math.round(lineDetection.lineY[lastUsableLine])} · {usableLineCount} 条纸线</div>
            <Adjustment label="第一条可写横线" value={firstUsableLine + 1} min={1} max={lineDetection.lineY.length} unit="" onChange={(value) => updateDetection({ firstUsableLine: Math.min(value - 1, lastUsableLine), source: "manual" })} />
            <Adjustment label="最后一条可写横线" value={lastUsableLine + 1} min={1} max={lineDetection.lineY.length} unit="" onChange={(value) => updateDetection({ lastUsableLine: Math.max(value - 1, firstUsableLine), source: "manual" })} />
            <Adjustment label="左边界" value={Math.round(lineDetection.writableLeft)} min={0} max={520} unit=" px" onChange={(writableLeft) => updateDetection({ writableLeft: Math.min(writableLeft, lineDetection.writableRight - 60), source: "manual" })} />
            <Adjustment label="右边界" value={Math.round(lineDetection.writableRight)} min={75} max={595} unit=" px" onChange={(writableRight) => updateDetection({ writableRight: Math.max(writableRight, lineDetection.writableLeft + 60), source: "manual" })} />
          </div>}
          {lineDetection.lineY.length > 0 && <div className="flex items-center justify-between rounded-lg bg-white px-2 py-2 text-[11px] text-slate-500"><span>建议：字号 {suggestedFontSize} · 行距 {suggestedLineHeight}</span><button className="font-medium text-[#287e86]" onClick={() => onApplySuggestedLayout(suggestedFontSize, suggestedLineHeight)}>应用建议</button></div>}
          {lineDetection.lineY.length > 0 && <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg bg-white p-2">{lineDetection.lineY.map((line, index) => <div key={`${line}-${index}`} className="flex items-center justify-between text-[11px] text-slate-500"><span>横线 {index + 1} · Y {Math.round(line)}</span><button aria-label={`删除横线 ${index + 1}`} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => updateDetection({ source: "manual", lineY: lineDetection.lineY.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="size-3" /></button></div>)}</div>}
          {snapDiagnostics.length > 0 && <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-2 text-[11px] text-slate-600">
            <div className="mb-1 flex items-center justify-between font-medium text-emerald-800"><span>纸线槽位布局</span><span>重复分配 0</span></div>
            <div className="max-h-28 space-y-1 overflow-y-auto">{snapDiagnostics.map((item, index) => <div key={item.lineId} className="grid grid-cols-[1fr_auto] gap-2"><span>文字行 {index + 1} → 纸线 {item.paperLineIndex + 1}</span><span className="tabular-nums">基线 {item.baselineY.toFixed(1)} / 纸线 {item.paperLineY.toFixed(1)} · Δ {item.difference >= 0 ? "+" : ""}{item.difference.toFixed(1)}</span></div>)}</div>
          </div>}
          <div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={addLine}><Plus />添加横线</Button><Button variant="outline" size="sm" onClick={() => onLineDetection({ ...DEFAULT_LINE_DETECTION })}><RotateCcw />重置</Button></div>
        </div>
        {previewingAll ? <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs leading-5 text-amber-800">正在预览全部页面，可翻页检查；尚未写入项目历史。</p><div className="grid grid-cols-2 gap-2"><Button size="sm" onClick={onConfirmAll}>确认应用</Button><Button size="sm" variant="outline" onClick={onCancelAll}>取消预览</Button></div></div> : <Button variant="outline" className="w-full" onClick={onPreviewAll}>预览应用到全部页面</Button>}
      </div>
    </section>
  );
}
