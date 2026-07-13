// Offline action queue (§12): "Actions taken offline (mark clean, close
// ticket, claim request) enter a local queue, each with a client-generated
// idempotency key, and replay in order on reconnect."
//
// Deliberately narrow: only single-row `update` patches (every action §12
// names — room status, request/order state — is exactly this shape). A
// plain IndexedDB store, no library — the payload has to be serializable
// anyway (a Supabase client instance/closure isn't), so there's nothing a
// library would meaningfully add here.
//
// Not runtime-tested against a real offline/online browser transition this
// session (that needs browser automation, not just type-checking) — see
// HANDOVER.md. The logic itself (enqueue, ordered replay, dedupe by id) was
// checked by reading it back carefully and matches the spec's stated shape.
import type { SupabaseClient } from "@supabase/supabase-js";

const DB_NAME = "dhop-offline-queue";
const STORE_NAME = "actions";

export interface QueuedAction {
  id: string; // client-generated idempotency key
  table: string;
  filterId: string;
  patch: Record<string, unknown>;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = fn(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueAction(action: Omit<QueuedAction, "id" | "createdAt">): Promise<void> {
  const queued: QueuedAction = { ...action, id: crypto.randomUUID(), createdAt: Date.now() };
  await withStore("readwrite", (store) => store.add(queued));
}

export async function listQueuedActions(): Promise<QueuedAction[]> {
  // Insertion order == replay order — IndexedDB cursors over a keyPath
  // store don't guarantee this on their own, so sort explicitly by
  // createdAt rather than trusting store iteration order.
  const all = await withStore<QueuedAction[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

async function removeQueuedAction(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

// Try the write immediately; if it fails (offline, or a network error even
// when navigator.onLine lied — that flag is a hint, not a guarantee),
// queue it instead of losing it.
export async function executeOrQueue(
  client: SupabaseClient,
  table: string,
  filterId: string,
  patch: Record<string, unknown>,
): Promise<{ queued: boolean; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueueAction({ table, filterId, patch });
    return { queued: true };
  }

  const { error } = await client.from(table).update(patch).eq("id", filterId);
  if (error) {
    await enqueueAction({ table, filterId, patch });
    return { queued: true, error: error.message };
  }
  return { queued: false };
}

// "Replay in order on reconnect" + LWW on status fields (§12) — replaying
// a plain `update` is last-write-wins by construction (whatever the row's
// current state is, this patch just overwrites the named fields), which
// matches the spec's stated default for the boring case. Flagging
// semantically dangerous conflicts (e.g. a room marked clean offline while
// a new stay already activated on it) to a department manager instead of
// silently resolving is NOT built — it needs a way to detect that a
// specific conflict is "dangerous" versus ordinary, which isn't defined
// anywhere in the current schema. Documented as a gap, not implemented.
export async function replayQueue(client: SupabaseClient): Promise<{ succeeded: number; failed: number }> {
  const actions = await listQueuedActions();
  let succeeded = 0;
  let failed = 0;

  for (const action of actions) {
    const { error } = await client.from(action.table).update(action.patch).eq("id", action.filterId);
    if (error) {
      failed += 1;
      continue; // leave it queued, try again next reconnect
    }
    await removeQueuedAction(action.id);
    succeeded += 1;
  }

  return { succeeded, failed };
}
