import * as React from "react";
import type { ActivityToastKind } from "@/lib/activity-toast";
import type { ToastChip } from "@/hooks/use-toast";

/**
 * BlackPebble notification center store (Phase 3B) — localStorage only.
 *
 * A tiny module-level store (same pattern as use-toast) that persists ME-scoped
 * activity notifications per user in localStorage. It is intentionally frontend
 * -only: no backend table, no schema, no API. The item shape is designed to map
 * cleanly onto a durable notifications table later — swap the persistence layer
 * and keep everything else.
 *
 * Silent baseline: notifications are only ever created via pushNotification(),
 * which is called from the same ME-scoped toast paths as Phase 3A (fills, my
 * milestones/liquidation, my manual buys/sells). Historical backlog is never
 * replayed — persisted items are prior real notifications and are simply shown.
 */

export interface NotificationItem {
  id: string;
  /** Drives icon + semantic accent (shared with the toast system). */
  kind: ActivityToastKind;
  title: string;
  description?: string;
  /** Unix ms. */
  timestamp: number;
  read: boolean;
  tokenSymbol?: string | null;
  tokenLogo?: string | null;
  pfp?: string | null;
  chips?: ToastChip[];
  /** Optional in-app link target for a future "View" affordance. */
  href?: string | null;
  /** The originating activity id used for cross-refresh dedupe. */
  sourceActivityId?: string | null;
}

const MAX_ITEMS = 50;
const keyFor = (uid: string) => `blackpebble.notifications.v1.${uid}`;

interface State {
  items: NotificationItem[];
}

let currentUid = "guest";
let memoryState: State = { items: [] };
const listeners = new Set<(s: State) => void>();

let idCounter = 0;
function genId(): string {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now().toString(36)}-${idCounter}`;
}

function load(uid: string): NotificationItem[] {
  try {
    const raw = localStorage.getItem(keyFor(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw) as NotificationItem[];
    return Array.isArray(arr) ? arr.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(keyFor(currentUid), JSON.stringify(memoryState.items));
  } catch {
    // Non-fatal: notifications degrade to in-memory for this session.
  }
}

function emit() {
  for (const l of listeners) l(memoryState);
}

/**
 * Point the store at a user (or "guest"). Loads that user's persisted items.
 * Called from a shell hook whenever the signed-in user changes.
 */
export function setActiveNotificationUser(uid: string | null) {
  const next = uid ?? "guest";
  if (next === currentUid && memoryState.items.length >= 0) {
    // Same user: ensure we've loaded at least once.
  }
  currentUid = next;
  memoryState = { items: load(currentUid) };
  emit();
}

export type PushInput = Omit<NotificationItem, "id" | "timestamp" | "read"> & {
  timestamp?: number;
};

/**
 * Add a notification. Deduped by `sourceActivityId` (when provided) so a toast
 * that re-fires, or a persisted item, never creates a duplicate.
 */
export function pushNotification(input: PushInput): void {
  if (
    input.sourceActivityId &&
    memoryState.items.some((i) => i.sourceActivityId === input.sourceActivityId)
  ) {
    return;
  }
  const item: NotificationItem = {
    ...input,
    id: genId(),
    timestamp: input.timestamp ?? Date.now(),
    read: false,
  };
  memoryState = {
    items: [item, ...memoryState.items].slice(0, MAX_ITEMS),
  };
  persist();
  emit();
}

export interface UpsertOptions {
  /**
   * When a rollup grows meaningfully, re-surface a previously read item as
   * unread. Left false, updates are silent (chips/title refresh only).
   */
  resurfaceUnread?: boolean;
}

/**
 * Create-or-update a notification keyed by `sourceActivityId`. Used by rollups
 * (e.g. reaction aggregates) so repeated growth updates ONE item in place
 * instead of stacking duplicates. Any update moves the item to the top.
 */
export function upsertNotification(
  input: PushInput & { sourceActivityId: string },
  opts: UpsertOptions = {},
): void {
  const idx = memoryState.items.findIndex(
    (i) => i.sourceActivityId === input.sourceActivityId,
  );
  if (idx === -1) {
    // First sighting → create like a normal push (unread by default).
    const item: NotificationItem = {
      ...input,
      id: genId(),
      timestamp: input.timestamp ?? Date.now(),
      read: false,
    };
    memoryState = { items: [item, ...memoryState.items].slice(0, MAX_ITEMS) };
    persist();
    emit();
    return;
  }
  const existing = memoryState.items[idx];
  const updated: NotificationItem = {
    ...existing,
    kind: input.kind,
    title: input.title,
    description: input.description,
    chips: input.chips,
    tokenSymbol: input.tokenSymbol ?? existing.tokenSymbol,
    tokenLogo: input.tokenLogo ?? existing.tokenLogo,
    pfp: input.pfp ?? existing.pfp,
    href: input.href ?? existing.href,
    timestamp: input.timestamp ?? Date.now(),
    read: opts.resurfaceUnread ? false : existing.read,
  };
  const rest = memoryState.items.filter((_, i) => i !== idx);
  memoryState = { items: [updated, ...rest].slice(0, MAX_ITEMS) };
  persist();
  emit();
}

export function markNotificationRead(id: string): void {
  memoryState = {
    items: memoryState.items.map((i) => (i.id === id ? { ...i, read: true } : i)),
  };
  persist();
  emit();
}

export function markAllNotificationsRead(): void {
  memoryState = {
    items: memoryState.items.map((i) => (i.read ? i : { ...i, read: true })),
  };
  persist();
  emit();
}

export function removeNotification(id: string): void {
  memoryState = { items: memoryState.items.filter((i) => i.id !== id) };
  persist();
  emit();
}

export function clearAllNotifications(): void {
  memoryState = { items: [] };
  persist();
  emit();
}

export interface UseNotifications {
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
}

export function useNotifications(): UseNotifications {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.add(setState);
    // Sync in case the store changed between render and subscribe.
    setState(memoryState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  const unreadCount = state.items.reduce((n, i) => n + (i.read ? 0 : 1), 0);
  return {
    items: state.items,
    unreadCount,
    markRead: markNotificationRead,
    markAllRead: markAllNotificationsRead,
    remove: removeNotification,
    clearAll: clearAllNotifications,
  };
}
