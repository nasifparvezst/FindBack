"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Bell, CheckCheck } from "lucide-react";
import { useApp } from "@/context/app-context";
import { EmptyState, PageHeading } from "@/components/ui";
import { relativeDate } from "@/lib/format";

export default function Notifications() {
  const {db,user,markAllRead,markNotificationRead,unreadNotifications}=useApp();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [visible,setVisible]=useState(20);
  const safely=async(action:()=>void|Promise<void>)=>{if(busy)return;setBusy(true);setError("");try{await action();}catch(e){setError(e instanceof Error?e.message:"Could not update notifications");}finally{setBusy(false);}};
  if(!user)return <div className="page-section container"><EmptyState title="Sign in to view notifications" description="Your alerts and claim updates appear here." actionHref="/login"/></div>;
  const notes=db.notifications.filter((n)=>n.userId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const count=unreadNotifications??notes.filter((n)=>!n.read).length;
  return <section className="page-section container"><PageHeading eyebrow="Don't miss an update" title="Notifications" description={`${count} unread ${count===1?"notification":"notifications"}. Stay informed about claims, matches and item updates.`} aside={<button onClick={()=>{void safely(markAllRead);}} className="btn btn-outline" disabled={!count||busy}><CheckCheck size={17}/> Mark all as read</button>}/>
    {error&&<div className="form-error" role="alert">{error}</div>}<div className="panel notification-list">{notes.slice(0,visible).map((n)=><div className={`notification-entry ${n.read?"":"unread"}`} key={n.id}><span className="notification-icon"><Bell size={19}/></span><div className="notification-content"><strong>{n.title}</strong><p>{n.body}</p><small>{relativeDate(n.createdAt)}</small></div><div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:11}}><Link className="text-link" href={n.href} onClick={()=>{void safely(()=>markNotificationRead(n.id));}}>Open <ArrowUpRight size={14}/></Link>{!n.read&&<button disabled={busy} onClick={()=>{void safely(()=>markNotificationRead(n.id));}}>Mark read</button>}</div></div>)}{notes.length===0&&<EmptyState title="All caught up" description="Matching suggestions and claim updates will show up here." actionHref="/browse" actionText="Explore items"/>}</div>
    {visible<notes.length&&<button className="btn btn-light" onClick={()=>setVisible((value)=>value+20)}>Show more notifications</button>}
  </section>;
}
