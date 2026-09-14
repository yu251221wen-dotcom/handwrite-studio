"use client";

import { Slider } from "@/components/ui/slider";
import type { DocumentLayoutSettings, NoTemplateMode } from "@/lib/handwriting/types";

function Setting({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <div className="space-y-1.5"><div className="flex justify-between text-xs text-slate-500"><span>{label}</span><span>{value}</span></div><Slider value={[value]} min={min} max={max} onValueChange={(next) => onChange(Number(next[0]))} /></div>;
}

export function DocumentLayoutPanel({ noTemplateMode, settings, onNoTemplateMode, onSettings }: {
  noTemplateMode: NoTemplateMode; settings: DocumentLayoutSettings;
  onNoTemplateMode: (mode: NoTemplateMode) => void;
  onSettings: (settings: DocumentLayoutSettings) => void;
}) {
  const set = <K extends keyof DocumentLayoutSettings>(key: K, value: DocumentLayoutSettings[K]) => onSettings({ ...settings, [key]: value });
  return <section className="space-y-4">
    <div><h2 className="text-sm font-semibold">文档结构</h2><p className="mb-2 mt-1 text-xs text-slate-400">统一使用无模板 Block 排版</p><div className="grid grid-cols-2 gap-2">{(["preserve-structure", "simplified"] as const).map((mode) => <button key={mode} onClick={() => onNoTemplateMode(mode)} className={`rounded-lg border px-2 py-2 text-xs ${noTemplateMode === mode ? "border-[#287e86] bg-[#eff9f8]" : "border-slate-200"}`}>{mode === "preserve-structure" ? "保留原文结构" : "简化正文"}</button>)}</div></div>
    <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold">文档布局设置</summary><div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3"><Setting label="上边距" value={settings.marginTop} min={28} max={110} onChange={(v) => set("marginTop", v)} /><Setting label="下边距" value={settings.marginBottom} min={28} max={110} onChange={(v) => set("marginBottom", v)} /><Setting label="左边距" value={settings.marginLeft} min={28} max={100} onChange={(v) => set("marginLeft", v)} /><Setting label="右边距" value={settings.marginRight} min={28} max={100} onChange={(v) => set("marginRight", v)} /></div>
      <Setting label="正文字号" value={settings.bodyFontSize} min={12} max={28} onChange={(v) => set("bodyFontSize", v)} /><Setting label="行距" value={settings.lineHeight} min={24} max={58} onChange={(v) => set("lineHeight", v)} /><Setting label="字距 ×10" value={Math.round(settings.letterSpacing * 10)} min={-10} max={50} onChange={(v) => set("letterSpacing", v / 10)} /><Setting label="首行缩进" value={settings.firstLineIndent} min={0} max={68} onChange={(v) => set("firstLineIndent", v)} /><Setting label="段后" value={settings.paragraphSpacingAfter} min={0} max={28} onChange={(v) => set("paragraphSpacingAfter", v)} /><Setting label="标题字号" value={settings.headingFontSize} min={16} max={32} onChange={(v) => set("headingFontSize", v)} />
      <div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-500">基本信息<select className="mt-1 h-8 w-full rounded-md border px-2" value={settings.keyValueColumns} onChange={(event) => set("keyValueColumns", event.target.value === "auto" ? "auto" : Number(event.target.value) as 1 | 2)}><option value="auto">自动</option><option value="1">单列</option><option value="2">双列</option></select></label><label className="text-xs text-slate-500">处方<select className="mt-1 h-8 w-full rounded-md border px-2" value={settings.prescriptionColumns} onChange={(event) => set("prescriptionColumns", event.target.value === "auto" ? "auto" : Number(event.target.value) as 2 | 3 | 4)}><option value="auto">自动</option><option value="2">2 列</option><option value="3">3 列</option><option value="4">4 列</option></select></label></div>
    </div></details>
  </section>;
}
