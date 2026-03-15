/**
 * In-memory Firestore for tests. Uses @firebase-bridge/firestore-admin (Apache-2.0).
 * Returns a real Firestore instance compatible with firebase-admin.
 */
import type { Firestore } from "@google-cloud/firestore";
import { FirestoreMock } from "@firebase-bridge/firestore-admin";

export function createMemoryFirestore(): Firestore {
  const env = new FirestoreMock();
  return env.createDatabase().firestore();
}
