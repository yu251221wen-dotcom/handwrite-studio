"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { Check, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { Slider } from "@/components/ui/slider";
import type { BackgroundAdjustments, BackgroundAsset, BackgroundTransform } from "@/lib/handwriting/types";

function thumbStyle(asset: BackgroundAsset) {
  const spacing = asset.spacing ?? 12;
  if (asset.kind === "uploaded" && asset.fileUrl) return { backgroundColor: asset.baseColor, backgroundImage: `url(${asset.fileUrl})`, backgroundSize: "cover" };
  if (asset.pattern === "ruled") return { backgroundColor: asset.baseColor, backgroundImage: `repeating-linear-gradient(0deg,transparent 0,transparent ${spacing / 2}px,${asset.lineColor} ${spacing / 2 + 1}px)` };
  if (asset.pattern === "grid" || asset.pattern === "ledger") return { backgroundColor: asset.baseColor, backgroundImage: `linear-gradient(${asset.lineColor} 1px,transparent 1px),linear-gradient(90deg,${asset.lineColor} 1px,transparent 1px)`, backgroundSize: `${spacing / 2}px ${spacing / 2}px` };
  if (asset.pattern === "dots") return { backgroundColor: asset.baseColor, backgroundImage: `radial-gradient(${asset.lineColor} 1px,transparent 1px)`, backgroundSize: `${spacing / 2}px ${spacing / 2}px` };
  return { backgroundColor: asset.baseColor, backgroundImage: asset.vignette ? "radial-gradient(circle,#fff0 45%,#66554420)" : asset.shadow ? "linear-gradient(135deg,#fff0 50%,#52606a20)" : "none" };
}

function Adjustment({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return <div className="space-y-2"><div className="flex justify-between text-xs text-slate-500"><span>{label}</span><span>{value}{unit}</span></div><Slider value={[value]} min={min} max={max} onValueChange={(next) => onChange(Number(next[0]))} /></div>;
}

export function BackgroundManager({ backgrounds, selectedId, adjustments, transform, onSelect, onAdjust, onTransform, onApplyToAll, onUploaded }: { backgrounds: BackgroundAsset[]; selectedId: string; adjustments: BackgroundAdjustments; transform: BackgroundTransform; onSelect: (id: string) => void; onAdjust: (value: BackgroundAdjustments) => void; onTransform: (value: BackgroundTransform) => void; onApplyToAll: () => void; onUploaded: (asset: BackgroundAsset) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("30 种程序生成预设；图片保存在本机");
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
        <Button variant="outline" className="w-full" onClick={onApplyToAll}>应用到全部页面</Button>
      </div>
    </section>
  );
}
