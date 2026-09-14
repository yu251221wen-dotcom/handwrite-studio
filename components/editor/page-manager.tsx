"use client";

import { ArrowDown, ArrowUp, Copy, FilePlus2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PageState } from "@/lib/handwriting/types";

export function PageManager({ pages, currentPageId, onSelect, onAdd, onDuplicate, onMove, onDelete }: {
  pages: PageState[]; currentPageId: string; onSelect: (pageId: string) => void;
  onAdd: () => void; onDuplicate: (pageId: string) => void;
  onMove: (pageId: string, targetIndex: number) => void; onDelete: (pageId: string) => void;
}) {
  return <section className="space-y-3">
    <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">页面管理</h2><p className="mt-1 text-xs text-slate-400">新增、复制、排序和安全删除</p></div><Button size="sm" variant="outline" onClick={onAdd}><FilePlus2 />空白页</Button></div>
    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{pages.map((page, index) => <div key={page.pageId} draggable onDragStart={(event) => event.dataTransfer.setData("text/page-id", page.pageId)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const pageId = event.dataTransfer.getData("text/page-id"); if (pageId) onMove(pageId, index); }} className={`rounded-xl border p-2 ${currentPageId === page.pageId ? "border-[#287e86] bg-[#eff9f8]" : "border-slate-200"}`}>
      <button className="w-full text-left" onClick={() => onSelect(page.pageId)}><span className="text-xs font-semibold">第 {index + 1} 页</span><span className="ml-2 text-[11px] text-slate-400">{page.pageType ?? (index ? "continuation" : "first")} · {page.lines.length} 行</span></button>
      <div className="mt-2 grid grid-cols-4 gap-1"><Button aria-label="上移" size="icon-sm" variant="ghost" disabled={!index} onClick={() => onMove(page.pageId, index - 1)}><ArrowUp /></Button><Button aria-label="下移" size="icon-sm" variant="ghost" disabled={index === pages.length - 1} onClick={() => onMove(page.pageId, index + 1)}><ArrowDown /></Button><Button aria-label="复制页" size="icon-sm" variant="ghost" onClick={() => onDuplicate(page.pageId)}><Copy /></Button><Button aria-label="删除页" size="icon-sm" variant="ghost" disabled={pages.length <= 1} onClick={() => onDelete(page.pageId)}><Trash2 /></Button></div>
    </div>)}</div>
  </section>;
}
