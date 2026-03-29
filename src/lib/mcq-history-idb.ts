import type { EvaluateSuccess } from "@/lib/mcq-evaluate-success";

const DB_NAME = "cognitive-mcq-analyzer-history";
const DB_VERSION = 1;
const STORE_NAME = "sessions";
const SOURCE_PREVIEW_CHARS = 80;

export type McqHistorySession = {
  id: string;
  savedAt: string;
  sourceLabel: string;
  success: EvaluateSuccess;
  pdfOmitted?: boolean;
};

export function isMcqHistoryIdbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function deriveMcqHistorySourceLabel({
  pdfFileName,
  pastedText,
}: {
  pdfFileName: string | null;
  pastedText: string;
}): string {
  if (pdfFileName !== null && pdfFileName.length > 0) {
    return pdfFileName;
  }
  const t = pastedText.trim();
  if (t.length === 0) {
    return "Pasted text";
  }
  const collapsed = t.replace(/\s+/g, " ");
  if (collapsed.length <= SOURCE_PREVIEW_CHARS) {
    return collapsed;
  }
  return `${collapsed.slice(0, SOURCE_PREVIEW_CHARS)}…`;
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
  });
}

function idbTransactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    };
  });
}

function isQuotaExceededError(err: unknown): boolean {
  if (err instanceof DOMException) {
    if (err.name === "QuotaExceededError") {
      return true;
    }
    if (err.code === 22) {
      return true;
    }
  }
  return false;
}

export function openMcqHistoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      reject(request.error ?? new Error("Could not open IndexedDB"));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

/** Deletes one session with the earliest savedAt. Returns false if the store was empty. */
async function deleteOldestSession(db: IDBDatabase): Promise<boolean> {
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const all = (await idbRequest(store.getAll())) as McqHistorySession[];
  if (all.length === 0) {
    await idbTransactionComplete(tx);
    return false;
  }
  const sortedOldestFirst = [...all].sort((a, b) => {
    return a.savedAt.localeCompare(b.savedAt);
  });
  const oldest = sortedOldestFirst[0];
  if (oldest === undefined) {
    await idbTransactionComplete(tx);
    return false;
  }
  store.delete(oldest.id);
  await idbTransactionComplete(tx);
  return true;
}

async function putRecord(
  db: IDBDatabase,
  record: McqHistorySession,
): Promise<void> {
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(record);
  await idbTransactionComplete(tx);
}

/**
 * Inserts a record, evicting the oldest existing session on each quota error until it fits
 * or nothing is left to remove.
 */
async function putWithOldestEvictionOnQuota(
  db: IDBDatabase,
  record: McqHistorySession,
): Promise<void> {
  for (;;) {
    try {
      await putRecord(db, record);
      return;
    } catch (err) {
      if (!isQuotaExceededError(err)) {
        throw err;
      }
      const removed = await deleteOldestSession(db);
      if (!removed) {
        throw err;
      }
    }
  }
}

export async function listMcqHistorySessions(): Promise<McqHistorySession[]> {
  if (!isMcqHistoryIdbAvailable()) {
    return [];
  }
  const db = await openMcqHistoryDb();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const all = (await idbRequest(store.getAll())) as McqHistorySession[];
    await idbTransactionComplete(tx);
    return [...all].sort((a, b) => {
      return b.savedAt.localeCompare(a.savedAt);
    });
  } finally {
    db.close();
  }
}

export async function deleteMcqHistorySession(id: string): Promise<void> {
  if (!isMcqHistoryIdbAvailable()) {
    return;
  }
  const db = await openMcqHistoryDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    await idbTransactionComplete(tx);
  } finally {
    db.close();
  }
}

export async function addMcqHistorySession({
  sourceLabel,
  success,
}: {
  sourceLabel: string;
  success: EvaluateSuccess;
}): Promise<{ pdfOmitted: boolean }> {
  if (!isMcqHistoryIdbAvailable()) {
    return { pdfOmitted: false };
  }
  const db = await openMcqHistoryDb();
  try {
    const id = crypto.randomUUID();
    const savedAt = new Date().toISOString();
    let pdfOmitted = false;

    const fullRecord: McqHistorySession = {
      id,
      savedAt,
      sourceLabel,
      success,
    };

    try {
      await putWithOldestEvictionOnQuota(db, fullRecord);
    } catch (err) {
      if (!isQuotaExceededError(err)) {
        throw err;
      }
      pdfOmitted = true;
      const withoutPdf: McqHistorySession = {
        id,
        savedAt,
        sourceLabel,
        success: {
          ...success,
          pdfBase64: "",
        },
        pdfOmitted: true,
      };
      await putWithOldestEvictionOnQuota(db, withoutPdf);
    }

    return { pdfOmitted };
  } finally {
    db.close();
  }
}
