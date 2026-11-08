"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, ShieldAlert } from "lucide-react";
import { useApp } from "@/context/app-context";

export default function Register(){const [name,setName]=useState("");const [email,setEmail]=useState("");const [error,setError]=useState("");const {registerDemo}=useApp();const router=useRouter();const submit=(e:FormEvent)=>{e.preventDefault();setError("");try{registerDemo(name,email);router.push("/my-reports");}catch(err){setError(err instanceof Error?err.message:"Failed to create demo user.");}};
return <div className="auth-wrap"><div className="panel auth-panel"><span className="eyebrow">Join the community</span><h1>Create a demo profile.</h1><p>Try reporting and claiming items using a test-only university profile.</p><div className="alert-banner"><ShieldAlert size={18}/> This is only a local demo profile, without password, email verification or real authentication. Do not enter real personal information.</div>{error&&<div className="form-error" role="alert">{error}</div>}<form onSubmit={submit}><div className="field"><label htmlFor="name">Full name</label><input id="name" required minLength={2} value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. Demo Student"/></div><div className="field"><label htmlFor="email">University email</label><input id="email" required type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="student@seu.edu.bd"/></div><button type="submit" className="btn btn-primary btn-wide"><UserPlus size={17}/> Create Demo Profile</button></form><div className="auth-bottom">Already have a demo profile? <Link href="/login">Select account</Link></div></div></div>;
}
