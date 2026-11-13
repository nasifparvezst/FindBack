"use client";

import { useEffect, useState } from "react";
import { useApp } from "./app-store";
import type { DataPage, DataQuery } from "@/lib/data-pages";
import { dataPageScope } from "@/lib/data-pages";

const empty = (): DataPage => ({ db: { users: [], reports: [], claims: [], messages: [], notifications: [], activity: [], reportFlags: [] }, ids: [], total: 0, page: 1, pageSize: 1, snapshot: "", stats: {} });

export function useDataPage(query: DataQuery, enabled = true) {
  const { queryPage, dataRevision, user, ready } = useApp();
  const key = JSON.stringify(query);
  const [retry, setRetry] = useState(0);
  const identity = `${user?.id || "anon"}:${key}:${dataRevision}:${retry}`;
  const scope = dataPageScope(query, user?.id);
  type Meta = Pick<DataPage, "total" | "pageSize">;
  const [state, setState] = useState<{ identity: string; scope: string; page?: DataPage; meta?: Meta; error?: string }>({ identity: "", scope: "" });
  useEffect(() => {
    if (!queryPage || !enabled || !ready) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const page = await queryPage(JSON.parse(key) as DataQuery, controller.signal);
        if (!controller.signal.aborted) setState({ identity, scope, page, meta: { total: page.total, pageSize: page.pageSize } });
      } catch (err) { if (!controller.signal.aborted) setState((previous) => ({ identity, scope, meta: previous.scope === scope ? previous.meta : undefined, error: err instanceof Error ? err.message : "Could not load this page." })); }
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [queryPage, key, identity, scope, ready, enabled]);
  if (!queryPage) return null;
  const current = enabled && state.identity === identity ? state : undefined;
  const meta = enabled && state.scope === scope ? state.meta : undefined;
  return { ...empty(), ...meta, page: query.page || 1, ...current?.page, loading: enabled && !current, error: current?.error || "", retry: () => setRetry((count) => count + 1) };
}
