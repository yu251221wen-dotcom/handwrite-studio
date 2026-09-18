"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { FileSearch2, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ocrTextToDocumentBlocks, recognizeOcrFile, type OcrDraft, type OcrProgress } from "@/lib/ocr/ocr-lite";
import type { DocumentBlock } from "@/lib/handwriting/types";

export function OcrImportPanel({ onConfirm }: { onConfirm: (fileName: string, blocks: DocumentBlock[]) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<OcrDraft | null>(null);
  const [editedText, setEditedText] = useState("");
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = async (nextFile: File) => {
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller;
    setBusy(true); setFile(nextFile); setDraft(null); setEditedText(""); setError("");
    try {
      const next = await recognizeOcrFile(nextFile, setProgress, controller.signal);
      setDraft(next); setEditedText(next.text);
    } catch (reason) {
      if ((reason as { name?: string }).name !== "AbortError") setError(reason instanceof Error ? reason.message : "OCR 识别失败");
    } finally { if (abortRef.current === controller) { abortRef.current = null; setBusy(false); } }
  };
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]; if (selected) void run(selected); event.target.value = "";
  };
  return <section className="space-y-3 rounded-xl border border-slate-200 p-3">
    <div><h3 className="text-sm font-semibold">OCR Lite</h3><p className="mt-1 text-xs leading-5 text-slate-400">PNG、JPG 或扫描 PDF 在浏览器本地识别；确认前不会进入排版。</p></div>
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 p-2 text-xs hover:border-[#287e86]"><FileSearch2 className="size-4 text-[#287e86]" />图片 / 扫描 PDF OCR<input className="sr-only" type="file" accept="image/png,image/jpeg,.pdf,application/pdf" onChange={choose} /></label>
    {progress && <div className="space-y-1"><div className="flex justify-between text-[11px] text-slate-500"><span>{progress.message}</span><span>{progress.progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#287e86] transition-[width]" style={{ width: `${progress.progress}%` }} /></div></div>}
    {busy && <Button size="sm" variant="outline" className="w-full" onClick={() => abortRef.current?.abort()}><X />取消识别</Button>}
    {error && <p role="alert" className="rounded-md bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
    {draft && <div className="space-y-3">
      <div className="flex items-center justify-between text-xs"><span>{draft.lines.length} 行 · 平均置信度 {draft.confidence.toFixed(1)}%</span>{file && <Button size="sm" variant="ghost" onClick={() => void run(file)}><RotateCcw />重新识别</Button>}</div>
      <Textarea aria-label="OCR 校对文本" value={editedText} onChange={(event) => setEditedText(event.target.value)} className="min-h-44 text-xs leading-6" />
      <div className="max-h-32 space-y-1 overflow-y-auto rounded-md bg-slate-50 p-2">{draft.lines.map((line) => <div key={line.id} className="flex gap-2 text-[11px]"><span className="w-14 shrink-0 text-slate-400">{line.suggestedType}</span><span className="min-w-0 flex-1 truncate">{line.text}</span><span className="text-slate-400">{line.confidence.toFixed(0)}%</span></div>)}</div>
      <Button size="sm" className="w-full" disabled={!editedText.trim()} onClick={() => onConfirm(draft.fileName, ocrTextToDocumentBlocks(editedText))}>确认导入并自动排版</Button>
    </div>}
  </section>;
}
