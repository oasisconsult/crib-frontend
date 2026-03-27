"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DraftEntry {
  key: string;
  formId: string;
  data: Record<string, unknown>;
  savedAt: string;
}

interface DraftState {
  drafts: Record<string, DraftEntry>;
  saveDraft: (formId: string, key: string, data: Record<string, unknown>) => void;
  loadDraft: (key: string) => DraftEntry | null;
  deleteDraft: (key: string) => void;
  hasDraft: (key: string) => boolean;
  clearAllDrafts: () => void;
  draftCount: () => number;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      drafts: {},

      saveDraft: (formId, key, data) =>
        set((s) => ({
          drafts: {
            ...s.drafts,
            [key]: { key, formId, data, savedAt: new Date().toISOString() },
          },
        })),

      loadDraft: (key) => get().drafts[key] ?? null,

      deleteDraft: (key) =>
        set((s) => {
          const { [key]: _, ...rest } = s.drafts;
          return { drafts: rest };
        }),

      hasDraft: (key) => key in get().drafts,

      clearAllDrafts: () => set({ drafts: {} }),

      draftCount: () => Object.keys(get().drafts).length,
    }),
    {
      name: "crib:drafts",
    },
  ),
);
