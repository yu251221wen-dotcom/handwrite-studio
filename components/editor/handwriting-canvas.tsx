"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";

import { apiAssetBlob } from "@/lib/api/client";
import { PAGE_HEIGHT, PAGE_WIDTH, renderPageBackground, renderTextLayer, type LineBounds, type RenderOptions } from "@/lib/handwriting/canvas-renderer";
import { ensureFontsReady } from "@/lib/handwriting/font-library";
import type { LineLayout } from "@/lib/handwriting/types";

interface Props {
  options: RenderOptions;
  onSelectLine: (id: string) => void;
  onChangeLines: (lines: LineLayout[], phase: "preview" | "commit") => void;
  zoom?: number;
  active?: boolean;
  onActivate?: () => void;
  onRenderError?: (message: string) => void;
}

export function HandwritingCanvas({ options, onSelectLine, onChangeLines, zoom = 0.82, active = false, onActivate, onRenderError }: Props) {
  const backgroundRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLCanvasElement>(null);
  const boundsRef = useRef<LineBounds[]>([]);
  const dragRef = useRef<{ id: string; x: number; y: number; startX: number; startY: number } | null>(null);
  const [imageResource, setImageResource] = useState<{ url: string; image: HTMLImageElement }>();
  const [renderError, setRenderError] = useState("");
  const ratio = 2;

  useEffect(() => {
    if (options.background.kind !== "uploaded" || !options.background.fileUrl) return;
    const url = options.background.fileUrl;
    let cancelled = false;
    let objectUrl = "";
    const next = new Image();
    next.onload = () => { if (!cancelled) setImageResource({ url, image: next }); };
    next.onerror = () => onRenderError?.(`背景 ${options.background.name} 加载失败`);
    void apiAssetBlob(url).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      next.src = objectUrl;
    }).catch((error) => onRenderError?.(error instanceof Error ? error.message : `背景 ${options.background.name} 加载失败`));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [options.background, onRenderError]);

  const image = options.background.kind === "uploaded" && imageResource && options.background.fileUrl === imageResource.url ? imageResource.image : undefined;
  const renderOptions = useMemo(() => ({ ...options, backgroundImage: image }), [options, image]);

  useEffect(() => {
    const canvas = backgroundRef.current;
    if (!canvas) return;
    let cancelled = false;
    void ensureFontsReady([renderOptions.font]).then(() => {
      if (cancelled) return;
      canvas.width = PAGE_WIDTH * ratio; canvas.height = PAGE_HEIGHT * ratio;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderPageBackground(context, renderOptions);
      setRenderError("");
    }).catch((error) => {
      const message = error instanceof Error ? error.message : "字体加载失败";
      setRenderError(message); onRenderError?.(message);
    });
    return () => { cancelled = true; };
    // Background is deliberately independent from line edits and character naturality.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderOptions.background, renderOptions.page.backgroundAdjustments, renderOptions.page.backgroundTransform, renderOptions.page.lineDetection, renderOptions.showLineGuides, renderOptions.font, renderOptions.handwriting.inkColor, image, onRenderError]);

  useEffect(() => {
    const canvas = textRef.current;
    if (!canvas) return;
    let cancelled = false;
    let frame = 0;
    const pageFonts = renderOptions.page.lines.map((line) => renderOptions.fonts?.find((font) => font.id === line.fontId) ?? renderOptions.font);
    void ensureFontsReady(pageFonts).then(() => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        try {
          canvas.width = PAGE_WIDTH * ratio; canvas.height = PAGE_HEIGHT * ratio;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
          boundsRef.current = renderTextLayer(context, { ...renderOptions, showSelection: true });
          setRenderError("");
        } catch (error) {
          const message = error instanceof Error ? error.message : "画布绘制失败";
          setRenderError(message); onRenderError?.(message);
        }
      });
    }).catch((error) => {
      const message = error instanceof Error ? error.message : "字体加载失败";
      setRenderError(message); onRenderError?.(message);
    });
    return () => { cancelled = true; if (frame) cancelAnimationFrame(frame); };
  }, [renderOptions, onRenderError]);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * PAGE_WIDTH / rect.width, y: (event.clientY - rect.top) * PAGE_HEIGHT / rect.height };
  };

  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    onActivate?.();
    const current = point(event);
    const hit = [...boundsRef.current].reverse().find((box) => current.x >= box.x && current.x <= box.x + box.width && current.y >= box.y && current.y <= box.y + box.height);
    if (!hit) return;
    const line = options.page.lines.find((item) => item.id === hit.id);
    if (!line) return;
    onSelectLine(line.id);
    if (line.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: line.id, x: current.x, y: current.y, startX: line.manualOffsetX, startY: line.manualOffsetY };
  };

  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const current = point(event);
    onChangeLines(options.page.lines.map((line) => line.id === drag.id ? { ...line,
      manualOffsetX: Math.max(-80, Math.min(400, drag.startX + current.x - drag.x)),
      manualOffsetY: Math.max(-160, Math.min(500, drag.startY + current.y - drag.y)) } : line), "preview");
  };

  const pointerUp = () => {
    if (dragRef.current) onChangeLines(options.page.lines, "commit");
    dragRef.current = null;
  };

  return (
    <div className={`paper-canvas relative shrink-0 overflow-hidden bg-white shadow-[0_12px_44px_rgb(27_50_56/16%)] ${active ? "ring-2 ring-[#287e86] ring-offset-4" : ""}`} style={{ width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }}>
      <canvas ref={backgroundRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <canvas ref={textRef} className="absolute inset-0 h-full w-full touch-none" aria-label={`A4 手写文档画布，第 ${options.page.pageIndex + 1} 页`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />
      {renderError && <div role="alert" className="absolute inset-x-4 top-4 rounded-lg bg-rose-50/95 p-3 text-xs text-rose-700 shadow">{renderError}</div>}
    </div>
  );
}
