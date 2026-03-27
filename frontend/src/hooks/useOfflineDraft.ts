"use client";

import { useCallback, useEffect } from "react";
import { useDraftStore } from "@/store/useDraftStore";
import type { UseFormReturn, FieldValues } from "react-hook-form";

interface UseOfflineDraftOptions {
  formId: string;
  key: string;
  autoSaveIntervalMs?: number;
}

export function useOfflineDraft<T extends FieldValues>(
  form: UseFormReturn<T>,
  options: UseOfflineDraftOptions,
) {
  const { formId, key, autoSaveIntervalMs = 30_000 } = options;
  const { saveDraft, loadDraft, deleteDraft, hasDraft } = useDraftStore();

  const save = useCallback(() => {
    const values = form.getValues();
    saveDraft(formId, key, values as Record<string, unknown>);
  }, [form, formId, key, saveDraft]);

  const restore = useCallback(() => {
    const draft = loadDraft(key);
    if (draft) {
      form.reset(draft.data as T);
      return draft.savedAt;
    }
    return null;
  }, [form, key, loadDraft]);

  const clear = useCallback(() => {
    deleteDraft(key);
  }, [key, deleteDraft]);

  const hasUnsavedDraft = hasDraft(key);

  // Auto-save on interval
  useEffect(() => {
    const interval = setInterval(save, autoSaveIntervalMs);
    return () => clearInterval(interval);
  }, [save, autoSaveIntervalMs]);

  // Save on unmount
  useEffect(() => {
    return () => {
      const { isDirty } = form.formState;
      if (isDirty) save();
    };
  }, [form, save]);

  return { save, restore, clear, hasUnsavedDraft };
}
