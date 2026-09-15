"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { Check, Plus, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { FONT_PREVIEW_LINES, fontCssFamily, loadUploadedFont } from "@/lib/handwriting/font-library";
import type { FontAsset } from "@/lib/handwriting/types";

export function FontManager({ fonts, selectedId, onSelect, onUploaded }: { fonts: FontAsset[]; selectedId: string; onSelect: (id: string) => void; onUploaded: (asset: FontAsset) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("支持 TTF、OTF；文件仅保存到本地 data/fonts");

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus("正在载入字体…");
    const body = new FormData(); body.append("file", file); body.append("previewName", file.name.replace(/\.[^.]+$/, ""));
    try {
      const response = await apiFetch("/api/fonts", { method: "POST", body });
      if (!response.ok) throw new Error(String((await response.json() as { detail?: string }).detail ?? "字体上传失败"));
      const asset = await response.json() as FontAsset;
      await loadUploadedFont(asset);
      onUploaded(asset); setStatus(`字体真正加载成功：${asset.name}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "字体上传失败"); }
    event.target.value = "";
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">字体库</h2><p className="mt-1 text-xs leading-5 text-slate-400">{status}</p></div><Button size="sm" onClick={() => input.current?.click()}><Upload />上传</Button></div>
      <input ref={input} className="sr-only" type="file" accept=".ttf,.otf,font/ttf,font/otf" onChange={upload} />
      <div className="resource-grid max-h-[calc(100vh-225px)] space-y-2 overflow-y-auto pr-1">
        {fonts.map((font) => (
          <button key={font.id} disabled={!font.enabled} onClick={() => font.enabled ? onSelect(font.id) : input.current?.click()} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === font.id ? "border-[#287e86] bg-[#eff9f8]" : font.enabled ? "border-slate-200 bg-white hover:border-slate-300" : "border-dashed border-slate-200 bg-slate-50 opacity-65"}`}>
            <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-slate-600">{font.previewName}</span>{selectedId === font.id ? <Check className="size-3.5 text-[#287e86]" /> : !font.enabled ? <Plus className="size-3.5 text-slate-400" /> : null}</div>
            {font.enabled ? <div style={{ fontFamily: fontCssFamily(font) }} className="space-y-1 text-[17px] leading-6 text-slate-800"><p>{FONT_PREVIEW_LINES[0]}</p><p>{FONT_PREVIEW_LINES[1]}</p></div> : <p className={`text-xs ${font.loadError ? "text-rose-600" : "text-slate-400"}`}>{font.loadError ?? `资源位 ${font.slot} · 等待上传`}</p>}
          </button>
        ))}
      </div>
    </section>
  );
}
