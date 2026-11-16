"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { DEMO_MODE, useApp } from "@/context/app-context";
import { EmptyState, PageHeading, TableRegion } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { ADMIN_LIMIT, type AdminList, type ManagedAdmin } from "@/lib/admin-accounts";

export function AdminAccountManager() {
  const { user, isAdmin, ready, refreshSession } = useApp();
  const [list, setList] = useState<AdminList | null>(null);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const [removing, setRemoving] = useState<ManagedAdmin | null>(null);
  const controller = useRef<AbortController | null>(null);
  const request = useCallback(async (method = "GET", body?: unknown) => {
    const signal = controller.current?.signal;
    const response = await fetch("/api/admin/accounts", { method, cache: "no-store", credentials: "same-origin", signal,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const result = await response.json(); signal?.throwIfAborted();
    if (!response.ok) throw new Error(result.error || "Admin account management is unavailable.");
    return result;
  }, []);
  const load = useCallback(async () => {
    const signal = controller.current?.signal;
    setLoading(true);
    try { const result: AdminList = await request(); setList(result); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [request]);
  useEffect(() => {
    const active = new AbortController(); controller.current = active;
    const timer = setTimeout(() => {
      setList(null); setPassword(""); setBusy(false); setRemoving(null); setError(""); setSuccess("");
      if (!isAdmin || DEMO_MODE) return;
      void load().catch(error => { if (!active.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load Admins."); });
    }, 0);
    return () => { clearTimeout(timer); active.abort(); };
  }, [user?.id, isAdmin, load]);
  if (!ready) return <section className="page-section container" aria-busy="true">Loading account...</section>;
  if (!isAdmin || !user) return <section className="page-section container"><EmptyState title="Administrator access required" description="Sign in with an active Admin account to manage Admin access." actionHref="/login" actionText="Sign in"/></section>;
  const create = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    const signal = controller.current?.signal;
    setBusy(true); setError(""); setSuccess("");
    try {
      await request("POST", { name, email, password });
      setName(""); setEmail(""); await load(); await refreshSession?.(); signal?.throwIfAborted();
      setSuccess("Admin created. They can sign in immediately using the email and password you assigned.");
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "Unable to create Admin."); }
    finally { if (!signal?.aborted) { setPassword(""); setBusy(false); } }
  };
  const remove = async () => {
    if (!removing || busy) return;
    const signal = controller.current?.signal;
    setBusy(true); setError(""); setSuccess("");
    try {
      await request("DELETE", { id: removing.id }); setRemoving(null);
      // Refresh the current role immediately, including when removing yourself.
      await refreshSession?.(); signal?.throwIfAborted();
      if (removing.id !== user.id) await load();
      setSuccess("Admin access removed. The account and its existing reports have been kept.");
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "Unable to remove Admin."); }
    finally { if (!signal?.aborted) setBusy(false); }
  };
  return <section className="page-section container">
    <PageHeading eyebrow="Campus management" title="Admin accounts" description="Up to five Admins have the same permissions. Any active Admin can create or remove another Admin." aside={<Link href="/admin" className="btn btn-outline">Back to dashboard</Link>}/>
    {DEMO_MODE ? <div className="alert-banner">Admin account creation is available in Cloud mode. Demo accounts do not create real sign-ins.</div> : <>
      <div className="panel admin-account-module">
        <h2>Current Admins <span className="admin-account-count">{list?.admins.length ?? "—"} / {ADMIN_LIMIT}</span></h2>
        <p>Removing an Admin removes their Admin role. Student access requires a verified @seu.edu.bd email. Keep at least one active Admin.</p>
        {loading && <p role="status">Loading Admins...</p>}
        {list && <TableRegion label="Admin accounts" busy={loading || busy}><table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Action</th></tr></thead><tbody>{list.admins.map(admin => <tr key={admin.id}><td>{admin.name}{admin.id === user.id && " (you)"}</td><td>{admin.email}</td><td>{admin.suspended ? "Suspended" : "Active"}</td><td><button type="button" className="btn btn-outline btn-sm" disabled={busy || loading || list.admins.length <= 1} onClick={() => { setRemoving(admin); setError(""); setSuccess(""); }}>Remove Admin</button></td></tr>)}</tbody></table></TableRegion>}
        {!list && !loading && <button className="btn btn-outline" type="button" onClick={() => { setError(""); void load().catch(error => setError(error.message)); }}>Retry loading</button>}
        {removing && <div className="alert-banner" role="group" aria-label="Confirm removing Admin"><div><p>Remove Admin access for <strong>{removing.email}</strong>? Their account and reports will remain.</p><button className="btn btn-outline" type="button" disabled={busy} onClick={() => setRemoving(null)}>Keep Admin</button>{" "}<button className="btn btn-primary" type="button" disabled={busy} onClick={() => { void remove(); }}>{busy ? "Removing..." : "Confirm removal"}</button></div></div>}
      </div>
      <div className="panel admin-account-module"><h2>Create an Admin</h2>
        {list && list.admins.length >= ADMIN_LIMIT && <p role="status">All five Admin slots are full. Remove an Admin before creating another.</p>}
        <form className="admin-account-form" onSubmit={create}>
          <div className="field"><label htmlFor="adminName">Name</label><input id="adminName" required minLength={2} maxLength={100} autoComplete="off" value={name} onChange={e => setName(e.target.value)} disabled={busy}/></div>
          <div className="field"><label htmlFor="adminEmail">Email</label><input id="adminEmail" required type="email" maxLength={254} autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></div>
          <div className="field"><label htmlFor="adminPassword">Password (12+ characters)</label><PasswordInput id="adminPassword" visibilityLabel="new Admin password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></div>
          <p>Use a new email address. This creates a confirmed password account; existing accounts and their passwords cannot be replaced here.</p>
          <button type="submit" className="btn btn-primary" disabled={busy || loading || !list || list.admins.length >= ADMIN_LIMIT}>{busy ? "Saving..." : "Create Admin"}</button>
        </form>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {success && <div className="alert-banner" role="status">{success}</div>}
    </>}
  </section>;
}
