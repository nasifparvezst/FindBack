"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, ImagePlus, ShieldCheck, Send, Sparkles } from "lucide-react";
import { DEMO_MODE, useApp } from "@/context/app-context";
import { CATEGORIES, type Report, type ReportDraft, type ReportType } from "@/lib/types";
import { todayLocalISO, reportIssues } from "@/lib/validation";
import { findPossibleDuplicates } from "@/lib/duplicates";
import { PageHeading, Pagination } from "@/components/ui";
import { useDataPage } from "@/context/use-data-page";
import { DataPageStatus } from "@/components/data-page-status";

const blank = (type: ReportType): ReportDraft => ({
  type, title: "", category: "Phone", brand: "", color: "", location: "",
  occurredOn: "", description: "", contactPhone: "", image: "",
});

async function optimizeImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Please select a JPG, PNG, or WebP image.");
  }
  if (file.size > 6 * 1024 * 1024) throw new Error("Image must be smaller than 6 MB.");
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 850 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not process image.");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.68);
        URL.revokeObjectURL(objectUrl);
        resolve(data);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Invalid image file."));
    };
    img.src = objectUrl;
  });
}

export function ReportForm({ type, existing }: { type: ReportType; existing?: Report }) {
  const router = useRouter();
  const { db, user, addReport, editReport } = useApp();
  const [form, setForm] = useState<ReportDraft>(() => existing ? {
    type: existing.type, title: existing.title, category: existing.category, brand: existing.brand,
    color: existing.color, location: existing.location, occurredOn: existing.occurredOn,
    description: existing.description, contactPhone: existing.contactPhone, image: existing.category === "ID Card" ? "" : existing.image,
  } : blank(type));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ id: string; message: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const imageJob = useRef(0);
  const invalidateImage = useCallback(() => { imageJob.current++; }, []);
  useEffect(() => invalidateImage, [invalidateImage]);
  const [moderationReason, setModerationReason] = useState("");
  const adminEditing = user?.role === "admin" && existing && existing.ownerId !== user.id;
  const [fileName, setFileName] = useState(existing?.image && existing.category !== "ID Card" ? "Current photo" : "");
  const [duplicatePage,setDuplicatePage]=useState(1);
  const duplicateCandidates=useDataPage({kind:"duplicates",type:form.type,category:form.category,occurredOn:form.occurredOn,id:existing?.id,page:duplicatePage,pageSize:100},Boolean(user&&form.occurredOn&&(form.title.trim()||form.brand.trim())));
  const set = <K extends keyof ReportDraft>(key: K, value: ReportDraft[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    const id = key === "contactPhone" ? "phone" : key === "occurredOn" ? "occurred" : key;
    setFieldErrors((issues) => issues.filter((issue) => issue.id !== id));
    if (["category","type","occurredOn"].includes(key)) setDuplicatePage(1);
  };

  const possibleDuplicates = useMemo(
    () => findPossibleDuplicates(form, duplicateCandidates?.db.reports||db.reports, existing?.id),
    [form, db.reports, existing?.id, duplicateCandidates],
  );

  const chooseCategory = (value: ReportDraft["category"]) => {
    invalidateImage(); setImageBusy(false); setError("");
    set("category", value);
    if (value === "ID Card") {
      set("image", "");
      setFileName("");
    }
  };
  const fieldA11y = (id: string, hint?: string) => ({
    "aria-invalid": fieldErrors.some((issue) => issue.id === id) || undefined,
    "aria-describedby": [hint, fieldErrors.some((issue) => issue.id === id) ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined,
  });
  const fieldError = (id: string) => {
    const issues = fieldErrors.filter((issue) => issue.id === id);
    return issues.length > 0 && <small id={`${id}-error`} className="field-error">{issues.map((issue) => issue.message).join(" ")}</small>;
  };
  const focusErrors = () => requestAnimationFrame(() => errorSummary.current?.focus());

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || imageBusy) return;
    setError("");
    if (!user) {
      router.push("/login");
      return;
    }
    const errors: { id: string; message: string }[] = reportIssues(form).map((issue) => ({ id: issue.field === "contactPhone" ? "phone" : issue.field === "occurredOn" ? "occurred" : issue.field === "image" && form.category === "ID Card" ? "category" : issue.field, message: issue.message }));
    for (const element of Array.from(event.currentTarget.elements)) {
      if ((element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) && element.id && !element.validity.valid && !errors.some((issue) => issue.id === element.id)) errors.push({ id: element.id, message: element.validationMessage });
    }
    if (adminEditing && moderationReason.trim().length < 10 && !errors.some((issue) => issue.id === "edit-moderation-reason")) errors.push({ id: "edit-moderation-reason", message: "Provide an Admin edit reason with at least 10 non-space characters." });
    setFieldErrors(errors);
    if (errors.length) {
      focusErrors();
      return;
    }
    setBusy(true);
    try {
      if (existing) {
        await editReport(existing.id, form, moderationReason);
        router.push(`/item/${existing.id}`);
      } else {
        const id = await addReport(form);
        router.push(`/item/${id}`);
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to save report.");
      focusErrors();
    } finally {
      setBusy(false);
    }
  };

  const lost = type === "lost";
  return (
    <section className="container page-section">
      <Link href={existing ? `/item/${existing.id}` : "/browse"} className="back-link">
        <ArrowLeft size={15} /> Back to {existing ? "report" : "browse"}
      </Link>
      <PageHeading
        eyebrow="Help the campus community"
        title={existing ? "Edit your report" : lost ? "Report a lost item" : "Report a found item"}
        description={lost
          ? "Provide clear information so someone who finds your item can recognize it."
          : "Share what you found to help the rightful owner recover it."}
      />
      {!user && (
        <div className="alert-banner">
          <ShieldCheck size={19} /> You need to sign in before submitting a report.
          <Link href="/login" style={{ textDecoration: "underline", fontWeight: 700 }}>
            {DEMO_MODE ? "Choose demo account" : "Sign in"}
          </Link>
        </div>
      )}

      <div className="form-layout">
        <div className="panel form-panel">
          <h2>Item information</h2>
          <p className="subtext">Fields marked * are required. Share enough detail to identify the item.</p>
          {(error || fieldErrors.length > 0) && <div ref={errorSummary} tabIndex={-1} className="form-error error-summary" role="alert"><h3>{fieldErrors.length ? "Check the highlighted fields" : "Your report could not be saved"}</h3>{error && <p>{error}</p>}{fieldErrors.length > 0 && <ul>{fieldErrors.map((issue, index) => <li key={`${issue.id}-${index}`}><a href={`#${issue.id}`} onClick={(event) => { event.preventDefault(); document.getElementById(issue.id)?.focus(); }}>{issue.message}</a></li>)}</ul>}</div>}
          <DataPageStatus page={duplicateCandidates}/>
          {duplicateCandidates&&duplicateCandidates.total>100&&<div className="info-note"><span>Duplicate warnings check this page of {duplicateCandidates.total} compatible reports. Check other pages before submitting.<Pagination page={duplicateCandidates.page} busy={duplicateCandidates.loading} label="Duplicate candidate pages" totalPages={Math.ceil(duplicateCandidates.total/100)} onChange={setDuplicatePage}/></span></div>}

          {possibleDuplicates.length > 0 && (
            <div className="duplicate-warning" role="status">
              <div className="duplicate-warning-heading"><AlertTriangle size={19} />
                <div><strong>Similar reports already exist</strong><p>Check these reports before submitting. This is only a warning; you can still continue if yours is different.</p></div>
              </div>
              <ul>
                {possibleDuplicates.map(({ report, score, reasons }) => (
                  <li key={report.id}>
                    <div><Link href={`/item/${report.id}`} target="_blank" rel="noreferrer">{report.title}</Link><small>{report.location} · {report.occurredOn} · {reasons.slice(2, 4).join(", ") || "Similar details"}</small></div>
                    <span>{score}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={submit} noValidate aria-busy={busy || imageBusy || undefined}>
            <fieldset className="report-fields" disabled={busy}>
            <legend className="sr-only">Item information and private contact</legend>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="title">Item name *</label>
                <input id="title" {...fieldA11y("title")} required minLength={2} maxLength={120} value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="e.g. Black leather wallet" />{fieldError("title")}
              </div>
              <div className="field">
                <label htmlFor="category">Category *</label>
                <select id="category" {...fieldA11y("category")} value={form.category} onChange={(event) => chooseCategory(event.target.value as ReportDraft["category"])}>
                  {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </select>
                {fieldError("category")}
              </div>
              <div className="field">
                <label htmlFor="brand">Brand (optional)</label>
                <input id="brand" maxLength={80} value={form.brand} onChange={(event) => set("brand", event.target.value)} placeholder="e.g. Apple, Casio" />
              </div>
              <div className="field">
                <label htmlFor="color">Color (optional)</label>
                <input id="color" maxLength={60} value={form.color} onChange={(event) => set("color", event.target.value)} placeholder="e.g. Black, Navy Blue" />
              </div>
              <div className="field">
                <label htmlFor="location">{lost ? "Last seen" : "Found at"} location *</label>
                <input id="location" {...fieldA11y("location")} required maxLength={150} value={form.location} onChange={(event) => set("location", event.target.value)} placeholder="e.g. Central Library" />{fieldError("location")}
              </div>
              <div className="field">
                <label htmlFor="occurred">{lost ? "Date lost" : "Date found"} *</label>
                <input id="occurred" {...fieldA11y("occurred")} type="date" required max={todayLocalISO()} value={form.occurredOn} onChange={(event) => set("occurredOn", event.target.value)} />{fieldError("occurred")}
              </div>
              <div className="field span-two">
                <label htmlFor="description">Description *</label>
                <textarea id="description" {...fieldA11y("description", "description-hint")} required minLength={10} maxLength={2000} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Describe the item, identifying marks, contents, or other helpful clues. Keep private proof-of-ownership details to yourself." />
                <small id="description-hint" className="field-hint">{form.description.length} / 2000 characters · 10 minimum</small>{fieldError("description")}
              </div>
              <div className="field span-two">
                <span className="field-label">Photo (optional)</span>
                {form.category === "ID Card" ? (
                  <div className="privacy-warning"><ShieldCheck size={18} /><span><strong>Photo upload disabled for ID Cards.</strong> Item photos are publicly viewable. Never upload a student ID, national ID, card number, QR code or other personal document.</span></div>
                ) : (
                  <>
                    <label className="upload-area" htmlFor="image" aria-busy={imageBusy || undefined}>
                      <input ref={photoInput} id="image" type="file" disabled={imageBusy} aria-label="Upload an item photo" {...fieldA11y("image", "photo-hint")} accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
                        const input = event.currentTarget;
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const job = ++imageJob.current;
                        setError(""); setImageBusy(true);
                        try {
                          const data = await optimizeImage(file);
                          if (job !== imageJob.current) return;
                          set("image", data);
                          setFileName(file.name);
                        } catch (uploadError) {
                          if (job !== imageJob.current) return;
                          setError(uploadError instanceof Error ? uploadError.message : "Image upload failed.");
                          focusErrors();
                        } finally { input.value = ""; if (job === imageJob.current) setImageBusy(false); }
                      }} />
                      {form.image ? (
                        // Preview the compressed data URL directly before it is uploaded.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={form.image} alt="Selected item preview" className="uploaded-preview" />
                      ) : <ImagePlus size={27} />}
                      <strong>{imageBusy ? "Preparing photo..." : fileName || (form.image ? "Change photo" : "Choose an item photo")}</strong>
                      <small id="photo-hint">JPG, PNG or WebP · maximum 6 MB before compression</small>
                    </label>
                    <span className="sr-only" role="status">{imageBusy ? "Preparing photo. Please wait before submitting." : fileName ? "Photo ready." : ""}</span>{fieldError("image")}
                    {form.image && <button type="button" className="remove-photo" onClick={() => { invalidateImage(); setImageBusy(false); set("image", ""); setFileName(""); if (photoInput.current) photoInput.current.value = ""; }}>Remove image</button>}
                  </>
                )}
              </div>
              <div className="field span-two">
                <label htmlFor="phone">Your contact number *</label>
                <input id="phone" {...fieldA11y("phone", "phone-hint")} type="tel" inputMode="tel" autoComplete="tel" required maxLength={24} value={form.contactPhone} onChange={(event) => set("contactPhone", event.target.value)} placeholder="01712345678" />
                <small id="phone-hint" className="field-hint">Kept private. Contact is arranged through claims and chat.</small>{fieldError("phone")}
              </div>
            </div>
            {adminEditing && <div className="field"><label htmlFor="edit-moderation-reason">Admin edit reason (10–1000 characters)</label><textarea id="edit-moderation-reason" {...fieldA11y("edit-moderation-reason", "edit-reason-hint")} required minLength={10} maxLength={1000} value={moderationReason} onChange={(event) => { setModerationReason(event.target.value); setFieldErrors((issues) => issues.filter((issue) => issue.id !== "edit-moderation-reason")); }} /><small id="edit-reason-hint" className="field-hint">This reason is recorded in the moderation audit log.</small>{fieldError("edit-moderation-reason")}</div>}
            <div className="form-actions">
              <Link href="/browse" className="btn btn-light">Cancel</Link>
              <button className="btn btn-primary" disabled={busy || imageBusy || !user} type="submit">
                <Send size={16} />{busy ? "Saving..." : imageBusy ? "Preparing photo..." : existing ? "Save Changes" : lost ? "Submit Lost Report" : "Submit Found Report"}
              </button>
            </div>
            </fieldset>
          </form>
        </div>
        <aside>
          <div className="panel guide-card">
            <span className="step-icon"><Sparkles size={23} /></span>
            <h3 style={{ marginTop: 18 }}>Tips for a great report</h3>
            <ul>
              <li>Give a specific item name and category.</li>
              <li>Include the exact last-seen or found location.</li>
              <li>Add color, brand and memorable identifying details.</li>
              <li>Upload a clear photo only if it contains no personal data.</li>
              <li>Keep one unique ownership detail private for verification.</li>
            </ul>
          </div>
          <div className="guide-callout"><CheckCircle2 size={19} /><span>Similar open reports are highlighted before submission. Matching is a suggestion, not proof of ownership.</span></div>
        </aside>
      </div>
    </section>
  );
}
