/**
 * Browser-side record of a transferred brochure awaiting authenticated finalization.
 *
 * It lets an administrator resume finalization in the same tab after an interruption. It never
 * extends an authorization: the server enforces expiry, consumption, and identity binding, and
 * `expiresAt` here only hides a resume action that could no longer succeed.
 */
export type PendingBrochureFinalization = {
  pendingBrochureId: string;
  secret: string;
  expiresAt: string;
};

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_PATTERN = /^[a-f0-9]{64}$/;

/** Responses after which retrying the same authorization can never succeed. */
const TERMINAL_FINALIZATION_STATUSES = new Set([400, 409]);

const listeners = new Set<() => void>();

function storageKey(sessionId: string) {
  return `bakanel:brochure-finalization:${sessionId}`;
}

function notifyListeners() {
  for (const listener of listeners) listener();
}

/** Subscription for `useSyncExternalStore`, covering this tab's own writes. */
export function subscribePendingFinalization(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Raw stored value, used as a stable `useSyncExternalStore` snapshot. */
export function readStoredFinalization(storage: KeyValueStorage, sessionId: string) {
  try {
    return storage.getItem(storageKey(sessionId));
  } catch {
    return null;
  }
}

/** Validates the stored shape only; expiry is checked when the administrator acts on it. */
export function parsePendingFinalization(
  stored: string | null,
): PendingBrochureFinalization | null {
  let candidate: Record<string, unknown> | null;

  try {
    candidate = JSON.parse(stored ?? "null") as Record<string, unknown> | null;
  } catch {
    return null;
  }

  if (
    !candidate ||
    typeof candidate.pendingBrochureId !== "string" ||
    !UUID_PATTERN.test(candidate.pendingBrochureId) ||
    typeof candidate.secret !== "string" ||
    !SECRET_PATTERN.test(candidate.secret) ||
    typeof candidate.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.expiresAt))
  ) {
    return null;
  }

  return {
    pendingBrochureId: candidate.pendingBrochureId,
    secret: candidate.secret,
    expiresAt: candidate.expiresAt,
  };
}

export function savePendingFinalization(
  storage: KeyValueStorage,
  sessionId: string,
  record: PendingBrochureFinalization,
) {
  try {
    storage.setItem(storageKey(sessionId), JSON.stringify(record));
  } catch {
    // Recovery is a convenience; finalization proceeds without it.
  }
  notifyListeners();
}

export function clearPendingFinalization(storage: KeyValueStorage, sessionId: string) {
  try {
    storage.removeItem(storageKey(sessionId));
  } catch {
    // Nothing to clear when storage is unavailable.
  }
  notifyListeners();
}

/** Returns a usable record, discarding one that is malformed or already expired. */
export function readPendingFinalization(
  storage: KeyValueStorage,
  sessionId: string,
  now: Date,
): PendingBrochureFinalization | null {
  const stored = readStoredFinalization(storage, sessionId);

  if (stored === null) {
    return null;
  }

  const record = parsePendingFinalization(stored);

  if (!record || Date.parse(record.expiresAt) <= now.getTime()) {
    clearPendingFinalization(storage, sessionId);
    return null;
  }

  return record;
}

export function isTerminalFinalizationStatus(status: number) {
  return TERMINAL_FINALIZATION_STATUSES.has(status);
}
