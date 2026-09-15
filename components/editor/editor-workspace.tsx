"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, FileJson, FileText, Grid3X3, Lock, Minus, Plus, Redo2, RefreshCw, Save, Sparkles, Undo2, Upload } from "lucide-react";

import { BackgroundManager } from "./background-manager";
import { DocumentLayoutPanel } from "./document-layout-panel";
import { FontManager } from "./font-manager";
import { HandwritingCanvas } from "./handwriting-canvas";
import { PageManager } from "./page-manager";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API_BASE_URL, apiFetch, apiJson, getSessionId } from "@/lib/api/client";
import { DEMO_DOCUMENT_NAME, DEMO_INITIAL_FIELDS } from "@/lib/demo/medical-record-fixture";
import { BACKGROUND_PRESETS, renderBackground } from "@/lib/handwriting/background-library";
import { A4_PIXELS, PAGE_HEIGHT, PAGE_WIDTH, renderCompositeCanvas, type RenderOptions } from "@/lib/handwriting/canvas-renderer";
import { ensureFontsReady, FONT_SLOTS, loadUploadedFont } from "@/lib/handwriting/font-library";
import { applyLineSnapping, DEFAULT_LINE_DETECTION, detectHorizontalLines, normalizeLineDetection, presetHorizontalLines } from "@/lib/background/line-detection";
import { DEFAULT_RANDOMIZATION, PRESET_NATURALITY } from "@/lib/handwriting/randomization";
import { deserializeProject, documentBlockFingerprint, documentFingerprint, serializeProject } from "@/lib/handwriting/serialization";
import { nextSeed } from "@/lib/handwriting/seeded-random";
import { DEFAULT_DOCUMENT_LAYOUT_SETTINGS, lineX, lineY, type BackgroundAsset, type DocumentBlock, type FieldMapping, type FontAsset, type HandwritingPreset, type HorizontalLineDetection, type LineLayout, type ProjectState, type RandomizationConfig } from "@/lib/handwriting/types";
import { commitGesture, commitHistory, createHistory, redoHistory, replacePresent, undoHistory } from "@/lib/history/history-store";
import { validateDocumentCoverage } from "@/lib/layout/coverage";
import { applyFontToPages, layoutProjectPages } from "@/lib/layout/project-layout";
import { createApproximateTextMeasurer, createCanvasTextMeasurer } from "@/lib/layout/text-measure";
import { addBlankPage, deletePageContent, duplicatePage, inspectPageDeletion, movePage } from "@/lib/pages/page-manager";

function demoBlocks(fields: FieldMapping[]): { blocks: DocumentBlock[]; fields: FieldMapping[] } {
  const patient = fields.filter((field) => field.role === "patient");
  const body = fields.filter((field) => field.role === "body");
  const keySource = patient.map((field) => `${field.label}：${field.value}`).join("\t");
  const keyBlock: DocumentBlock = { blockId: "demo-patient", type: "key-value", sourceOrder: 0, sourceStart: 0,
    sourceEnd: keySource.length, sourceText: keySource, items: patient.map((field) => ({ key: field.label, value: field.value, raw: `${field.label}：${field.value}` })), columns: "auto", allowSplit: true };
  const blocks: DocumentBlock[] = [keyBlock, ...body.map((field, index): DocumentBlock => { const sourceText = `${field.label ? `${field.label}：` : ""}${field.value}`; return {
    blockId: `demo-${field.id}`, type: "paragraph", sourceOrder: index + 1, sourceStart: 0, sourceEnd: sourceText.length,
    sourceText, label: field.label, content: field.value, firstLineIndent: 0, lineHeight: 34, paragraphSpacing: 8, allowSplit: true,
  }; })];
  return { blocks, fields: fields.map((field) => ({ ...field, sourceBlockIds: field.role === "patient" ? [keyBlock.blockId] : [`demo-${field.id}`] })) };
}

function makeProject(fields = DEMO_INITIAL_FIELDS, name = DEMO_DOCUMENT_NAME, rawTexts = fields.map((field) => field.sourceText), previous?: ProjectState): ProjectState {
  const fontId = previous?.selectedFontId ?? "system-xingkai";
  const font = FONT_SLOTS.find((item) => item.id === fontId) ?? FONT_SLOTS[0];
  const demo = demoBlocks(fields); const documentId = documentFingerprint(demo.fields);
  const base: ProjectState = {
    schemaVersion: 3, projectVersion: "4.0.0", id: previous?.id ?? "current",
    document: { id: documentId, name, rawTexts, sourceCharacterCount: fields.reduce((sum, field) => sum + Array.from(field.value).length, 0) },
    layoutMode: "no-template", noTemplateMode: previous?.noTemplateMode ?? "preserve-structure",
    templateId: null, documentBlocks: demo.blocks,
    mappedBlockIds: [], unmappedBlockIds: [], explicitlyIgnoredBlockIds: [],
    documentLayoutSettings: previous?.documentLayoutSettings ?? { ...DEFAULT_DOCUMENT_LAYOUT_SETTINGS },
    seed: previous?.seed ?? "1001", selectedFontId: fontId, fieldMappings: demo.fields, pages: previous?.pages ?? [],
    handwriting: previous?.handwriting ?? { preset: "natural", naturality: PRESET_NATURALITY.natural, randomization: { ...DEFAULT_RANDOMIZATION }, inkColor: "#163d64", fixed: false },
    exportSettings: previous?.exportSettings ?? { pageSize: "A4", dpi: 300, format: "png", jpgQuality: 0.9 }, updatedAt: new Date().toISOString(),
  };
  return { ...base, pages: layoutProjectPages(base, createApproximateTextMeasurer(), font) };
}

