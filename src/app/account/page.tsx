"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DEMO_MODE, useApp } from "@/context/app-context";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ShieldCheck, LogOut } from "lucide-react";

export default function AccountPage() {
  const {user, isAdmin} = useApp();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (DEMO_MODE) return <section className="auth-wrap"><div className="panel auth-panel"><h1>Demo account</h1><p>Switch or reset your demo account from the sign-in page.</p><Link className="btn btn-primary" href="/login">Demo accounts</Link></div></section>;
  const logout = async () => {
    setBusy(true); setError("");
    try {
      const { error: err } = await createSupabaseBrowserClient().auth.signOut();
      if (err) throw err;
      router.replace("/login"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Sign out failed"); }
    finally { setBusy(false); }
  };
  return <section className="auth-wrap"><div className="panel auth-panel"><span className="eyebrow">Your account</span><h1>{user ? user.name : "Not signed in"}</h1>
    {user ? <><div className="alert-banner"><ShieldCheck size={18}/> University account authenticated · {isAdmin ? "Administrator" : "Student"}</div><p>Email: <strong>{user.email}</strong></p><button type="button" onClick={logout} className="btn btn-outline btn-wide" disabled={busy}><LogOut size={17}/>{busy ? "Signing out..." : "Sign out"}</button></> : <Link href="/login" className="btn btn-primary btn-wide">Sign in</Link>}
    {error&&<div className="form-error" role="alert">{error}</div>}
  </div></section>;
}
