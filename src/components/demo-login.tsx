"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useApp } from "@/context/app-context";
import { AuthFeedback } from "@/components/auth-feedback";

export default function Login() {
  const {db,user,switchUser,resetDemo}=useApp();const [error,setError]=useState("");const router=useRouter();
  return <div className="auth-wrap"><div className="panel auth-panel"><span className="eyebrow">Your FindBack account</span><h1>Welcome back.</h1><p>Choose a sample user to explore workflows. This is <strong>not real authentication</strong>; verified university sign-in is available in Cloud mode.</p>
    <div className="alert-banner"><ShieldAlert size={18}/> Demo accounts have no passwords and do not verify identity. Do not use real personal information.</div>
    <Suspense fallback={null}><AuthFeedback /></Suspense>
    <div style={{fontWeight:800,fontSize:13,marginBottom:12}}>Select an account</div>
    {db.users.map((u)=><button key={u.id} type="button" disabled={u.suspended} className="demo-account" onClick={()=>{try{switchUser(u.id);router.push(u.role==="admin"?"/admin":"/my-reports");}catch(err){setError(err instanceof Error?err.message:"Could not select account.");}}}><span className="account-avatar">{u.name.split(" ").map((x)=>x[0]).slice(0,2).join("")}</span><span className="account-text"><strong>{u.name} {user?.id===u.id?"(Current)":""}</strong><small>{u.email} · {u.role}{u.suspended?" · suspended":""}</small></span><ArrowRight size={17}/></button>)}
    {error&&<div className="form-error" role="alert">{error}</div>}
    <button className="btn btn-outline btn-wide" style={{marginTop:8}} onClick={()=>{switchUser(null);router.push("/");}}>Browse as a guest</button>
    <button className="btn btn-ghost btn-wide" onClick={()=>{if(window.confirm("Reset all demo items, claims and messages?")){resetDemo();router.push("/");}}}>Reset demo data</button>
    <div className="auth-bottom">Want to test a new user? <Link href="/register">Create a demo account</Link></div>
  </div></div>;
}
