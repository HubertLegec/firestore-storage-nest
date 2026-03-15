import { getApps } from "firebase-admin/app";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createMemoryFirestore } from "../../src/firestore-memory";

/**
 * Returns a Firestore instance for tests.
 * - If FIRESTORE_EMULATOR_HOST is set: uses firebase-admin connected to the emulator (ensures compatibility with real Firestore).
 * - Otherwise: uses in-memory Firestore from @firebase-bridge/firestore-admin.
 */
export function getTestFirestore() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    if (getApps().length === 0) {
      initializeApp({ projectId: "test-project" });
    }
    return getFirestore();
  }
  return createMemoryFirestore();
}
