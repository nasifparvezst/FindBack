"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Send } from "lucide-react";
import { DEMO_MODE, useApp } from "@/context/app-context";
import { InfoNote } from "@/components/ui";
import { canMessageClaim } from "@/lib/claim-workflow";
import { CHAT_PAGE_SIZE, createRefreshQueue, mergeMessages, type ChatStatus } from "@/lib/chat";
import { loadMessagePage, watchPrivateUpdates } from "@/lib/realtime";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { relativeDate } from "@/lib/format";
import type { Claim, Message } from "@/lib/types";

type History = { messages: Message[]; hasMore: boolean; loading: boolean; error: string; status?: ChatStatus; more: () => Promise<void>; retry: () => Promise<void> };

function useCloudHistory(claimId: string, userId: string): History {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<ChatStatus>("connecting");
  const current = useRef<Message[]>([]);
  const alive = useRef(false);
  const request = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let active = true;
    alive.current = true;
    const refresh = createRefreshQueue(async () => {
      try {
        let cursor = current.current.at(-1);
        let nextPage = true;
        while (active && nextPage) {
          const page = await loadMessagePage(client, claimId, undefined, cursor);
          if (!active) return;
          current.current = mergeMessages(current.current, page.messages);
          setMessages(current.current);
          if (!cursor) setHasMore(page.hasMore);
          // A gap after reconnect can exceed one page. Fetch every missed message.
          nextPage = Boolean(cursor && page.hasMore);
          cursor = page.messages.at(-1);
        }
        setError("");
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Could not load conversation."); }
      finally { if (active) setLoading(false); }
    });
    request.current = refresh;
    const stop = watchPrivateUpdates(client, { userId, claimId, onChange: () => { void refresh(); }, onStatus: setStatus });
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; alive.current = false; stop(); clearInterval(timer); window.removeEventListener("online", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [client, claimId, userId]);

  const more = async () => {
    if (loading || !hasMore || !current.current.length) return;
    setLoading(true); setError("");
    try {
      const page = await loadMessagePage(client, claimId, current.current[0]);
      if (!alive.current) return;
      current.current = mergeMessages(current.current, page.messages);
      setMessages(current.current); setHasMore(page.hasMore);
    } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : "Could not load older messages."); }
    finally { if (alive.current) setLoading(false); }
  };
  return { messages, hasMore, loading, error, status, more, retry: () => request.current() };
}

function CloudConversation({ claim, userId }: { claim: Claim; userId: string }) {
  return <Conversation claim={claim} history={useCloudHistory(claim.id, userId)} />;
}

function DemoConversation({ claim }: { claim: Claim }) {
  const { db } = useApp();
  const [size, setSize] = useState(CHAT_PAGE_SIZE);
  const all = mergeMessages([], db.messages.filter((message) => message.claimId === claim.id));
  return <Conversation claim={claim} history={{ messages: all.slice(-size), hasMore: all.length > size, loading: false, error: "", more: async () => setSize((count) => count + CHAT_PAGE_SIZE), retry: async () => {} }} />;
}

