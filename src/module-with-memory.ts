/**
 * FirestoreStorageNestModule with built-in withMemoryStorage() using createMemoryFirestore.
 * Re-exported as FirestoreStorageNestModule from the package.
 */
import type { Firestore } from "@google-cloud/firestore";
import { FirestoreStorageNestModule as BaseModule } from "./core";
import { createMemoryFirestore } from "./firestore-memory";
import { withMemoryStorage } from "./testing";

export class FirestoreStorageNestModule extends BaseModule {
  /** In-memory Firestore for tests; uses @firebase-bridge/firestore-admin. No emulator required. */
  static withMemoryStorage() {
    return withMemoryStorage({
      useFactory: (): Firestore => createMemoryFirestore(),
    });
  }
}
