"use client";

import { useEffect, useState } from "react";
import { useApp } from "./app-store";
import type { DataPage, DataQuery } from "@/lib/data-pages";

const empty = (): DataPage => ({ db: { users: [], reports: [], claims: [], messages: [], notifications: [], activity: [], reportFlags: [] }, ids: [], total: 0, page: 1, pageSize: 1, snapshot: "", stats: {} });

export function useDataPage(query: DataQuery, enabled = true) {
  const { queryPage, dataRevision, user, ready } = useApp();
  const key = JSON.stringify(query);
  const identity = `${user?.id || "anon"}:${key}:${dataRevision}`;
  const [state, setState] = useState<{ identity: string; page?: DataPage; error?: string }>({ identity: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!queryPage || !enabled || !ready) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const page = await queryPage(JSON.parse(key) as DataQuery, controller.signal);
        if (!controller.signal.aborted) setState({ identity, page });
      } catch (err) { if (!controller.signal.aborted) setState({ identity, error: err instanceof Error ? err.message : "Could not load this page." }); }
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [queryPage, key, identity, ready, enabled, retry]);
  if (!queryPage) return null;
  const current = state.identity === identity ? state : undefined;
  return { ...(current?.page || empty()), loading: enabled && !current, error: current?.error || "", retry: () => setRetry((count) => count + 1) };
}
