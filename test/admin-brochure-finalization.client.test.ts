import { describe, expect, it, vi } from "vitest";

import {
  clearPendingFinalization,
  isTerminalFinalizationStatus,
  parsePendingFinalization,
  readPendingFinalization,
  readStoredFinalization,
  savePendingFinalization,
  subscribePendingFinalization,
} from "@/lib/admin/brochure-finalization.client";

const sessionId = "123e4567-e89b-12d3-a456-426614174000";
const otherSessionId = "123e4567-e89b-12d3-a456-426614174999";
const now = new Date("2026-11-23T12:00:00.000Z");
const record = {
  pendingBrochureId: "123e4567-e89b-12d3-a456-426614174001",
  secret: "d".repeat(64),
  expiresAt: "2026-11-23T12:04:00.000Z",
};

function memoryStorage() {
  const values = new Map<string, string>();

  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("interrupted brochure finalization record", () => {
  it("offers a saved, unexpired transfer for resumption in the same session only", () => {
    const storage = memoryStorage();

    savePendingFinalization(storage, sessionId, record);

    expect(readPendingFinalization(storage, sessionId, now)).toEqual(record);
    expect(readPendingFinalization(storage, otherSessionId, now)).toBeNull();
  });

  it("discards an expired record instead of offering a resume that cannot succeed", () => {
    const storage = memoryStorage();
    savePendingFinalization(storage, sessionId, record);

    const afterExpiry = new Date("2026-11-23T12:04:00.000Z");

    expect(readPendingFinalization(storage, sessionId, afterExpiry)).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it("discards malformed or tampered records", () => {
    const storage = memoryStorage();
    const key = `bakanel:brochure-finalization:${sessionId}`;
    const tampered = [
      "not json",
      JSON.stringify({ ...record, secret: "short" }),
      JSON.stringify({ ...record, pendingBrochureId: "../other" }),
      JSON.stringify({ ...record, expiresAt: "never" }),
    ];

    for (const value of tampered) {
      storage.setItem(key, value);
      expect(readPendingFinalization(storage, sessionId, now)).toBeNull();
      expect(storage.values.has(key)).toBe(false);
    }
  });

  it("clears the record after confirmation", () => {
    const storage = memoryStorage();
    savePendingFinalization(storage, sessionId, record);

    clearPendingFinalization(storage, sessionId);

    expect(readPendingFinalization(storage, sessionId, now)).toBeNull();
  });

  it("degrades safely when browser storage is unavailable", () => {
    const unavailable = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(() => savePendingFinalization(unavailable, sessionId, record)).not.toThrow();
    expect(readPendingFinalization(unavailable, sessionId, now)).toBeNull();
  });

  it("keeps the resume action only for retryable finalization failures", () => {
    expect(isTerminalFinalizationStatus(400)).toBe(true);
    expect(isTerminalFinalizationStatus(409)).toBe(true);
    expect(isTerminalFinalizationStatus(401)).toBe(false);
    expect(isTerminalFinalizationStatus(404)).toBe(false);
    expect(isTerminalFinalizationStatus(429)).toBe(false);
    expect(isTerminalFinalizationStatus(503)).toBe(false);
  });

  it("exposes a stable raw snapshot and notifies subscribers of this tab's writes", () => {
    const storage = memoryStorage();
    const listener = vi.fn();
    const unsubscribe = subscribePendingFinalization(listener);

    savePendingFinalization(storage, sessionId, record);
    const snapshot = readStoredFinalization(storage, sessionId);
    clearPendingFinalization(storage, sessionId);
    unsubscribe();
    savePendingFinalization(storage, sessionId, record);

    expect(snapshot).toBe(JSON.stringify(record));
    expect(parsePendingFinalization(snapshot)).toEqual(record);
    expect(parsePendingFinalization(null)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
