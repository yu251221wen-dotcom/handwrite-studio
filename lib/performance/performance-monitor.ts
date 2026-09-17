export type RenderLayer = "background" | "text" | "correction" | "overlay";
export type LayoutPhase = "wrap" | "pagination" | "slot-assignment";

interface TimingStat {
  count: number;
  totalMs: number;
  lastMs: number;
  maxMs: number;
}

export interface PerformanceSnapshot {
  render: Record<RenderLayer, TimingStat>;
  layout: Record<LayoutPhase, TimingStat>;
  layoutRecomputeCount: number;
  componentRenders: Record<string, number>;
  interactions: Record<string, number>;
}

const emptyStat = (): TimingStat => ({ count: 0, totalMs: 0, lastMs: 0, maxMs: 0 });
const snapshot: PerformanceSnapshot = {
  render: { background: emptyStat(), text: emptyStat(), correction: emptyStat(), overlay: emptyStat() },
  layout: { wrap: emptyStat(), pagination: emptyStat(), "slot-assignment": emptyStat() },
  layoutRecomputeCount: 0,
  componentRenders: {},
  interactions: {},
};

function exposeBrowserMonitor() {
  if (typeof window !== "undefined" && !window.__HANDWRITE_PERFORMANCE__) {
    window.__HANDWRITE_PERFORMANCE__ = { snapshot: getPerformanceSnapshot, reset: resetPerformanceSnapshot };
  }
}

function syncDevelopmentSnapshot() {
  if (process.env.NODE_ENV === "development" && typeof document !== "undefined") {
    document.documentElement.dataset.handwritePerformance = JSON.stringify(snapshot);
  }
}

export function monotonicNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function addTiming(stat: TimingStat, durationMs: number) {
  const safe = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  stat.count += 1;
  stat.totalMs += safe;
  stat.lastMs = safe;
  stat.maxMs = Math.max(stat.maxMs, safe);
}

export function recordRenderTiming(layer: RenderLayer, durationMs: number) {
  exposeBrowserMonitor();
  addTiming(snapshot.render[layer], durationMs);
  syncDevelopmentSnapshot();
}

export function recordLayoutTiming(phase: LayoutPhase, durationMs: number) {
  exposeBrowserMonitor();
  addTiming(snapshot.layout[phase], durationMs);
  syncDevelopmentSnapshot();
}

export function recordLayoutRecompute() {
  exposeBrowserMonitor();
  snapshot.layoutRecomputeCount += 1;
  syncDevelopmentSnapshot();
}

export function recordInteraction(name: string) {
  exposeBrowserMonitor();
  snapshot.interactions[name] = (snapshot.interactions[name] ?? 0) + 1;
  syncDevelopmentSnapshot();
}

export function recordComponentRender(name: string) {
  exposeBrowserMonitor();
  snapshot.componentRenders[name] = (snapshot.componentRenders[name] ?? 0) + 1;
  syncDevelopmentSnapshot();
}

export function getPerformanceSnapshot(): PerformanceSnapshot {
  return structuredClone(snapshot);
}

export function resetPerformanceSnapshot() {
  for (const stat of Object.values(snapshot.render)) Object.assign(stat, emptyStat());
  for (const stat of Object.values(snapshot.layout)) Object.assign(stat, emptyStat());
  snapshot.layoutRecomputeCount = 0;
  snapshot.componentRenders = {};
  snapshot.interactions = {};
  syncDevelopmentSnapshot();
}

declare global {
  interface Window {
    __HANDWRITE_PERFORMANCE__?: { snapshot: typeof getPerformanceSnapshot; reset: typeof resetPerformanceSnapshot };
  }
}

if (typeof window !== "undefined") {
  exposeBrowserMonitor();
}
