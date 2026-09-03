import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  enableNetwork,
  disableNetwork
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with robust multi-tab offline persistence
let db: ReturnType<typeof getFirestore>;

const databaseId = (firebaseConfig as any).firestoreDatabaseId || undefined;

try {
  db = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    },
    databaseId
  );
} catch (e) {
  // If already initialized, get instance with specified databaseId
  db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export const auth = getAuth(app);
export const storage = getStorage(app);
export { db, enableNetwork, disableNetwork };

// Device ID management for offline transaction idempotency
export function getDeviceId(): string {
  let deviceId = localStorage.getItem('pos_device_id');
  if (!deviceId) {
    deviceId = 'POS-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem('pos_device_id', deviceId);
  }
  return deviceId;
}

export function generateUUID(): string {
  return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Removes all undefined properties recursively from objects/arrays 
 * to prevent Firestore "Unsupported field value: undefined" errors.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}
