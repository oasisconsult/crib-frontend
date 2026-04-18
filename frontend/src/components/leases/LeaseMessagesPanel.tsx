"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMessages, useSendMessage } from "@/hooks/useMessages";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/utils/cn";
import type { Message } from "@/services/api/messages";

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatMsgDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function getInitialsFromName(name: string) {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

interface LeaseMessagesPanelProps {
  leaseId: string;
}

export function LeaseMessagesPanel({ leaseId }: LeaseMessagesPanelProps) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const user = useAppStore((s) => s.user);
  const { data, isLoading, refetch, isFetching } = useMessages(leaseId);
  const { mutate: send, isPending: sending } = useSendMessage(leaseId);
  const messages = data?.data ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    send(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Group by date
  const grouped: { date: string; msgs: Message[] }[] = [];
  for (const msg of messages) {
    const label = formatMsgDate(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== label) grouped.push({ date: label, msgs: [msg] });
    else last.msgs.push(msg);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            Messages
          </CardTitle>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Refresh messages"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col rounded-b-[6px] overflow-hidden">
          {/* Chat body */}
          <div
            className="overflow-y-auto px-3 py-4 space-y-1"
            style={{
              background: "linear-gradient(135deg, hsl(var(--accent)/0.3) 0%, hsl(var(--background)) 100%)",
              minHeight: 300,
              maxHeight: 400,
            }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-full py-16 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading messages…
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 gap-2">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageCircle className="h-7 w-7 text-primary/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground/60">Start a conversation with the tenant</p>
              </div>
            ) : (
              grouped.map(({ date, msgs }) => (
                <div key={date}>
                  {/* Date separator */}
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-border/60" />
                    <span className="text-[10px] font-medium text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full border border-border/50">
                      {date}
                    </span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>
                  <div className="space-y-1">
                    {msgs.map((msg) => {
                      const isMe = msg.senderId === user?.id || (!!user?.logtoSub && msg.senderId === user.logtoSub);
                      return (
                        <div key={msg.id} className={cn("flex gap-2 items-end", isMe ? "flex-row-reverse" : "flex-row")}>
                          {!isMe && (
                            <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary mb-0.5">
                              {getInitialsFromName(msg.senderName)}
                            </div>
                          )}
                          <div className={cn("flex flex-col gap-0.5 max-w-[75%]", isMe ? "items-end" : "items-start")}>
                            {!isMe && (
                              <span className="text-[10px] font-semibold text-primary pl-1 capitalize">
                                {msg.senderName} · {msg.senderRole}
                              </span>
                            )}
                            <div
                              className={cn(
                                "px-3.5 py-2 text-sm leading-relaxed shadow-sm",
                                isMe
                                  ? "bg-teal-700 text-white rounded-[8px] rounded-br-[4px]"
                                  : "bg-card text-foreground rounded-[8px] rounded-bl-[4px] border border-border/50",
                              )}
                            >
                              {msg.content}
                            </div>
                            <span className="text-[10px] text-muted-foreground px-1">
                              {formatMsgTime(msg.createdAt)}
                              {isMe && <span className="ml-1 text-teal-600">✓</span>}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Compose bar */}
          <div className="flex gap-2 items-end px-3 py-3 border-t border-border bg-card">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              rows={1}
              className="resize-none flex-1 text-sm rounded-[8px] min-h-[40px] max-h-[120px] py-2.5 px-4 border-border/60 bg-background focus-visible:ring-1"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              className="shrink-0 h-10 w-10 rounded-full"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
