"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { V3_SHOWCASE_BLOCKS } from "@/lib/demo/v3-showcase-fixture";
import { BACKGROUND_PRESETS } from "@/lib/handwriting/background-library";
import { A4_PIXELS, renderCompositeCanvas } from "@/lib/handwriting/canvas-renderer";
import { FONT_SLOTS } from "@/lib/handwriting/font-library";
import { DEFAULT_RANDOMIZATION } from "@/lib/handwriting/randomization";
import { DEFAULT_INK_STYLE } from "@/lib/handwriting/ink-style";
import { DEFAULT_CORRECTION_STYLE } from "@/lib/handwriting/correction-style";
import { DEFAULT_DOCUMENT_LAYOUT_SETTINGS, type PageState, type ProjectState } from "@/lib/handwriting/types";
import { layoutProjectPages } from "@/lib/layout/project-layout";
import { createApproximateTextMeasurer } from "@/lib/layout/text-measure";

const font = FONT_SLOTS.find((item) => item.id === "system-xingkai") ?? FONT_SLOTS[0];
const background = BACKGROUND_PRESETS.find((item) => item.id === "warm-white") ?? BACKGROUND_PRESETS[0];
const handwriting = { preset: "natural" as const, naturality: 52, randomization: DEFAULT_RANDOMIZATION, inkColor: "#173f64", fixed: true };

function project(noTemplateMode: ProjectState["noTemplateMode"]): ProjectState {
  const base: ProjectState = { schemaVersion: 3, projectVersion: "4.2.1", id: `showcase-${noTemplateMode}`,
    document: { id: "public-synthetic-v3", name: "synthetic-cardiology-demo.docx", rawTexts: V3_SHOWCASE_BLOCKS.map((block) => block.sourceText), sourceCharacterCount: V3_SHOWCASE_BLOCKS.reduce((sum, block) => sum + Array.from(block.sourceText.replace(/\s+/gu, "")).length, 0) },
    layoutMode: "no-template", noTemplateMode, templateId: null, documentBlocks: V3_SHOWCASE_BLOCKS,
    mappedBlockIds: [], unmappedBlockIds: [], explicitlyIgnoredBlockIds: [],
    documentLayoutSettings: { ...DEFAULT_DOCUMENT_LAYOUT_SETTINGS }, seed: "V3-SHOWCASE", selectedFontId: font.id,
    fieldMappings: [], pages: [], handwriting, inkStyle: DEFAULT_INK_STYLE, correctionStyle: DEFAULT_CORRECTION_STYLE, footerMode: "generated",
    exportSettings: { pageSize: "A4", dpi: 300, format: "pdf", jpgQuality: 0.9 }, updatedAt: "2026-01-01T00:00:00.000Z" };
  return { ...base, pages: layoutProjectPages(base, createApproximateTextMeasurer(), font) };
}

function canvasBlob(canvas: HTMLCanvasElement) { return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("导出失败")), "image/png")); }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

