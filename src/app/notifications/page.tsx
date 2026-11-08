"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Bell, CheckCheck } from "lucide-react";
import { useApp } from "@/context/app-context";
import { EmptyState, PageHeading } from "@/components/ui";
import { relativeDate } from "@/lib/format";

export default function Notifications() {
  const {db,user,markAllRead,markNotificationRead}=useApp();
  const [error,setError]=useState("");
  const safely=async(action:()=>void|Promise<void>)=>{setError("");try{await action();}catch(e){setError(e instanceof Error?e.message:"Could not update notifications");}};
  if(!user)return <div className="page-section container"><EmptyState title="Sign in to view notifications" description="Your alerts and claim updates appear here." actionHref="/login"/></div>;
  const notes=db.notifications.filter((n)=>n.userId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const count=notes.filter((n)=>!n.read).length;
  return <section className="page-section container"><PageHeading eyebrow="Don't miss an update" title="Notifications" description={`${count} unread ${count===1?"notification":"notifications"}. Stay informed about claims, matches and item updates.`} aside={<button onClick={()=>{void safely(markAllRead);}} className="btn btn-outline" disabled={!count}><CheckCheck size={17}/> Mark all as read</button>}/>
    {error&&<div className="form-error" role="alert">{error}</div>}<div className="panel notification-list">{notes.map((n)=><div className={`notification-entry ${n.read?"":"unread"}`} key={n.id}><span className="notification-icon"><Bell size={19}/></span><div className="notification-content"><strong>{n.title}</strong><p>{n.body}</p><small>{relativeDate(n.createdAt)}</small></div><div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:11}}><Link className="text-link" href={n.href} onClick={()=>{void safely(()=>markNotificationRead(n.id));}}>Open <ArrowUpRight size={14}/></Link>{!n.read&&<button onClick={()=>{void safely(()=>markNotificationRead(n.id));}}>Mark read</button>}</div></div>)}{notes.length===0&&<EmptyState title="All caught up" description="Matching suggestions and claim updates will show up here." actionHref="/browse" actionText="Explore items"/>}</div>
  </section>;
}