function RangeRow({ label, value, display, min, max, step = 1, disabled, onChange }: { label: string; value: number; display: string; min: number; max: number; step?: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <div className="space-y-2"><div className="flex justify-between text-sm"><span className="text-slate-700">{label}</span><span className="tabular-nums text-slate-400">{display}</span></div><Slider disabled={disabled} value={[value]} min={min} max={max} step={step} onValueChange={(next) => onChange(Number(next[0]))} /></div>;
}

function rawTextsFromDocument(document: { blocks?: DocumentBlock[] }) {
  return (document.blocks ?? []).map((block) => block.sourceText).filter(Boolean);
}

function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) { return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("导出失败")), type, quality)); }
const exportImageCache = new Map<string, CanvasImageSource>();
async function loadExportBackground(asset: BackgroundAsset) {
  if (asset.kind !== "uploaded" || !asset.fileUrl) return undefined;
  const cached = exportImageCache.get(asset.id); if (cached) return cached;
  const bitmap = await createImageBitmap(await (await fetch(asset.fileUrl)).blob()); exportImageCache.set(asset.id, bitmap); return bitmap;
}

export function EditorWorkspace({ initialTab = "document" }: { initialTab?: "document" | "font" | "background" }) {
  const [history, setHistory] = useState(() => createHistory(makeProject()));
  const project = history.present;
  const [fonts, setFonts] = useState<FontAsset[]>(FONT_SLOTS);
  const [backgrounds, setBackgrounds] = useState<BackgroundAsset[]>(BACKGROUND_PRESETS);
  const [selectedId, setSelectedId] = useState(project.pages[0]?.lines[0]?.id ?? "");
  const [currentPageId, setCurrentPageId] = useState(project.pages[0]?.pageId ?? "page-1");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [advanced, setAdvanced] = useState(false);
  const [zoom, setZoom] = useState(0.82);
  const [parseStatus, setParseStatus] = useState("已载入示例内容");
  const [resourceError, setResourceError] = useState("");
  const [detectingLines, setDetectingLines] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("未保存");
  const [autosaveKey, setAutosaveKey] = useState("");
  const [autosaveReady, setAutosaveReady] = useState(false);
  const projectInput = useRef<HTMLInputElement>(null);
  const dragBaseline = useRef<ProjectState | null>(null);

  const allLines = project.pages.flatMap((page) => page.lines);
  const selected = allLines.find((line) => line.id === selectedId) ?? allLines[0];
  const currentPage = (project.pages.find((page) => page.pageId === currentPageId) ?? project.pages[0])!;
  const activeFontId = selected?.fontId ?? project.selectedFontId;
  const font = fonts.find((item) => item.id === activeFontId) ?? fonts[0];
  const coverage = useMemo(() => validateDocumentCoverage(project.fieldMappings, project.pages, {
    blocks: project.documentBlocks, ignoredBlockIds: project.explicitlyIgnoredBlockIds,
  }), [project]);
  const patientFields = useMemo(() => Object.fromEntries(project.fieldMappings.filter((field) => field.role === "patient").map((field) => [field.id, field.value])), [project.fieldMappings]);
  const fieldTextById = useMemo(() => Object.fromEntries([
    ...project.fieldMappings.map((field) => [field.id, field.role === "body" ? `${field.label ? `${field.label}：` : ""}${field.value}` : field.value]),
    ...project.documentBlocks.map((block) => [block.blockId, block.sourceText]),
  ]), [project.fieldMappings, project.documentBlocks]);

  useEffect(() => {
    Promise.all([apiJson<FontAsset[]>("/api/fonts"), apiJson<BackgroundAsset[]>("/api/backgrounds")])
      .then(async ([uploadedFonts, uploadedBackgrounds]) => {
        const loaded: FontAsset[] = []; const failed: FontAsset[] = [];
        for (const item of uploadedFonts) {
          try { await loadUploadedFont(item); loaded.push(item); }
          catch (error) { failed.push({ ...item, enabled: false, loadError: error instanceof Error ? error.message : "字体加载失败" }); }
        }
        setFonts([...loaded, ...failed, ...FONT_SLOTS]); setBackgrounds([...uploadedBackgrounds, ...BACKGROUND_PRESETS]);
        setResourceError(failed.length ? `${failed.length} 个字体未能真正加载，已禁用以避免系统字体回退` : "");
      }).catch((error) => setResourceError(error instanceof Error ? error.message : "字体与背景资源载入失败"));
  }, []);

  useEffect(() => { void getSessionId().then((sessionId) => {
    const key = `handwrite-studio-draft-v3:${sessionId}`; setAutosaveKey(key);
    const draft = localStorage.getItem(key);
    if (draft) { try { const restored = deserializeProject(draft); setHistory(createHistory(restored)); setCurrentPageId(restored.pages[0]?.pageId ?? "page-1"); setSelectedId(restored.pages[0]?.lines[0]?.id ?? ""); setParseStatus("已恢复当前私密会话草稿"); } catch { localStorage.removeItem(key); } }
    setAutosaveReady(true);
  }).catch(() => setAutosaveReady(true)); }, []);

  useEffect(() => {
    if (!autosaveReady || !autosaveKey) return;
    const timer = window.setTimeout(() => { localStorage.setItem(autosaveKey, serializeProject(project)); setSaveStatus("已保存"); }, 500);
    return () => window.clearTimeout(timer);
  }, [project, autosaveKey, autosaveReady]);

  const commit = (next: ProjectState) => { setSaveStatus("未保存"); setHistory((state) => commitHistory(state, { ...next, updatedAt: new Date().toISOString() })); };
  const change = (mutator: (state: ProjectState) => ProjectState) => commit(mutator(project));
  const relayout = (fields: FieldMapping[] = project.fieldMappings, base = project, nextFontId = base.selectedFontId, fontOverride?: FontAsset) => {
    const nextFont = fontOverride ?? fonts.find((item) => item.id === nextFontId) ?? FONT_SLOTS[0];
    const canvas = document.createElement("canvas"); const context = canvas.getContext("2d");
    const measurer = context ? createCanvasTextMeasurer(context) : createApproximateTextMeasurer();
    const next = { ...base, selectedFontId: nextFontId, fieldMappings: fields };
    let pages = layoutProjectPages(next, measurer, nextFont);
    if (nextFontId !== base.selectedFontId) pages = applyFontToPages(pages, nextFontId);
    return { ...next, pages };
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const tag = (event.target as HTMLElement)?.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); setHistory(undoHistory); }
      if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) { event.preventDefault(); setHistory(redoHistory); }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, []);

  const optionsFor = (pageId: string, showLineGuides = false): RenderOptions => {
    const page = project.pages.find((item) => item.pageId === pageId) ?? project.pages[0];
    const pageBackground = backgrounds.find((item) => item.id === page.backgroundId) ?? backgrounds[0];
    return { page, pageCount: project.pages.length, font, fonts, background: pageBackground, handwriting: project.handwriting,
      seed: project.seed, documentId: project.document.id, patientFields, fieldTextById, selectedLineId: selectedId, showLineGuides };
  };

  const updateLine = (patch: Partial<LineLayout>) => {
    if (!selected) return;
    change((state) => ({ ...state, pages: state.pages.map((page) => ({ ...page, lines: page.lines.map((line) => line.id === selected.id ? { ...line, ...patch } : line) })) }));
  };
  const selectLine = (id: string) => { setSelectedId(id); const page = project.pages.find((item) => item.lines.some((line) => line.id === id)); if (page) setCurrentPageId(page.pageId); };
  const onDragLines = (pageId: string, lines: typeof currentPage.lines, phase: "preview" | "commit") => {
    if (phase === "preview") {
      if (!dragBaseline.current) dragBaseline.current = history.present;
      setHistory((state) => replacePresent(state, { ...state.present, pages: state.present.pages.map((page) => page.pageId === pageId ? { ...page, lines } : page) }));
    } else if (dragBaseline.current) {
      const before = dragBaseline.current; dragBaseline.current = null;
      setHistory((state) => commitGesture(state, before, state.present));
    }
  };
  const selectFont = (id: string, fontOverride?: FontAsset) => {
    if (project.handwriting.fixed && id !== activeFontId && !window.confirm("当前笔迹已固定。更换字体需要解除固定并重新生成笔迹，是否继续？")) return;
    const next = relayout(project.fieldMappings, { ...project, handwriting: { ...project.handwriting, fixed: false }, seed: project.handwriting.fixed ? nextSeed(project.seed) : project.seed }, id, fontOverride);
    commit(next); setSelectedId(next.pages.flatMap((page) => page.lines).find((line) => line.fieldId === selected?.fieldId)?.id ?? next.pages[0]?.lines[0]?.id ?? "");
  };
  const setHandwriting = (patch: Partial<ProjectState["handwriting"]>) => change((state) => ({ ...state, handwriting: { ...state.handwriting, ...patch } }));
  const updateRandomization = (key: keyof RandomizationConfig, value: number) => setHandwriting({ randomization: { ...project.handwriting.randomization, [key]: value } });
  const choosePreset = (preset: HandwritingPreset) => setHandwriting({ preset, naturality: PRESET_NATURALITY[preset] });

  const uploadDocx = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setParseStatus("正在本地解析与排版…"); const body = new FormData(); body.append("file", file);
    try {
      const response = await apiFetch("/api/documents/parse", { method: "POST", body }); if (!response.ok) throw new Error(String((await response.json() as { detail?: string }).detail ?? "解析失败"));
      const result = await response.json() as { document: { blocks?: DocumentBlock[]; rawCharacterCount?: number; blockCounts?: Record<string, number> } };
      const blocks = result.document.blocks ?? [];
      const rawTexts = rawTextsFromDocument(result.document);
      const base: ProjectState = { ...project, layoutMode: "no-template", templateId: null, documentBlocks: blocks,
        mappedBlockIds: [], unmappedBlockIds: [], explicitlyIgnoredBlockIds: [], fieldMappings: [],
        document: { id: documentBlockFingerprint(blocks), name: file.name, rawTexts, sourceCharacterCount: result.document.rawCharacterCount ?? blocks.reduce((sum, block) => sum + Array.from(block.sourceText.replace(/\s+/gu, "")).length, 0) } };
      const next = relayout([], base); commit(next); setSelectedId(next.pages[0]?.lines[0]?.id ?? ""); setCurrentPageId(next.pages[0]?.pageId ?? "page-1");
      const report = validateDocumentCoverage([], next.pages, { blocks, ignoredBlockIds: [] });
      setParseStatus(`已解析 ${blocks.length} 个 Block · ${next.pages.length} 页 · Missing ${report.missingCharacters}`);
    } catch (error) { setParseStatus(error instanceof Error ? error.message : "解析服务未启动"); }
    event.target.value = "";
  };

  const saveProject = async () => {
    const json = serializeProject(project); downloadBlob(new Blob([json], { type: "application/json" }), `${project.document.name.replace(/\.[^.]+$/, "")}.handwrite.json`);
    setSaveStatus("保存中"); void apiFetch("/api/projects/current", { method: "PUT", headers: { "Content-Type": "application/json" }, body: json }).then(() => setSaveStatus("已保存")).catch(() => setSaveStatus("未保存"));
  };
  const openProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { const next = deserializeProject(await file.text()); setHistory(createHistory(next)); setSelectedId(next.pages[0]?.lines[0]?.id ?? ""); setCurrentPageId(next.pages[0]?.pageId ?? "page-1"); setParseStatus(`项目已恢复 · V${next.schemaVersion}`); }
    catch { setParseStatus("项目文件无效"); } event.target.value = "";
  };
  const exportDocument = async () => {
    if (!coverage.valid) { setExportStatus(`内容校验未通过：缺失 ${coverage.missingCharacters} 字，请重新排版后导出。`); return; }
    setExportStatus("准备高分辨率页面…");
    try {
      const fontIds = [...new Set([project.selectedFontId, ...project.pages.flatMap((page) => page.lines.map((line) => line.fontId))])];
      const exportFonts = fontIds.map((id) => fonts.find((item) => item.id === id)).filter((item): item is FontAsset => Boolean(item));
      if (exportFonts.length !== fontIds.length) throw new Error("项目引用的字体资源不完整，已阻止静默回退导出");
      await ensureFontsReady(exportFonts);
      const pixels = A4_PIXELS[project.exportSettings.dpi]; const pageBlobs: Blob[] = [];
      for (let index = 0; index < project.pages.length; index += 1) {
        setExportStatus(`正在绘制 ${index + 1} / ${project.pages.length} 页`);
        const canvas = document.createElement("canvas"); const options = optionsFor(project.pages[index].pageId);
        options.backgroundImage = await loadExportBackground(options.background);
        renderCompositeCanvas(canvas, options, pixels.width, pixels.height);
        pageBlobs.push(await canvasBlob(canvas, project.exportSettings.format === "jpg" ? "image/jpeg" : "image/png", project.exportSettings.jpgQuality));
      }
      const stem = project.document.name.replace(/\.[^.]+$/, "");
      if (project.exportSettings.format === "pdf") {
        const body = new FormData(); body.append("name", `${stem}-${project.seed}`); pageBlobs.forEach((blob, index) => body.append("files", blob, `page-${index + 1}.png`));
        const response = await apiFetch("/api/export/pdf", { method: "POST", body }); if (!response.ok) throw new Error(String((await response.json() as { detail?: string }).detail ?? "PDF 导出失败"));
        downloadBlob(await response.blob(), `${stem}-${project.seed}.pdf`);
      } else {
        await Promise.all(pageBlobs.map(async (blob, index) => {
          const name = `${stem}-${project.seed}-p${index + 1}`;
          const body = new FormData(); body.append("file", blob, `${name}.${project.exportSettings.format}`);
          const response = await apiFetch(`/api/exports/${encodeURIComponent(name)}`, { method: "POST", body });
          if (!response.ok) throw new Error(`第 ${index + 1} 页导出保存失败`);
          downloadBlob(blob, `${name}.${project.exportSettings.format}`);
        }));
      }
      setExportStatus(`完成：${project.pages.length} 页 · ${pixels.width}×${pixels.height}`);
    } catch (error) { setExportStatus(error instanceof Error ? error.message : "导出失败"); }
  };

  const updateCurrentPage = (patch: Partial<typeof currentPage>) => change((state) => ({ ...state, pages: state.pages.map((page) => page.pageId === currentPage.pageId ? { ...page, ...patch } : page) }));
  const updateLineDetection = (lineDetection: HorizontalLineDetection) => change((state) => ({ ...state, pages: state.pages.map((page) => page.pageId === currentPage.pageId ? applyLineSnapping(page, lineDetection) : page) }));
  const selectBackground = (backgroundId: string) => change((state) => ({ ...state, pages: state.pages.map((page) => page.pageId === currentPage.pageId ? applyLineSnapping({ ...page, backgroundId }, { ...DEFAULT_LINE_DETECTION }) : page) }));
  const detectCurrentBackgroundLines = async () => {
    setDetectingLines(true); setResourceError("");
    try {
      const background = backgrounds.find((item) => item.id === currentPage.backgroundId) ?? backgrounds[0];
      let result = presetHorizontalLines(background, PAGE_HEIGHT);
      if (background.kind === "uploaded") {
        if (Math.abs(currentPage.backgroundAdjustments.rotation) > 0.2) throw new Error("本阶段仅检测水平横线，请先将背景旋转调整为 0°");
        const image = await loadExportBackground(background);
        if (!image) throw new Error("背景图片尚未加载完成");
        const canvas = document.createElement("canvas"); canvas.width = PAGE_WIDTH; canvas.height = PAGE_HEIGHT;
        const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("浏览器无法读取背景像素");
        renderBackground(context, background, currentPage.backgroundAdjustments, PAGE_WIDTH, PAGE_HEIGHT, `detect:${currentPage.pageId}`, image, currentPage.backgroundTransform);
        result = detectHorizontalLines(context.getImageData(0, 0, PAGE_WIDTH, PAGE_HEIGHT));
      }
      const success = result.lineY.length >= 3 && result.confidence >= 0.35;
      const next = normalizeLineDetection({ ...DEFAULT_LINE_DETECTION, enabled: success, snapEnabled: success,
        showLines: success, source: background.kind === "preset" ? "preset" : "detected", ...result });
      updateLineDetection(next);
      if (!success) setResourceError("未可靠检测到水平横线；吸附未启用，可在横线适配中手动添加横线");
    } catch (error) { setResourceError(error instanceof Error ? error.message : "横线检测失败"); }
    finally { setDetectingLines(false); }
  };
  const commitRelayout = (base: ProjectState) => { const next = relayout(base.fieldMappings, base); commit(next); setCurrentPageId(next.pages[0]?.pageId ?? "page-1"); setSelectedId(next.pages[0]?.lines[0]?.id ?? ""); };
  const setNoTemplateMode = (noTemplateMode: ProjectState["noTemplateMode"]) => commitRelayout({ ...project, noTemplateMode });
  const setLayoutSettings = (documentLayoutSettings: ProjectState["documentLayoutSettings"]) => commitRelayout({ ...project, documentLayoutSettings });
  const addPage = () => { const pages = addBlankPage(project.pages, currentPage.pageIndex); const next = { ...project, pages }; commit(next); setCurrentPageId(pages[currentPage.pageIndex + 1].pageId); };
  const copyPage = (pageId: string) => { const pages = duplicatePage(project.pages, pageId); commit({ ...project, pages }); setCurrentPageId(pages[Math.min(pages.length - 1, pages.findIndex((page) => page.pageId === pageId) + 1)].pageId); };
  const reorderPage = (pageId: string, targetIndex: number) => change((state) => ({ ...state, pages: movePage(state.pages, pageId, targetIndex) }));
  const deletePage = (pageId: string) => {
    const inspection = inspectPageDeletion(project.pages, pageId);
    if (!inspection.protected) { const pages = deletePageContent(project.pages, pageId); commit({ ...project, pages }); setCurrentPageId(pages[0].pageId); return; }
    if (window.confirm(`该页包含 ${inspection.blockCount} 个 Block / ${inspection.lineCount} 行。\n确定：删除页面并自动重新排版内容。\n取消：进入“同时删除内容”确认。`)) {
      const base = { ...project, pages: deletePageContent(project.pages, pageId) }; commitRelayout(base); return;
    }
    if (!window.confirm("同时删除页面和内容会使这些 Block 不再出现在最终文档中。是否确认？")) return;
    const page = project.pages.find((item) => item.pageId === pageId);
    const blockIds = [...new Set(page?.lines.map((line) => line.blockId).filter((id): id is string => Boolean(id)) ?? [])];
    const base = { ...project, pages: deletePageContent(project.pages, pageId), explicitlyIgnoredBlockIds: [...new Set([...project.explicitlyIgnoredBlockIds, ...blockIds])] };
    commitRelayout(base);
  };
  return <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#f3f6f8] text-slate-900">
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-2 backdrop-blur sm:px-7">
      <div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#153f49] text-white"><FileText className="size-4.5" /></div><div className="hidden min-w-0 sm:block"><div className="flex items-center gap-2"><h1 className="text-[15px] font-semibold">墨迹排版台 V4.0</h1><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">{API_BASE_URL.includes("127.0.0.1") || API_BASE_URL.includes("localhost") ? "本地隐私模式" : "在线临时会话"}</span></div><p className="max-w-96 truncate text-xs text-slate-400">{project.document.name} · {project.pages.length} 页 · {project.noTemplateMode === "preserve-structure" ? "保留结构" : "简化正文"} · Seed {project.seed} · {saveStatus}</p></div></div>
      <div className="flex items-center gap-1.5"><label aria-label="导入 DOCX" className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 xl:hidden"><Upload className="size-4" /><input className="sr-only" type="file" accept=".docx" onChange={uploadDocx} /></label><select aria-label="导出格式" className="h-8 rounded-md border border-slate-200 bg-white px-1 text-[11px] xl:hidden" value={project.exportSettings.format} onChange={(event) => change((state) => ({ ...state, exportSettings: { ...state.exportSettings, format: event.target.value as "png" | "jpg" | "pdf" } }))}><option value="png">PNG</option><option value="jpg">JPG</option><option value="pdf">PDF</option></select><Button className="xl:hidden" variant="ghost" size="icon-sm" disabled={project.handwriting.fixed} onClick={() => change((state) => ({ ...state, seed: nextSeed(state.seed) }))} aria-label="换一种笔迹"><RefreshCw /></Button><Button variant="ghost" size="icon-sm" disabled={!history.past.length} onClick={() => setHistory(undoHistory)} aria-label="撤销"><Undo2 /></Button><Button variant="ghost" size="icon-sm" disabled={!history.future.length} onClick={() => setHistory(redoHistory)} aria-label="重做"><Redo2 /></Button><Button variant="outline" className="hidden rounded-lg md:inline-flex" onClick={saveProject}><Save />保存项目</Button><Button className="rounded-lg bg-[#d96945] text-white hover:bg-[#bf5737]" onClick={exportDocument}><Download />导出 {project.exportSettings.format.toUpperCase()}</Button></div>
    </header>

    <div className="sticky top-16 z-20 flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-4 text-xs backdrop-blur xl:hidden">
      <select aria-label="文档结构" className="h-8 rounded-md border border-slate-200 bg-white px-2" value={project.noTemplateMode} onChange={(event) => setNoTemplateMode(event.target.value as "preserve-structure" | "simplified")}><option value="preserve-structure">保留结构</option><option value="simplified">简化正文</option></select>
      <span className={`ml-auto whitespace-nowrap ${coverage.valid ? "text-emerald-700" : "text-rose-700"}`}>Missing {coverage.missingCharacters}</span>
    </div>

    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[300px_minmax(620px,1fr)_320px]">
      <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white px-4 py-5 max-xl:hidden"><Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList className="grid h-auto w-full grid-cols-3"><TabsTrigger value="document">文档</TabsTrigger><TabsTrigger value="font">字体</TabsTrigger><TabsTrigger value="background">背景</TabsTrigger></TabsList>
        <TabsContent value="document" className="mt-5 space-y-5">
          <div><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">输入内容</h2><span className="text-xs text-[#287e86]">{parseStatus}</span></div><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 hover:border-[#287e86]"><span className="grid size-9 place-items-center rounded-lg bg-white text-[#287e86] shadow-sm"><Upload className="size-4" /></span><span><strong className="block text-sm font-medium">替换文档</strong><small className="text-xs text-slate-400">支持 DOCX · 自动分页</small></span><input className="sr-only" type="file" accept=".docx" onChange={uploadDocx} /></label></div>
          <DocumentLayoutPanel noTemplateMode={project.noTemplateMode} settings={project.documentLayoutSettings} onNoTemplateMode={setNoTemplateMode} onSettings={setLayoutSettings} />
          <div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={saveProject}><FileJson />保存 JSON</Button><Button variant="outline" size="sm" onClick={() => projectInput.current?.click()}><Upload />打开项目</Button><input ref={projectInput} className="sr-only" type="file" accept=".json,.handwrite.json" onChange={openProject} /></div>
          <div className="rounded-xl border border-[#cce4e2] bg-[#eff9f8] p-3 text-xs leading-5 text-[#356b6c]"><div className="mb-1 flex items-center gap-2 font-semibold"><Sparkles className="size-3.5" />Block 完整性检查</div><div className="grid grid-cols-2 gap-x-3"><span>Raw {coverage.rawCharacters}</span><span>Recognized {coverage.recognizedCharacters}</span><span>Laid out {coverage.laidOutCharacterCount}</span><span>Ignored {coverage.explicitlyIgnoredCharacters}</span></div><strong className={coverage.valid ? "text-emerald-700" : "text-rose-700"}>Missing {coverage.missingCharacters}</strong></div>
          <PageManager pages={project.pages} currentPageId={currentPage.pageId} onSelect={setCurrentPageId} onAdd={addPage} onDuplicate={copyPage} onMove={reorderPage} onDelete={deletePage} />
        </TabsContent>
        <TabsContent value="font" className="mt-5">{resourceError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{resourceError}</p>}<FontManager fonts={fonts} selectedId={activeFontId} onSelect={(id) => selectFont(id)} onUploaded={(asset) => { setFonts((items) => [asset, ...items.filter((item) => item.id !== asset.id)]); selectFont(asset.id, asset); setResourceError(""); }} /></TabsContent>
        <TabsContent value="background" className="mt-5">{resourceError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{resourceError}</p>}<BackgroundManager backgrounds={backgrounds} selectedId={currentPage.backgroundId} adjustments={currentPage.backgroundAdjustments} transform={currentPage.backgroundTransform} lineDetection={normalizeLineDetection(currentPage.lineDetection)} detecting={detectingLines} onSelect={selectBackground} onAdjust={(backgroundAdjustments) => updateCurrentPage({ backgroundAdjustments })} onTransform={(backgroundTransform) => updateCurrentPage({ backgroundTransform })} onLineDetection={updateLineDetection} onDetectLines={() => void detectCurrentBackgroundLines()} onApplySuggestedLayout={(bodyFontSize, lineHeight) => setLayoutSettings({ ...project.documentLayoutSettings, bodyFontSize, lineHeight })} onApplyToAll={() => change((state) => ({ ...state, pages: state.pages.map((page) => applyLineSnapping({ ...page, backgroundId: currentPage.backgroundId, backgroundAdjustments: { ...currentPage.backgroundAdjustments }, backgroundTransform: { ...currentPage.backgroundTransform } }, normalizeLineDetection(currentPage.lineDetection))) }))} onUploaded={(asset) => { setBackgrounds((items) => [asset, ...items.filter((item) => item.id !== asset.id)]); selectBackground(asset.id); }} /></TabsContent>
      </Tabs></aside>

      <section className="flex min-h-0 flex-col overflow-hidden bg-[#e7ecef]"><div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-5 text-xs text-slate-500"><span className="flex items-center gap-2"><Grid3X3 className="size-4" />多页 Canvas · 当前第 {currentPage.pageIndex + 1} 页</span><span className="flex items-center gap-2"><Button variant="ghost" size="icon-sm" onClick={() => setZoom((value) => Math.max(0.5, value - 0.08))}><Minus /></Button>{Math.round(zoom * 100)}%<Button variant="ghost" size="icon-sm" onClick={() => setZoom((value) => Math.min(1.2, value + 0.08))}><Plus /></Button></span></div><div className="scrollbar-thin flex min-h-0 flex-1 flex-col items-center gap-12 overflow-auto p-8 sm:p-12">{project.pages.map((page) => <div key={page.pageId} className="space-y-3"><div className="text-center text-xs text-slate-500">第 {page.pageIndex + 1} 页 · {page.pageType ?? "continuation"}</div><HandwritingCanvas options={optionsFor(page.pageId, true)} zoom={zoom} active={page.pageId === currentPage.pageId} onActivate={() => setCurrentPageId(page.pageId)} onSelectLine={selectLine} onChangeLines={(lines, phase) => onDragLines(page.pageId, lines, phase)} onRenderError={setResourceError} /></div>)}</div></section>

      <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white px-5 py-5 max-xl:hidden">{selected ? <>
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-sm font-semibold">当前行参数</h2><p className="mt-0.5 text-xs text-slate-400">自动坐标 + 手动偏移 · 字符状态稳定</p></div><Switch checked={selected.locked} onCheckedChange={(locked) => updateLine({ locked })} aria-label="锁定当前行" /></div>
        <button onClick={() => setActiveTab("font")} className="mb-5 flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-sm text-slate-700"><span>字体 · {font.name}</span><ChevronDown className="size-4 text-slate-400" /></button>
        <div className="space-y-4"><RangeRow label="X（最终）" value={lineX(selected)} display={`${Math.round(lineX(selected))} px`} min={0} max={560} onChange={(x) => updateLine({ manualOffsetX: x - selected.autoX })} /><RangeRow label="Y（最终）" value={lineY(selected)} display={`${Math.round(lineY(selected))} px`} min={100} max={780} onChange={(y) => updateLine({ manualOffsetY: y - selected.autoY - (selected.lineSnapOffset ?? 0) })} /><RangeRow label="字号" value={selected.fontSize} display={`${selected.fontSize} px`} min={12} max={28} onChange={(fontSize) => updateLine({ fontSize })} /><RangeRow label="字距" value={selected.letterSpacing} display={`${selected.letterSpacing.toFixed(1)} px`} min={-1} max={5} step={0.1} onChange={(letterSpacing) => updateLine({ letterSpacing })} /><RangeRow label="旋转" value={selected.rotation} display={`${selected.rotation.toFixed(1)}°`} min={-4} max={4} step={0.1} onChange={(rotation) => updateLine({ rotation })} /><RangeRow label="行距" value={selected.lineHeight} display={`${selected.lineHeight} px`} min={28} max={72} onChange={(lineHeight) => updateLine({ lineHeight })} /></div>
        <div className="mt-6 border-t border-slate-100 pt-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">手写自然度</h3><span className="text-xs text-slate-400">{project.handwriting.naturality}</span></div><div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">{(["neat", "natural", "messy"] as const).map((preset) => <button disabled={project.handwriting.fixed} key={preset} onClick={() => choosePreset(preset)} className={`rounded-md px-2 py-1.5 text-xs disabled:opacity-50 ${project.handwriting.preset === preset ? "bg-white font-medium shadow-sm" : "text-slate-500"}`}>{preset === "neat" ? "整洁" : preset === "natural" ? "自然" : "凌乱"}</button>)}</div><Slider disabled={project.handwriting.fixed} value={[project.handwriting.naturality]} min={0} max={100} onValueChange={(value) => setHandwriting({ naturality: Number(value[0]) })} /></div>
        <div className="mt-5 grid grid-cols-2 gap-2"><Button disabled={project.handwriting.fixed} onClick={() => change((state) => ({ ...state, seed: nextSeed(state.seed) }))}><RefreshCw />换一种笔迹</Button><Button variant="outline" onClick={() => setHandwriting({ fixed: !project.handwriting.fixed })}>{project.handwriting.fixed ? <Lock /> : <Save />}{project.handwriting.fixed ? "已固定" : "固定笔迹"}</Button></div>
        <Collapsible open={advanced} onOpenChange={setAdvanced} className="mt-5 border-t border-slate-100 pt-4"><CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-semibold">自然度高级设置 <ChevronDown className={`size-4 transition ${advanced ? "rotate-180" : ""}`} /></CollapsibleTrigger><CollapsibleContent className="space-y-4 pt-3">{([
          ["characterOffsetX", "字符水平偏移", 4, "px"], ["characterOffsetY", "字符垂直偏移", 4, "px"], ["characterRotation", "旋转波动", 4, "°"], ["characterBaselineOffset", "基线波动", 4, "px"],
        ] as const).map(([key, label, max, unit]) => <RangeRow disabled={project.handwriting.fixed} key={key} label={label} value={project.handwriting.randomization[key]} display={`${project.handwriting.randomization[key].toFixed(1)} ${unit}`} min={0} max={max} step={0.1} onChange={(value) => updateRandomization(key, value)} />)}{([
          ["characterFontSizeVariation", "字号波动", 8], ["characterScaleX", "宽度波动", 8], ["characterScaleY", "高度波动", 8], ["characterOpacityVariation", "深浅波动", 12],
        ] as const).map(([key, label, max]) => <RangeRow disabled={project.handwriting.fixed} key={key} label={label} value={project.handwriting.randomization[key] * 100} display={`${(project.handwriting.randomization[key] * 100).toFixed(1)}%`} min={0} max={max} step={0.1} onChange={(value) => updateRandomization(key, value / 100)} />)}</CollapsibleContent></Collapsible>
        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold">导出设置</h3><div className="grid grid-cols-3 gap-1">{([150, 300, 600] as const).map((dpi) => <Button key={dpi} size="sm" variant={project.exportSettings.dpi === dpi ? "default" : "outline"} onClick={() => change((state) => ({ ...state, exportSettings: { ...state.exportSettings, dpi } }))}>{dpi} DPI</Button>)}</div><div className="grid grid-cols-3 gap-1">{(["png", "jpg", "pdf"] as const).map((format) => <Button key={format} size="sm" variant={project.exportSettings.format === format ? "default" : "outline"} onClick={() => change((state) => ({ ...state, exportSettings: { ...state.exportSettings, format } }))}>{format.toUpperCase()}</Button>)}</div>{project.exportSettings.format === "jpg" && <RangeRow label="JPG 质量" value={Math.round(project.exportSettings.jpgQuality * 100)} display={`${Math.round(project.exportSettings.jpgQuality * 100)}%`} min={40} max={100} onChange={(quality) => change((state) => ({ ...state, exportSettings: { ...state.exportSettings, jpgQuality: quality / 100 } }))} />}<p className="text-xs leading-5 text-slate-400">{exportStatus || `默认 300 DPI：${A4_PIXELS[300].width}×${A4_PIXELS[300].height}`}</p></div>
      </> : <p className="text-sm text-slate-400">暂无可编辑行</p>}</aside>
    </div>
  </main>;
}
