export class ExportCancelledError extends Error {
  constructor() { super("导出已取消"); this.name = "ExportCancelledError"; }
}

export interface ExportProgress {
  current: number; total: number; percent: number; elapsedMs: number; pageElapsedMs: number;
}

export interface StreamPageOptions<T> {
  total: number;
  signal?: AbortSignal;
  render: (index: number) => Promise<T>;
  consume: (value: T, index: number) => Promise<void>;
  release?: (value: T, index: number) => void | Promise<void>;
  onProgress?: (progress: ExportProgress) => void;
  yieldToMain?: () => Promise<void>;
}

export async function yieldToMainThread(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export async function streamPages<T>(options: StreamPageOptions<T>): Promise<void> {
  const started = performance.now();
  for (let index = 0; index < options.total; index += 1) {
    if (options.signal?.aborted) throw new ExportCancelledError();
    const pageStarted = performance.now();
    const value = await options.render(index);
    try {
      if (options.signal?.aborted) throw new ExportCancelledError();
      await options.consume(value, index);
    } finally {
      await options.release?.(value, index);
    }
    options.onProgress?.({
      current: index + 1, total: options.total,
      percent: Math.round((index + 1) / Math.max(1, options.total) * 100),
      elapsedMs: performance.now() - started, pageElapsedMs: performance.now() - pageStarted,
    });
    await (options.yieldToMain ?? yieldToMainThread)();
  }
}