function Conversation({ claim, history }: { claim: Claim; history: History }) {
  const { db, user, sendMessage, unreadClaims, markClaimMessagesRead } = useApp();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [readError, setReadError] = useState("");
  const [sent, setSent] = useState(false);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLInputElement>(null);
  const bottom = useRef(true);
  const deliveryId = useRef<string | null>(null);
  const last = history.messages.at(-1);
  const unread = unreadClaims?.[claim.id] || 0;
  const markRead = useCallback(async () => {
    if (!last || !unread || document.visibilityState !== "visible" || !bottom.current) return;
    try { await markClaimMessagesRead(claim.id, last); setReadError(""); }
    catch (err) { setReadError(err instanceof Error ? err.message : "Could not mark messages read."); }
  }, [claim.id, last, unread, markClaimMessagesRead]);

  useEffect(() => {
    // Follow incoming messages only while the reader is already at the bottom.
    if (bottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    const timer = setTimeout(() => { void markRead(); }, 80);
    document.addEventListener("visibilitychange", markRead);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", markRead); };
  }, [last, markRead]);

  if (!user) return null;
  const claimant = db.users.find((person) => person.id === claim.claimantId);
  const report = db.reports.find((entry) => entry.id === claim.reportId);
  const owner = db.users.find((person) => person.id === report?.ownerId);
  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || !draft.trim()) return;
    setSending(true); setSendError(""); setSent(false);
    try {
      deliveryId.current ??= crypto.randomUUID();
      await sendMessage(claim.id, draft, deliveryId.current);
      deliveryId.current = null; setDraft(""); bottom.current = true; setAwayFromBottom(false); await history.retry();
      setSent(true);
    }
    catch (err) { setSendError(err instanceof Error ? err.message : "Could not send message. Your draft is saved here; retry when connected."); }
    finally { setSending(false); requestAnimationFrame(() => composer.current?.focus({ preventScroll: true })); }
  };
  const loadOlder = async () => {
    const element = scroll.current;
    const height = element?.scrollHeight || 0;
    const position = element?.scrollTop || 0;
    bottom.current = false;
    setAwayFromBottom(true);
    await history.more();
    requestAnimationFrame(() => { if (element) { element.scrollTop = position + element.scrollHeight - height; element.focus({ preventScroll: true }); } });
  };
  const statusText = history.status === "live" ? "Live updates connected" : history.status === "retrying" ? "Reconnecting. Messages also refresh every 30 seconds." : "Connecting to live updates...";
  return <article className="panel chat-panel">
    <h2 className="claim-chat-heading"><MessageCircle size={19} /> Private claim conversation</h2>
    <p>{owner?.name} ↔ {claimant?.name}</p>
    {history.status && <small className="chat-connection" role="status">{statusText}</small>}
    {(history.error || sendError || readError) && <div className="form-error" role="alert">{history.error || sendError || readError}{(history.error || readError) && <button type="button" className="text-link" onClick={() => { void history.retry(); void markRead(); }}>Retry</button>}</div>}
    {sendError && <p className="chat-hint">Your message draft is kept. You can send it again when connected.</p>}
    <span className="sr-only" role="status">{sent ? "Message sent." : sending ? "Sending message..." : ""}</span>
    <div ref={scroll} tabIndex={0} className="chat-scroll" role="log" aria-label="Conversation history" aria-live="polite" aria-relevant="additions" aria-busy={history.loading || undefined} onScroll={() => {
      const element = scroll.current;
      if (element) bottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
      setAwayFromBottom(!bottom.current);
      if (bottom.current) void markRead();
    }}>
      {history.hasMore ? <button type="button" className="btn btn-light btn-sm" disabled={history.loading} onClick={() => { void loadOlder(); }}>{history.loading ? "Loading..." : "Load older messages"}</button> : <div className="chat-message"><strong>Claim request · {claimant?.name}</strong><p>{claim.message}</p><small>{relativeDate(claim.createdAt)}</small></div>}
      {history.loading && !history.messages.length && <p role="status">Loading messages...</p>}
      {history.messages.map((entry) => <div key={entry.id} className={`chat-message ${entry.senderId === user.id ? "mine" : ""}`}><strong>{db.users.find((person) => person.id === entry.senderId)?.name || "Campus user"}</strong><p>{entry.body}</p><time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()}>{relativeDate(entry.createdAt)} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>)}
    </div>
    {awayFromBottom && unread > 0 && <button type="button" className="text-link" onClick={() => { bottom.current = true; setAwayFromBottom(false); if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; void markRead(); }}>View new messages ({unread})</button>}
    {canMessageClaim(claim) ? <><form className="chat-compose" aria-busy={sending || undefined} onSubmit={(event) => { void onSend(event); }}><input ref={composer} required maxLength={2000} disabled={sending} placeholder="Write a private message..." aria-label="Write a message" aria-describedby="chat-message-hint" value={draft} onChange={(event) => { deliveryId.current = null; setDraft(event.target.value); }} /><button disabled={sending || !draft.trim()} className="btn btn-primary" type="submit"><Send size={16} />{sending ? "Sending..." : "Send"}</button></form><p id="chat-message-hint" className="chat-hint">{draft.length} / 2000 characters. Never share passwords, PINs or full ID numbers.</p></> : <InfoNote>This claim is closed, so further messages are disabled.</InfoNote>}
  </article>;
}

export function ClaimChat({ claim, userId }: { claim: Claim; userId: string }) {
  return DEMO_MODE ? <DemoConversation key={`${userId}:${claim.id}`} claim={claim} /> : <CloudConversation key={`${userId}:${claim.id}`} claim={claim} userId={userId} />;
}
