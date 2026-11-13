import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatStatus, MessageCursor, MessagePage } from "./chat";
import { CHAT_PAGE_SIZE } from "./chat";

type WatchOptions = {
  userId: string;
  claimId?: string;
  onChange: () => void;
  onStatus?: (status: ChatStatus) => void;
};

// Payloads only invalidate authorized queries; they are never copied into shared state.
export function watchPrivateUpdates(client: SupabaseClient, options: WatchOptions) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = undefined; if (!stopped) options.onChange(); }, 80);
  };
  const channel = client.channel(`findback:${options.userId}:${options.claimId || "inbox"}:${crypto.randomUUID()}`, { config: { postgres_changes_options: { wait: true } } });
  if (options.claimId) {
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `claim_id=eq.${options.claimId}` }, invalidate);
  } else {
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "claims" }, invalidate)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "claims" }, invalidate)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${options.userId}` }, invalidate)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${options.userId}` }, invalidate);
  }
  channel.subscribe((status) => {
    if (stopped) return;
    options.onStatus?.(status === "SUBSCRIBED" ? "live" : "retrying");
    // Reconcile the initial subscription gap and every reconnect.
    if (status === "SUBSCRIBED") invalidate();
  });
  return () => { stopped = true; clearTimeout(timer); void client.removeChannel(channel); };
}

export async function loadMessagePage(client: SupabaseClient, claimId: string, before?: MessageCursor, after?: MessageCursor): Promise<MessagePage> {
  const { data, error } = await client.rpc("get_claim_messages", {
    p_claim_id: claimId,
    p_before_created_at: before?.createdAt ?? null, p_before_id: before?.id ?? null,
    p_after_created_at: after?.createdAt ?? null, p_after_id: after?.id ?? null,
  });
  if (error) throw new Error(error.code === "PGRST202" ? "Apply the Phase 3 private chat migration to enable cloud conversation history." : error.message);
  const page = (data || []).slice(0, CHAT_PAGE_SIZE).map((row: { id: string; claim_id: string; sender_id: string; body: string; created_at: string }) => ({
    id: row.id, claimId: row.claim_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at,
  }));
  return { messages: after ? page : page.reverse(), hasMore: (data || []).length > CHAT_PAGE_SIZE };
}
