import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

let _app: App | null = null;

function projectId(): string | undefined {
  return process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
}

function bucket(): string | undefined {
  return (
    process.env.FIREBASE_ADMIN_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  );
}

export function adminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY &&
      projectId(),
  );
}

export function adminApp(): App | null {
  if (_app) return _app;
  if (!adminConfigured()) return null;
  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0]!;
    return _app;
  }
  _app = initializeApp({
    credential: cert({
      projectId: projectId(),
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
    storageBucket: bucket(),
    projectId: projectId(),
  });
  return _app;
}

export function adminDb(): Firestore | null {
  const app = adminApp();
  return app ? getFirestore(app) : null;
}

export function adminStorage(): Storage | null {
  const app = adminApp();
  return app ? getStorage(app) : null;
}
