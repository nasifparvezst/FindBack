"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Check, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import { useApp } from "@/context/app-context";
import { EmptyState, InfoNote, PageHeading, StatusTag } from "@/components/ui";
import { formatDate, relativeDate } from "@/lib/format";

export default function ClaimRoom() {
  const { id }=useParams<{id:string}>();const {db,user,isAdmin,updateClaim,sendMessage,markReturned}=useApp();const [message,setMessage]=useState("");const [error,setError]=useState("");
  const claim=db.claims.find((c)=>c.id===id);const report=db.reports.find((r)=>r.id===claim?.reportId);
  const canView=!!claim&&!!report&&!!user&&(user.id===claim.claimantId||user.id===report.ownerId||isAdmin);
  if(!canView||!claim||!report)return <div className="page-section container"><EmptyState title="Conversation not available" description="You may not have access to this claim, or it has been removed." actionHref="/my-reports"/></div>;
  const owner=db.users.find((u)=>u.id===report.ownerId);const claimant=db.users.find((u)=>u.id===claim.claimantId);
  const canReview=(user.id===report.ownerId||isAdmin)&&claim.status==="pending";
  const canTalk=claim.status!=="rejected"&&claim.status!=="completed";
  const thread=db.messages.filter((m)=>m.claimId===claim.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  const onSend=async (e:FormEvent)=>{
    e.preventDefault();setError("");
    try{await sendMessage(claim.id,message);setMessage("");}
    catch(err){setError(err instanceof Error?err.message:"Failed to send message.");}
  };
  const onReview=async (status:"approved"|"rejected")=>{
    if(status==="rejected"&&!window.confirm("Reject this claim request?"))return;
    setError("");try{await updateClaim(claim.id,status);}
    catch(err){setError(err instanceof Error?err.message:"Could not update claim.");}
  };
  const onReturn=async ()=>{
    if(!window.confirm("Confirm the physical handover is complete?"))return;
    setError("");try{await markReturned(report.id);}
    catch(err){setError(err instanceof Error?err.message:"Failed to update return status.");}
  };
  return <section className="page-section container"><Link href="/my-reports" className="back-link"><ArrowLeft size={16}/> Back to claims</Link><PageHeading eyebrow="Ownership verification" title={`Claim: ${report.title}`} description={`Opened ${formatDate(claim.createdAt)}. Communicate privately and verify ownership before returning an item.`} aside={<StatusTag status={claim.status}/>}/>
    <div className="chat-layout"><article className="panel chat-panel"><div style={{display:"flex",gap:10,alignItems:"center",borderBottom:"1px solid #e9f1ec",paddingBottom:17}}><span className="step-icon" style={{height:40,width:40}}><MessageCircle size={19}/></span><div><strong style={{fontSize:15}}>Private claim conversation</strong><div style={{fontSize:12,color:"#81988d"}}>{owner?.name} ↔ {claimant?.name}</div></div></div>
      <div className="chat-scroll" aria-label="Conversation history"><div className="chat-message"><strong style={{fontSize:11,display:"block",marginBottom:5}}>Claim request · {claimant?.name}</strong>{claim.message}<small>{relativeDate(claim.createdAt)}</small></div>{thread.map((m)=><div key={m.id} className={`chat-message ${m.senderId===user.id?"mine":""}`}><strong style={{fontSize:11,display:"block",marginBottom:5}}>{db.users.find((u)=>u.id===m.senderId)?.name||"Campus user"}</strong>{m.body}<small>{relativeDate(m.createdAt)}</small></div>)}</div>
      {error&&<div className="form-error" role="alert">{error}</div>}
      {canTalk?<form className="chat-compose" onSubmit={onSend}><input required maxLength={2000} placeholder="Write a private message..." aria-label="Write a message" value={message} onChange={(e)=>setMessage(e.target.value)}/><button className="btn btn-primary" type="submit"><Send size={16}/> Send</button></form>:<InfoNote>This claim is closed, so further messages are disabled.</InfoNote>}
    </article>
    <aside><div className="panel claim-summary"><div className="claim-status-row"><h3 style={{margin:0}}>Claim details</h3><StatusTag status={claim.status}/></div><div className="info-row"><span className="key">Reported item</span><Link href={`/item/${report.id}`} className="text-link">{report.title}</Link></div><div className="info-row"><span className="key">Report owner</span><span className="value">{owner?.name}</span></div><div className="info-row"><span className="key">Claimant</span><span className="value">{claimant?.name}</span></div><div className="info-row"><span className="key">Submitted</span><span className="value">{formatDate(claim.createdAt)}</span></div>
      {canReview&&<div style={{marginTop:25}}><strong style={{fontSize:13}}>Review request</strong><p style={{color:"#82978e",fontSize:12,margin:"5px 0 10px"}}>Only approve after checking the claimant&apos;s private identifying details.</p><button className="btn btn-primary btn-wide" onClick={()=>onReview("approved")}><Check size={16}/> Approve claim</button><button className="btn btn-danger btn-wide" onClick={()=>onReview("rejected")}><X size={16}/> Reject claim</button></div>}
      {(user.id===report.ownerId||isAdmin)&&claim.status==="approved"&&report.status==="open"&&<div style={{marginTop:20}}><InfoNote><BadgeCheck size={15}/>Only confirm once the item has actually changed hands.</InfoNote><button className="btn btn-primary btn-wide" onClick={onReturn}><Check size={16}/> Confirm item returned</button></div>}
      <div style={{marginTop:22}}><InfoNote><ShieldCheck size={17}/> Meet in a safe public campus area. Never reveal passwords, PINs or complete ID numbers.</InfoNote></div></div></aside>
    </div>
  </section>;
}
