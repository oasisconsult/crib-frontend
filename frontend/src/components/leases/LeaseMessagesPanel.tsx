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

  return (
    <Card>
      <CardHeader className="pb-3">
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
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No messages yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Start a conversation with the tenant.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {messages.map((msg: Message) => {
              const isMe = msg.senderId === user?.id;
              return (
                <div
                  key={msg.id}
                  className={cn("flex flex-col gap-0.5", isMe ? "items-end" : "items-start")}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm",
                    )}
                  >
                    {msg.content}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-1">
                    {!isMe && (
                      <span className="font-medium capitalize">{msg.senderName} · {msg.senderRole}</span>
                    )}
                    <span>{new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    <span>·</span>
                    <span>{new Date(msg.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}

        <div className="mt-4 flex gap-2 items-end border-t border-border pt-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send)"
            rows={2}
            className="resize-none flex-1 text-sm"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
