"use client";

import { useEffect, useRef, useState } from "react";

import { Slider } from "@/components/ui/slider";

export function RafSlider({ value, min, max, step = 1, disabled, ariaLabel, onPreview, onCommit }: {
  value: number; min: number; max: number; step?: number; disabled?: boolean; ariaLabel?: string;
  onPreview?: (value: number) => void; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const frame = useRef(0);
  const pending = useRef(value);
  const dragging = useRef(false);

  useEffect(() => { if (!dragging.current) setDraft(value); }, [value]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const preview = (next: number) => {
    dragging.current = true;
    pending.current = next;
    setDraft(next);
    if (!onPreview || frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      onPreview(pending.current);
    });
  };
  const commit = (next: number) => {
    pending.current = next;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    onPreview?.(next);
    onCommit(next);
    dragging.current = false;
    setDraft(next);
  };

  return <Slider aria-label={ariaLabel} disabled={disabled} value={[draft]} min={min} max={max} step={step}
    onValueChange={(next) => preview(Number(next[0]))} onValueCommit={(next) => commit(Number(next[0]))} />;
}
