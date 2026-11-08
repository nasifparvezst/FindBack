"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DEMO_MODE } from "@/context/app-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const router = useRouter();
  if (DEMO_MODE) return <section className="auth-wrap"><div className="panel auth-panel"><h1>Demo mode</h1><Link href="/login">Back to sign-in</Link></div></section>;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: current } = await supabase.auth.getUser();
      if (!current.user) throw new Error("Reset link is invalid or expired. Request another link.");
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true); await supabase.auth.signOut(); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to reset password"); }
    finally { setBusy(false); }
  };
  return <section className="auth-wrap"><div className="panel auth-panel"><span className="eyebrow">Secure recovery</span><h1>Choose a new password.</h1>
    {done ? <div className="alert-banner" role="status">Password updated. <Link href="/login" className="text-link">Sign in again</Link>.</div> : <form onSubmit={submit}><div className="field"><label htmlFor="password">New password</label><input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}/></div><div className="field" style={{marginTop:14}}><label htmlFor="confirm">Confirm password</label><input id="confirm" type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)}/></div>{error&&<div className="form-error" role="alert">{error}</div>}<button disabled={busy} type="submit" className="btn btn-primary btn-wide" style={{marginTop:18}}>{busy ? "Saving..." : "Update password"}</button></form>}
  </div></section>;
}
