"use client";

export function DataPageStatus({ page }: { page: { loading: boolean; error: string; retry: () => void } | null }) {
  if (!page) return null;
  if (page.error) return <div className="form-error" role="alert">{page.error} <button type="button" className="text-link" onClick={page.retry}>Retry</button></div>;
  return page.loading ? <p className="result-summary" role="status">Loading results...</p> : null;
}
