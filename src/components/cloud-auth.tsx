"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validEmail } from "@/lib/validation";
import { AuthFeedback } from "@/components/auth-feedback";

export function CloudLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const { error: authError } = await createSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      router.replace("/my-reports"); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed");
    } finally { setBusy(false); }
  };
  return <section className="auth-wrap"><div className="panel auth-panel">
    <span className="eyebrow">Verified campus access</span><h1>Welcome back.</h1>
    <p>Sign in with your confirmed university email to view reports, submit claims, and follow your recoveries.</p>
    <div className="alert-banner"><LockKeyhole size={18}/> Secure Supabase authentication. No demo passwords are accepted.</div>
    <Suspense fallback={null}><AuthFeedback /></Suspense>
    <form onSubmit={submit}>
      <div className="field"><label htmlFor="email">University email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="student@seu.edu.bd"/></div>
      <div className="field" style={{marginTop:15}}><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password"/></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="btn btn-primary btn-wide" style={{marginTop:22}} disabled={busy}>{busy ? "Signing in..." : "Sign in"} <ArrowRight size={17}/></button>
    </form>
    <div className="auth-bottom"><Link href="/forgot-password">Forgot password?</Link></div>
    <div className="auth-bottom">New to FindBack? <Link href="/register">Create an account</Link></div>
  </div></section>;
}

export function CloudRegister() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (name.trim().length < 2 || name.trim().length > 100) return setError("Enter a name between 2 and 100 characters");
    if (!validEmail(email)) return setError("A valid @seu.edu.bd email is required");
    if (password.length < 8) return setError("Use at least 8 characters for your password");
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    try {
      const { error: authError } = await createSupabaseBrowserClient().auth.signUp({
        email: email.trim().toLowerCase(), password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      if (authError) throw authError;
      setSuccess(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sign up failed"); }
    finally { setBusy(false); }
  };
  return <section className="auth-wrap"><div className="panel auth-panel">
    <span className="eyebrow">Join your campus community</span><h1>Create an account.</h1>
    <p>Only verified Southeast University email addresses are allowed. Admin access is assigned separately by a trusted administrator.</p>
    {success ? <div className="alert-banner" role="status"><CheckCircle2 size={22}/> Check your university inbox for a confirmation link. After verifying, return to <Link href="/login" className="text-link">Sign in</Link>.</div> : <form onSubmit={submit}>
      <div className="field"><label htmlFor="fullName">Full name</label><input id="fullName" required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Your full name"/></div>
      <div className="field" style={{marginTop:14}}><label htmlFor="registerEmail">University email</label><input id="registerEmail" required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="student@seu.edu.bd"/></div>
      <div className="field" style={{marginTop:14}}><label htmlFor="registerPassword">Password (8+ characters)</label><input id="registerPassword" required minLength={8} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></div>
      <div className="field" style={{marginTop:14}}><label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" required minLength={8} type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-wide" style={{marginTop:20}} disabled={busy}>{busy ? "Creating account..." : "Create account"} <UserPlus size={17}/></button>
    </form>}
    <div className="alert-banner" style={{marginTop:16}}><ShieldCheck size={18}/> Use a unique password. Do not upload photos of identity documents.</div>
    <div className="auth-bottom">Already registered? <Link href="/login">Sign in</Link></div>
  </div></section>;
}
