"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ClipboardCheck, Edit3, MessageCircle, ShieldCheck, Trash2 } from "lucide-react";
import { CategoryArt, EmptyState, InfoNote, InlineMeta, Pagination, StatusTag, TypeTag } from "@/components/ui";
import { useApp } from "@/context/app-context";
import { formatDate, shortId } from "@/lib/format";
import { activeClaim } from "@/lib/claim-workflow";
import { canReadReport } from "@/lib/moderation";
import { ReportFlagForm } from "@/components/report-flag-form";
import { useDataPage } from "@/context/use-data-page";
import { DataPageStatus } from "@/components/data-page-status";

export default function ItemDetails() {
  const { id } = useParams<{id:string}>(); const router=useRouter();
  const { db,user,isAdmin,removeReport,requestClaim,dataStats }=useApp();
  const [message,setMessage]=useState("");const [relatedReportId,setRelatedReportId]=useState("");const [error,setError]=useState("");const [claimOpen,setClaimOpen]=useState(false);
  const report=db.reports.find((r)=>r.id===id);
  const [relatedPage,setRelatedPage]=useState(1);
  const relatedRemote=useDataPage({kind:"related",id,page:relatedPage,pageSize:20},Boolean(claimOpen&&user&&report&&!report.hidden));
  if(!report||!canReadReport(db,user?.id,report))return <div className="container page-section"><EmptyState title="Report not found" description="The report you opened may have been removed or hidden." actionHref="/browse" actionText="Browse items"/></div>;
  const owner=db.users.find((u)=>u.id===report.ownerId);const mine=!!user&&(user.id===report.ownerId||isAdmin);
  const claims=db.claims.filter((c)=>c.reportId===id);
  const approvedClaim=claims.find((c)=>c.status==="approved"||c.status==="disputed");
  const existingClaim=claims.find((c)=>c.claimantId===user?.id&&activeClaim(c));
  const myRelatedReports=(relatedRemote?.db.reports||db.reports).filter((r)=>!r.hidden&&r.ownerId===user?.id&&r.type!==report.type&&r.category===report.category&&r.status==="open"&&r.id!==report.id);
  const submitClaim=async (e:React.FormEvent)=>{
    e.preventDefault();setError("");
    try{const claimId=await requestClaim(id,message,relatedReportId||undefined);router.push(`/claims/${claimId}`);}
    catch(err){setError(err instanceof Error?err.message:"Could not submit claim.");}
  };
  const onDelete=async ()=>{
    if(!window.confirm(`Permanently remove ${report.title}?`))return;
    setError("");try{await removeReport(id);router.push("/my-reports");}
    catch(err){setError(err instanceof Error?err.message:"Could not delete.");}
  };
  return <section className="container page-section"><Link className="back-link" href="/browse"><ArrowLeft size={16}/> Back to all items</Link>
    <div className="detail-layout"><article className="panel detail-main"><CategoryArt category={report.category} image={report.image} large/>
      <div className="detail-tags"><TypeTag type={report.type}/><StatusTag status={report.status}/></div>
      <h1>{report.title}</h1><span style={{fontSize:12,color:"#79948a",fontWeight:700}}>{shortId(report.id)} · {report.category}</span><InlineMeta report={report}/>
      {report.hidden&&<InfoNote>This report is hidden by Admin. It is excluded from public discovery; new claims and handover are paused until restored. Existing participants can continue their private conversation.</InfoNote>}
      <div className="detail-description"><h3>About this item</h3><p>{report.description}</p></div>
      <div style={{display:"flex",gap:17,flexWrap:"wrap",borderTop:"1px solid #edf2ee",paddingTop:20}}><div><span style={{fontSize:12,color:"#82968f"}}>Brand</span><strong style={{display:"block",fontSize:14}}>{report.brand||"Not specified"}</strong></div><div><span style={{fontSize:12,color:"#82968f"}}>Color</span><strong style={{display:"block",fontSize:14}}>{report.color||"Not specified"}</strong></div></div>
      {report.linkedReportId&&<div className="info-note" style={{marginTop:15}}>This item was returned together with <Link className="text-link" href={`/item/${report.linkedReportId}`}>a linked report</Link>.</div>}
      {mine&&<div className="detail-actions"><Link href={`/item/${id}/edit`} className="btn btn-outline btn-sm"><Edit3 size={14}/> Edit</Link>{report.status==="open"&&approvedClaim&&<Link href={`/claims/${approvedClaim.id}`} className="btn btn-outline btn-sm">Open handover</Link>}{user?.id===report.ownerId&&!report.hidden&&<button onClick={onDelete} className="btn btn-danger btn-sm"><Trash2 size={14}/> Delete</button>}{isAdmin&&<Link href="/admin" className="btn btn-outline btn-sm">Moderate report</Link>}{report.status==="open"&&!approvedClaim&&<small style={{color:"#81968d"}}>Approve a claim before starting two-party handover.</small>}</div>}
      {error&&<div style={{marginTop:17}} className="form-error" role="alert">{error}</div>}
    </article>
    <aside><div className="panel detail-side"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}><h3>Report details</h3><StatusTag status={report.status}/></div>
      <div className="info-row"><span className="key">Report ID</span><span className="value">{shortId(report.id)}</span></div>
      <div className="info-row"><span className="key">Reported by</span><span className="value">{owner?.name||"Campus user"}</span></div>
      <div className="info-row"><span className="key">Item date</span><span className="value">{formatDate(report.occurredOn)}</span></div>
      <div className="info-row"><span className="key">Location</span><span className="value">{report.location}</span></div>
      <div className="info-row"><span className="key">Category</span><span className="value">{report.category}</span></div>
      {mine? <><div className="claim-callout"><h4><ClipboardCheck size={15} style={{verticalAlign:"middle",marginRight:5}}/> Claim requests: {dataStats?.claimCount ?? claims.length}</h4><p>Review submitted requests, verify ownership and communicate privately.</p><Link href="/my-reports" className="text-link">Review claims <ArrowRight size={15}/></Link></div></> : report.hidden ? existingClaim&&<Link className="btn btn-outline" href={`/claims/${existingClaim.id}`}>Open existing conversation</Link> : report.status==="open" ? <>
        {existingClaim?<Link className="btn btn-primary" href={`/claims/${existingClaim.id}`}><MessageCircle size={17}/> View your claim</Link>: <><button className="btn btn-primary" onClick={()=>user?setClaimOpen(!claimOpen):router.push("/login")}><MessageCircle size={17}/> Request to {report.type==="found"?"claim item":"contact owner"}</button>{claimOpen&&<form className="claim-callout" onSubmit={submitClaim}><h4>Share safe identifying details</h4><p>Describe a distinctive mark, case, contents or approximate loss time. Never send passwords, PINs, full ID numbers or identity-document photos.</p><label htmlFor="claim-evidence">Private ownership evidence</label><textarea id="claim-evidence" required minLength={12} maxLength={2000} value={message} onChange={(e)=>setMessage(e.target.value)} placeholder="Describe a non-public identifying detail..."/><DataPageStatus page={relatedRemote}/>{myRelatedReports.length>0&&<div className="field" style={{marginTop:9}}><label htmlFor="related">Link your own {report.type==="found"?"lost":"found"} report (optional)</label><select id="related" value={relatedReportId} onChange={(e)=>setRelatedReportId(e.target.value)}><option value="">No linked report</option>{myRelatedReports.map((r)=><option key={r.id} value={r.id}>{r.title}</option>)}</select></div>}{relatedRemote&&<Pagination page={relatedRemote.page} totalPages={Math.max(1,Math.ceil(relatedRemote.total/20))} onChange={(page)=>{setRelatedPage(page);setRelatedReportId("");}}/>}<button type="submit" className="btn btn-primary btn-sm"><MessageCircle size={14}/> Send Claim Request</button></form>}</>}
      </> : <InfoNote>This item has been marked returned. Claims are closed.</InfoNote>}
      <p className="privacy-note"><ShieldCheck size={14} style={{verticalAlign:"middle",marginRight:5}}/>Contact numbers are not displayed publicly. Please use the claim process for communication.</p>
      {user&&user.id!==report.ownerId&&!report.hidden&&<ReportFlagForm key={report.id} reportId={report.id}/>}
    </div><div style={{marginTop:16}}><InfoNote><strong>Safety first.</strong> Never share account passwords or full ID numbers. Verify ownership before an in-person handover.</InfoNote></div></aside>
    </div>
  </section>;
}
