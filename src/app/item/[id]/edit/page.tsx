"use client";
import { useParams } from "next/navigation";
import { ReportForm } from "@/components/report-form";
import { useApp } from "@/context/app-context";
import { EmptyState } from "@/components/ui";
export default function EditReportPage(){const {id}=useParams<{id:string}>();const {db,user,isAdmin}=useApp();const report=db.reports.find((r)=>r.id===id);if(!report)return <div className="container page-section"><EmptyState title="Report not found" description="This report may have been removed." actionHref="/browse"/></div>;if(!user||(user.id!==report.ownerId&&!isAdmin))return <div className="container page-section"><EmptyState title="Access denied" description="Only the report owner or an admin can edit this item." actionHref="/my-reports"/></div>;return <ReportForm key={report.id} type={report.type} existing={report}/>;}
