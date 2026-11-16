"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({ id, visibilityLabel = "password", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string; visibilityLabel?: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="password-control"><input {...props} id={id} type={visible ? "text" : "password"}/><button type="button" disabled={props.disabled} aria-controls={id} aria-pressed={visible} aria-label={`${visible ? "Hide" : "Show"} ${visibilityLabel}`} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={19} aria-hidden/> : <Eye size={19} aria-hidden/>}</button></div>;
}