export function V3Showcase() {
  const preserve = useMemo(() => project("preserve-structure"), []);
  const simplified = useMemo(() => project("simplified"), []);
  const canvases = useRef(new Map<string, HTMLCanvasElement>()); const [status, setStatus] = useState("");
  const samples = useMemo(() => [{ key: "A", title: "保留原文结构", project: preserve }, { key: "B", title: "简化正文", project: simplified }], [preserve, simplified]);
  useEffect(() => { for (const sample of samples) { const canvas = canvases.current.get(sample.key); if (!canvas) continue; const page = sample.project.pages[0]; renderCompositeCanvas(canvas, { page, pageCount: sample.project.pages.length, font, background, handwriting,
    inkStyle: sample.project.inkStyle, correctionStyle: sample.project.correctionStyle, footerMode: sample.project.footerMode,
    seed: sample.project.seed, documentId: sample.project.document.id, fieldTextById: Object.fromEntries(V3_SHOWCASE_BLOCKS.map((block) => [block.blockId, block.sourceText])) }, 595, 842); } }, [samples]);
  const exportProject = async (value: ProjectState, stem: string) => { setStatus(`正在生成 ${stem}…`); await document.fonts.ready; const body = new FormData(); for (const page of value.pages) { const canvas = document.createElement("canvas"); renderCompositeCanvas(canvas, { page, pageCount: value.pages.length, font, background, handwriting,
    inkStyle: value.inkStyle, correctionStyle: value.correctionStyle, footerMode: value.footerMode,
    seed: value.seed, documentId: value.document.id, patientFields: {}, fieldTextById: Object.fromEntries(V3_SHOWCASE_BLOCKS.map((block) => [block.blockId, block.sourceText])) }, A4_PIXELS[300].width, A4_PIXELS[300].height); const blob = await canvasBlob(canvas); body.append("files", blob, `page-${page.pageIndex + 1}.png`); if (page.pageIndex === 0) download(blob, `${stem}-300dpi.png`); } body.append("name", stem); const response = await apiFetch("/api/export/pdf", { method: "POST", body }); if (!response.ok) throw new Error("PDF 生成失败"); download(await response.blob(), `${stem}.pdf`); setStatus(`${stem} 已生成`); };
  return <main className="min-h-screen bg-[#f3f6f8] px-5 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-[1500px]">
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold tracking-[.18em] text-[#287e86]">V4.2.1 PUBLIC SHOWCASE</p><h1 className="mt-1 text-2xl font-semibold">通用文档排版与 Block 结构验收</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">全部内容为脱敏合成数据。展示保留原文结构、简化正文、结构块和多页连续预览。</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/">返回编辑器</Link></Button><Button onClick={() => void exportProject(preserve, "v4-preserve-structure")}><Download />保留结构 PDF</Button><Button onClick={() => void exportProject(simplified, "v4-simplified")}><Download />简化正文 PDF</Button></div></header>
    <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><ShieldCheck className="size-4" />公网 Showcase 不包含真实病历或患者身份信息。{status && <span className="ml-auto">{status}</span>}</div>
    <section className="grid gap-5 lg:grid-cols-2">{samples.map((sample) => <article key={sample.key} className="rounded-2xl border bg-white p-4 shadow-sm"><h2 className="text-sm font-semibold">{sample.key} · {sample.title}</h2><p className="mb-3 mt-1 text-xs text-slate-400">{sample.project.pages.length} 页 · schema v3</p><canvas ref={(element) => { if (element) canvases.current.set(sample.key, element); }} className="h-auto w-full border shadow-sm" /></article>)}</section>
    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><article className="rounded-xl border bg-white p-4"><h2 className="font-semibold">D · KeyValueBlock</h2><p className="mt-2 text-sm leading-7">姓名：测试患者A　病案号：DEMO-001<br />年龄：45岁　出生地：测试地区</p></article><article className="rounded-xl border bg-white p-4"><h2 className="font-semibold">E · TableBlock</h2><table className="mt-2 w-full text-center text-sm"><tbody>{(V3_SHOWCASE_BLOCKS.find((block) => block.type === "table")?.rows ?? []).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-slate-200 p-1">{cell}</td>)}</tr>)}</tbody></table></article><article className="rounded-xl border bg-white p-4"><h2 className="font-semibold">F · PrescriptionBlock</h2><div className="mt-2 grid grid-cols-4 gap-x-2 gap-y-1 text-xs">{V3_SHOWCASE_BLOCKS.find((block) => block.type === "prescription")?.items.map((item) => <span key={item.raw} className="whitespace-nowrap">{item.raw}</span>)}</div></article><article className="rounded-xl border bg-white p-4"><h2 className="font-semibold">G · SignatureBlock</h2><p className="mt-2 text-right text-sm leading-7">带教老师：测试教师<br />规培医师：测试医师</p></article></section>
    <section className="mt-6 grid gap-4 md:grid-cols-3"><article className="rounded-xl border bg-white p-4"><h2 className="font-semibold">H · 页面管理</h2><p className="mt-2 text-sm text-slate-500">新增空白页、复制、拖拽排序、安全删除、Undo。</p></article><article className="rounded-xl border bg-white p-4"><h2 className="font-semibold">I · 唯一正式流程</h2><p className="mt-2 text-sm text-slate-500">DocumentBlock → 自动分页 → 手写渲染；模板字段映射已停用。</p></article><article className="rounded-xl border bg-white p-4"><h2 className="font-semibold">J · 多页连续预览</h2><div className="mt-3 flex flex-wrap gap-2">{preserve.pages.map((page: PageState) => <span key={page.pageId} className="rounded-md bg-slate-100 px-2 py-1 text-xs">第 {page.pageIndex + 1} 页 · {page.lines.length} 行</span>)}</div></article></section>
  </div></main>;
}
