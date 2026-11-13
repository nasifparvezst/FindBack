"use client";

import { useEffect, useRef } from "react";

export function DataPageStatus({ page }: { page: { loading: boolean; error: string; retry: () => void } | null }) {
  const feedback = useRef<HTMLDivElement>(null);
  const retried = useRef(false);
  useEffect(() => {
    if (page && !page.loading && !page.error && retried.current) {
      retried.current = false;
      feedback.current?.focus({ preventScroll: true });
    }
  }, [page?.loading, page?.error, page]);
  if (!page) return null;
  return <div ref={feedback} tabIndex={-1} className={`data-page-status ${page.error ? "form-error" : page.loading ? "result-summary" : "sr-only"}`} role={page.error ? "alert" : "status"} aria-live={page.error ? "assertive" : "polite"} aria-atomic="true">
    {page.error ? <>{page.error} <button type="button" className="text-link" aria-label="Retry loading results" onClick={() => { retried.current = true; page.retry(); }}>Retry</button></> : page.loading ? "Loading results..." : "Results loaded."}
  </div>;
}
