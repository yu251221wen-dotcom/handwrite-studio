export interface HistoryState<T> { past: T[]; present: T; future: T[]; limit: number }

export function createHistory<T>(present: T, limit = 75): HistoryState<T> { return { past: [], present, future: [], limit }; }
export function commitHistory<T>(history: HistoryState<T>, next: T): HistoryState<T> {
  if (Object.is(history.present, next)) return history;
  return { ...history, past: [...history.past, history.present].slice(-history.limit), present: next, future: [] };
}
export function replacePresent<T>(history: HistoryState<T>, next: T): HistoryState<T> { return { ...history, present: next }; }
export function commitGesture<T>(history: HistoryState<T>, before: T, after: T): HistoryState<T> {
  if (Object.is(before, after)) return history;
  return { ...history, past: [...history.past, before].slice(-history.limit), present: after, future: [] };
}
export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const previous = history.past.at(-1); if (!previous) return history;
  return { ...history, past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}
export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const next = history.future[0]; if (!next) return history;
  return { ...history, past: [...history.past, history.present].slice(-history.limit), present: next, future: history.future.slice(1) };
}
