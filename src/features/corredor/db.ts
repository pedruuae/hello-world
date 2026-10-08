import { emptyData, validate, type Data } from "./model";
let dbPromise: Promise<IDBDatabase> | undefined;
export function openDatabase() {
  if (!dbPromise)
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(
          new Error("Este navegador não oferece IndexedDB. Use uma versão mais recente do Chrome."),
        );
        return;
      }
      const request = indexedDB.open("meu-corredor", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("data");
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Feche as outras abas do Meu Corredor e tente novamente."));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      dbPromise = undefined;
      throw error;
    });
  return dbPromise;
}
export async function readData(): Promise<Data> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("data", "readonly");
    const r = tx.objectStore("data").get("state");
    r.onsuccess = () => {
      try {
        resolve(r.result ? validate(r.result) : emptyData());
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
  });
}
// One read-modify-write transaction serializes writes across browser tabs.
// UI is updated only after oncomplete, never after the put request alone.
export async function changeData(
  change: (d: Data) => void,
  expectedRevision: number,
): Promise<Data> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("data", "readwrite"),
      store = tx.objectStore("data");
    let next: Data;
    let problem: unknown;
    const request = store.get("state");
    request.onsuccess = () => {
      try {
        next = request.result ? validate(request.result) : emptyData();
        if (next.revision !== expectedRevision)
          throw new Error(
            "Os dados mudaram em outra aba. Feche este formulário e confira a lista atualizada antes de tentar novamente.",
          );
        change(next);
        next.revision += 1;
        next = validate(next);
        store.put(next, "state");
      } catch (e) {
        problem = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () =>
      reject(
        problem ||
          tx.error ||
          new Error("Não foi possível gravar. Verifique o espaço livre e tente novamente."),
      );
    tx.onerror = () => {
      problem ||= tx.error;
    };
  });
}
