"use client";

import { useState, type FormEvent } from "react";
import { useApp } from "@/context/app-context";

export function ReportFlagForm({ reportId }: { reportId: string }) {
  const { user, db, flagReport } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const existing = (db.reportFlags || []).some((flag) => flag.reportId === reportId && flag.reporterId === user?.id && flag.status === "open");
  if (existing) return <p className="privacy-note" role="status">Your flag is awaiting Admin review.</p>;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { await flagReport(reportId, reason); setOpen(false); setReason(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not submit flag."); }
    finally { setBusy(false); }
  };
  return <div className="report-flag-form"><button className="text-link" type="button" disabled={busy} onClick={() => setOpen(!open)}>Flag this report</button>
    {open && <form onSubmit={(event) => { void submit(event); }}><label htmlFor="report-flag-reason">Why should Admin review this report?</label><p>Your reason is visible to Admins. Avoid private identity or contact details.</p><textarea id="report-flag-reason" required minLength={10} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /><button className="btn btn-outline btn-sm" disabled={busy} type="submit">{busy ? "Submitting..." : "Submit flag"}</button></form>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </div>;
}
