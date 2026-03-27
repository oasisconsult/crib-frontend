"use client";

import { get, set, del, keys } from "idb-keyval";

const DRAFT_PREFIX = "crib:draft:";

export async function saveDraft<T>(key: string, data: T): Promise<void> {
  await set(`${DRAFT_PREFIX}${key}`, {
    data,
    savedAt: new Date().toISOString(),
  });
}

export async function loadDraft<T>(
  key: string,
): Promise<{ data: T; savedAt: string } | null> {
  const result = await get<{ data: T; savedAt: string }>(
    `${DRAFT_PREFIX}${key}`,
  );
  return result ?? null;
}

export async function deleteDraft(key: string): Promise<void> {
  await del(`${DRAFT_PREFIX}${key}`);
}

export async function listDraftKeys(): Promise<string[]> {
  const allKeys = await keys();
  return allKeys
    .filter((k) => typeof k === "string" && k.startsWith(DRAFT_PREFIX))
    .map((k) => (k as string).replace(DRAFT_PREFIX, ""));
}

export async function clearAllDrafts(): Promise<void> {
  const draftKeys = await listDraftKeys();
  await Promise.all(draftKeys.map((k) => del(`${DRAFT_PREFIX}${k}`)));
}
