import assert from "node:assert/strict";
import test from "node:test";

import { apiFetch, resetApiSessionForTests } from "../lib/api/client.ts";

test("API client replaces an expired anonymous session and retries once", async () => {
  const values = new Map<string, string>([["handwrite-studio-session-v3", "stale-session"]]);
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const seenSessions: string[] = [];
  let refreshes = 0;

  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  } });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/session")) {
      refreshes += 1;
      return Response.json({ sessionId: "fresh-session" });
    }
    const session = new Headers(init?.headers).get("X-Session-ID") ?? "";
    seenSessions.push(session);
    return session === "fresh-session" ? Response.json([{ id: "font-1" }]) : new Response("expired", { status: 401 });
  };

  try {
    const response = await apiFetch("/api/fonts");
    assert.equal(response.status, 200);
    assert.equal(refreshes, 1);
    assert.deepEqual(seenSessions, ["stale-session", "fresh-session"]);
    assert.equal(values.get("handwrite-studio-session-v3"), "fresh-session");
  } finally {
    resetApiSessionForTests();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
