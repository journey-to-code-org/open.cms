import type { SavedOuting } from "./domain";
import type { HikeDiscovery } from "./hikes";

const databases = new Map<string, Promise<IDBDatabase>>();

function openDatabase(siteId: string): Promise<IDBDatabase> {
  if (!databases.has(siteId)) {
    const database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`open-cms-${siteId}`, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("outings")) request.result.createObjectStore("outings", { keyPath: "id" });
        if (!request.result.objectStoreNames.contains("discovery")) request.result.createObjectStore("discovery");
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          databases.delete(siteId);
        };
        resolve(request.result);
      };
      request.onerror = () => reject(new Error("Cannot open local storage. Your browser may block saved outings."));
      request.onblocked = () => reject(new Error("Local storage upgrade is blocked. Close other app tabs and retry."));
    });
    databases.set(siteId, database);
  }

  return databases.get(siteId)!;
}

export async function readDiscovery(siteId: string): Promise<HikeDiscovery | undefined> {
  const db = await openDatabase(siteId);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("discovery", "readonly");
    const request = transaction.objectStore("discovery").get(siteId);
    transaction.oncomplete = () => resolve(request.result as HikeDiscovery | undefined);
    transaction.onerror = () => reject(new Error("Could not read cached hike discovery."));
    transaction.onabort = () => reject(new Error("Reading cached hikes was interrupted."));
  });
}

export async function writeDiscovery(siteId: string, result: HikeDiscovery): Promise<void> {
  const db = await openDatabase(siteId);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("discovery", "readwrite");
    transaction.objectStore("discovery").put(result, siteId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error("Hikes were fetched but could not be cached on this device."));
    transaction.onabort = () => reject(new Error("Caching hikes failed. Check available browser storage."));
  });
}
export async function readOutings(siteId: string): Promise<SavedOuting[]> {
  const db = await openDatabase(siteId);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("outings", "readonly");
    const request = transaction.objectStore("outings").getAll();
    transaction.oncomplete = () => resolve(request.result as SavedOuting[]);
    transaction.onerror = () => reject(new Error("Could not read saved outings."));
    transaction.onabort = () => reject(new Error("Reading saved outings was interrupted."));
  });
}

export async function writeOuting(siteId: string, outing: SavedOuting): Promise<void> {
  const db = await openDatabase(siteId);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("outings", "readwrite");
    transaction.objectStore("outings").put(outing);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error("Could not save this outing. Check available browser storage."));
    transaction.onabort = () => reject(new Error("Saving failed. Check available browser storage."));
  });
}

export async function removeOuting(siteId: string, id: string): Promise<void> {
  const db = await openDatabase(siteId);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("outings", "readwrite");
    transaction.objectStore("outings").delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error("Could not remove the saved outing."));
    transaction.onabort = () => reject(new Error("Removing the outing was interrupted."));
  });
}
