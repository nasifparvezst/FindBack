"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, X } from "lucide-react";
import { useApp } from "@/context/app-context";
import { EmptyState, InfoNote, PageHeading, StatusTag } from "@/components/ui";
import { ClaimChat } from "@/components/claim-chat";
import { formatDate } from "@/lib/format";

export default function ClaimRoom() {
  const { id } = useParams<{ id: string }>();
  const { db, user, isAdmin, updateClaim, confirmHandover, manageClaim } = useApp();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<"cancel" | "dispute" | null>(null);
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState<"resume" | "resolve_cancel">("resume");
  const claim = db.claims.find((entry) => entry.id === id);
  const report = db.reports.find((entry) => entry.id === claim?.reportId);
  if (!claim || !report || !user || !(user.id === claim.claimantId || user.id === report.ownerId || isAdmin)) {
    return <section className="page-section container"><EmptyState title="Conversation not available" description="You may not have access to this claim, or it has been removed." actionHref="/my-reports" /></section>;
  }
  const owner = db.users.find((entry) => entry.id === report.ownerId);
  const claimant = db.users.find((entry) => entry.id === claim.claimantId);
  const isOwner = user.id === report.ownerId;
  const participant = isOwner || user.id === claim.claimantId;
  const moderationPaused = db.reports.some((entry) => entry.hidden && [claim.reportId, claim.relatedReportId].includes(entry.id));
  const confirmed = isOwner ? claim.ownerConfirmedAt : claim.claimantConfirmedAt;
  // A Lost report owner receives the item; a Found report owner hands it over.
  const ownerAction = report.type === "found" ? "I handed over the item" : "I received the item";
  const claimantAction = report.type === "found" ? "I received the item" : "I handed over the item";
  const ownAction = isOwner ? ownerAction : claimantAction;
  const canReview = (isOwner || isAdmin) && claim.status === "pending";
  const canCancel = participant && !claim.ownerConfirmedAt && !claim.claimantConfirmedAt &&
    (claim.status === "approved" || (claim.status === "pending" && user.id === claim.claimantId));
  const run = async (operation: () => void | Promise<void>, feedback: string) => {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try { await operation(); setSuccess(feedback); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update claim."); }
    finally { setBusy(false); }
  };
  const review = (decision: "approved" | "rejected") => {
    if (decision === "rejected" && !window.confirm("Reject this claim request?")) return;
    void run(() => updateClaim(claim.id, decision), `Claim ${decision}.`);
  };
  const onIssue = (event: FormEvent) => {
    event.preventDefault();
    if (!issue) return;
    void run(async () => { await manageClaim(claim.id, issue, reason); setIssue(null); setReason(""); }, "Claim updated; both parties have been notified.");
  };
  const onResolve = (event: FormEvent) => {
    event.preventDefault();
    if (!window.confirm(resolution === "resume" ? "Resume and require fresh confirmations from both parties?" : "Cancel this disputed claim? The reports will remain open.")) return;
    void run(async () => { await manageClaim(claim.id, resolution, reason); setReason(""); }, "Dispute resolution recorded in the Admin audit log.");
  };
  const step = (label: string, timestamp?: string, recorded = false) => <li className={timestamp || recorded ? "done" : ""}><strong>{label}</strong><small>{timestamp ? new Date(timestamp).toLocaleString() : recorded ? "Previously recorded" : "Waiting"}</small></li>;
  return (
    <section className="page-section container">
      <Link href="/my-reports" className="back-link"><ArrowLeft size={16} /> Back to claims</Link>
      <PageHeading eyebrow="Ownership verification" title={`Claim: ${report.title}`} description={`Opened ${formatDate(claim.createdAt)}. Verify ownership privately, then both parties confirm the physical handover.`} aside={<StatusTag status={claim.status} />} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {success && <div className="info-note" role="status">{success}</div>}
      {moderationPaused && <InfoNote>A report in this claim is hidden by Admin. Approval and handover are paused until restored; private chat and dispute resolution remain available.</InfoNote>}
      <div className="chat-layout">
        <ClaimChat claim={claim} userId={user.id} />
        <aside className="panel claim-summary">
          <h2>Claim details</h2>
          <div className="info-row"><span className="key">Reported item</span><Link href={`/item/${report.id}`} className="text-link">{report.title}</Link></div>
          <div className="info-row"><span className="key">Report owner</span><span>{owner?.name}</span></div>
          <div className="info-row"><span className="key">Claimant</span><span>{claimant?.name}</span></div>
          <h3>Claim progress</h3>
          <ol className="claim-timeline">
            {step("Submitted", claim.createdAt)}
            {step(claim.status === "rejected" ? "Rejected" : "Approved", claim.reviewedAt, ["approved", "disputed", "completed", "rejected"].includes(claim.status))}
            {step(`Owner: ${ownerAction}`, claim.ownerConfirmedAt)}
            {step(`Claimant: ${claimantAction}`, claim.claimantConfirmedAt)}
            {step("Completed", claim.completedAt, claim.status === "completed")}
          </ol>
          {claim.disputedAt && <p><strong>Dispute raised:</strong> {new Date(claim.disputedAt).toLocaleString()}</p>}
          {claim.issueReason && <p><strong>Issue:</strong> {claim.issueReason}</p>}
          {claim.cancelledAt && <p><strong>Cancelled:</strong> {new Date(claim.cancelledAt).toLocaleString()}</p>}
          {claim.resolutionReason && <p><strong>Admin resolution:</strong> {claim.resolutionReason}</p>}
          {canReview && <div className="claim-controls"><InfoNote>Only approve after checking non-sensitive identifying details.</InfoNote><button disabled={busy || moderationPaused} className="btn btn-primary btn-wide" onClick={() => review("approved")}><Check size={16} /> Approve claim</button><button disabled={busy} className="btn btn-danger btn-wide" onClick={() => review("rejected")}><X size={16} /> Reject claim</button></div>}
          {claim.status === "approved" && <div className="claim-controls"><InfoNote>Both parties must confirm. One confirmation alone keeps the item Open.</InfoNote>{participant ? confirmed ? <p role="status">Your confirmation is recorded. Waiting for the other person.</p> : <button disabled={busy} className="btn btn-primary btn-wide" onClick={() => { if (window.confirm(`${ownAction}. Confirm only after the physical handover?`)) void run(() => confirmHandover(claim.id), "Your confirmation was saved. Both confirmations are required for completion."); }}>{ownAction}</button> : <p>Only the owner and claimant can confirm; Admin cannot confirm on their behalf.</p>}</div>}
          {claim.status === "disputed" && <InfoNote>Handover is paused while an Admin reviews the dispute. You can continue the private conversation.</InfoNote>}
          {(canCancel || (participant && claim.status === "approved")) && <div className="claim-controls">{canCancel && <button disabled={busy} className="btn btn-outline btn-sm" onClick={() => { setIssue("cancel"); setReason(""); }}>Cancel claim</button>}{participant && claim.status === "approved" && <button disabled={busy} className="btn btn-outline btn-sm" onClick={() => { setIssue("dispute"); setReason(""); }}>Raise a dispute</button>}</div>}
          {issue && <form className="claim-controls" onSubmit={onIssue}><label htmlFor="claim-reason">Reason to {issue} (10–1000 characters)</label><textarea id="claim-reason" required minLength={10} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /><button disabled={busy} className="btn btn-danger btn-sm" type="submit">Submit {issue}</button><button className="btn btn-light btn-sm" type="button" onClick={() => setIssue(null)}>Back</button></form>}
          {isAdmin && claim.status === "disputed" && <form className="claim-controls" onSubmit={onResolve}><h3>Resolve dispute</h3><label htmlFor="resolution">Resolution</label><select id="resolution" value={resolution} onChange={(event) => setResolution(event.target.value as typeof resolution)}><option value="resume">Resume with fresh confirmations</option><option value="resolve_cancel">Cancel disputed claim</option></select><label htmlFor="resolution-reason">Required reason (10–1000 characters)</label><textarea id="resolution-reason" required minLength={10} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /><small>This action notifies both parties and records an Admin audit entry.</small><button disabled={busy} className="btn btn-primary btn-wide" type="submit">Record resolution</button></form>}
          <div className="claim-controls"><InfoNote>Meet in a safe campus area. Never send passwords, PINs, full ID numbers or sensitive documents.</InfoNote></div>
        </aside>
      </div>
    </section>
  );
}
