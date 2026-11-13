"use client";

import { useRef, useState, type FormEvent } from "react";
import { useApp } from "@/context/app-context";

export function ReportFlagForm({ reportId }: { reportId: string }) {
  const { user, db, flagReport } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const existing = (db.reportFlags || []).some((flag) => flag.reportId === reportId && flag.reporterId === user?.id && flag.status === "open");
  if (existing) return <p ref={feedback} tabIndex={-1} className="privacy-note" role="status">Your flag is awaiting Admin review.</p>;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { await flagReport(reportId, reason); setOpen(false); setReason(""); requestAnimationFrame(() => feedback.current?.focus({ preventScroll: true })); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not submit flag."); }
    finally { setBusy(false); }
  };
  return <div className="report-flag-form"><button className="text-link" type="button" disabled={busy} aria-expanded={open} aria-controls={open ? "report-flag-panel" : undefined} onClick={() => { setOpen(!open); if (!open) requestAnimationFrame(() => input.current?.focus()); }}>Flag this report</button>
    {open && <form id="report-flag-panel" aria-busy={busy || undefined} onSubmit={(event) => { void submit(event); }}><label htmlFor="report-flag-reason">Why should Admin review this report?</label><p id="report-flag-hint">Your reason is visible to Admins. Avoid private identity or contact details.</p><textarea ref={input} id="report-flag-reason" aria-describedby="report-flag-hint" required minLength={10} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /><button className="btn btn-outline btn-sm" disabled={busy} type="submit">{busy ? "Submitting..." : "Submit flag"}</button></form>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </div>;
}
