"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { DEMO_MODE } from "@/context/app-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validEmail } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  if (DEMO_MODE) return <section className="auth-wrap"><div className="panel auth-panel"><h1>Demo mode</h1><p>Demo accounts do not use passwords.</p><Link href="/login" className="text-link">Back to demo sign-in</Link></div></section>;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    if (!validEmail(email)) return setError("Use your @seu.edu.bd email address");
    setBusy(true);
    try {
      const { error: err } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (err) throw err;
      setSent(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to send reset email"); }
    finally { setBusy(false); }
  };
  return <section className="auth-wrap"><div className="panel auth-panel"><span className="eyebrow">Account recovery</span><h1>Reset your password.</h1><p>Enter your verified campus email address. We will send a password reset link if an account exists.</p>
    {sent ? <div className="alert-banner" role="status">If this email is registered, a reset link has been sent. Check your inbox and spam folder.</div> : <form onSubmit={submit}><div className="field"><label htmlFor="email">University email</label><input id="email" required type="email" value={email} onChange={e => setEmail(e.target.value)}/></div>{error&&<div className="form-error" role="alert">{error}</div>}<button type="submit" disabled={busy} className="btn btn-primary btn-wide" style={{marginTop:18}}>{busy ? "Sending..." : "Send reset link"}</button></form>}
    <div className="auth-bottom"><Link href="/login">Back to sign in</Link></div>
  </div></section>;
}
