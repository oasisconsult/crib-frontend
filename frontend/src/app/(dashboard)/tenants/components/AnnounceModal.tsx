"use client";

import { useState } from "react";
import { X, Megaphone } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/store/useUIStore";
import { apiClient } from "@/services/api/client";

interface Props {
  onClose: () => void;
}

interface AnnouncementBody {
  title: string;
  body: string;
  channels: string[];
}

const CHANNELS = [
  { id: "in_app", label: "In-app notification" },
  { id: "email", label: "Email" },
] as const;

function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AnnouncementBody) => {
      const { data } = await apiClient.post("/announcements", payload);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast.success(`Sent to ${data.sentToCount ?? 0} tenant${data.sentToCount === 1 ? "" : "s"}`);
    },
    onError: () => toast.error("Failed to send announcement"),
  });
}

export function AnnounceModal({ onClose }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channels, setChannels] = useState<string[]>(["in_app"]);

  const { mutate, isPending } = useCreateAnnouncement();

  function toggleChannel(id: string) {
    setChannels((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim() || channels.length === 0) return;
    mutate(
      { title: title.trim(), body: body.trim(), channels },
      { onSuccess: onClose }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4" />
              Broadcast Announcement
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Delivered to all active tenants in your organisation.
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ann-title">Subject</Label>
              <Input
                id="ann-title"
                placeholder="e.g. Water interruption this Friday"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={255}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ann-body">Message</Label>
              <textarea
                id="ann-body"
                rows={5}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                           placeholder:text-muted-foreground focus:outline-none focus:ring-2
                           focus:ring-ring focus:ring-offset-1 resize-none"
                placeholder="Write your announcement here…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Send via</Label>
              <div className="flex flex-wrap gap-3">
                {CHANNELS.map(({ id, label }) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2 text-sm select-none"
                  >
                    <input
                      type="checkbox"
                      checked={channels.includes(id)}
                      onChange={() => toggleChannel(id)}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {channels.length === 0 && (
                <p className="text-xs text-destructive">Select at least one channel.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || !title.trim() || !body.trim() || channels.length === 0}
              >
                {isPending ? "Sending…" : "Send to all tenants"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
