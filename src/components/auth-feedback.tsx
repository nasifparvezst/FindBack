"use client";

import { useSearchParams } from "next/navigation";
import { authFeedback } from "@/lib/auth-flow";

export function AuthFeedback() {
  const feedback = authFeedback(useSearchParams());
  return feedback ? <div className={feedback.error ? "form-error" : "alert-banner"} role={feedback.error ? "alert" : "status"}>{feedback.text}</div> : null;
}
