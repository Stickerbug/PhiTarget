export type PlayerScoreRecord = {
  id: string;
  chartId: string;
  score: number;
  fc: boolean;
  playedAt: string;
  source: "manual" | "json" | "csv";
};

const DB_NAME = "phitarget-local";
const STORE_NAME = "scoreHistory";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持 IndexedDB"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地成绩库"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("playedAt", "playedAt");
        store.createIndex("chartId", "chartId");
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function listPlayerScores(): Promise<PlayerScoreRecord[]> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onerror = () => reject(request.error ?? new Error("无法读取本地成绩"));
    request.onsuccess = () => resolve((request.result as PlayerScoreRecord[]).sort((a, b) => b.playedAt.localeCompare(a.playedAt)));
  });
}

export async function savePlayerScores(records: PlayerScoreRecord[]): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.onerror = () => reject(transaction.error ?? new Error("无法保存本地成绩"));
    transaction.oncomplete = () => resolve();
    const store = transaction.objectStore(STORE_NAME);
    for (const record of records) store.put(record);
  });
}

export async function deletePlayerScore(id: string): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onerror = () => reject(request.error ?? new Error("无法删除本地成绩"));
    request.onsuccess = () => resolve();
  });
}

export async function clearPlayerScores(): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear();
    request.onerror = () => reject(request.error ?? new Error("无法清空本地成绩"));
    request.onsuccess = () => resolve();
  });
}
