/**
 * Testing utilities for FirestoreStorageNestModule.
 * Consumers pass useFactory that returns in-memory Firestore.
 */
import type { Firestore, QueryDocumentSnapshot } from "@google-cloud/firestore";
import { DynamicModule, Inject, Injectable } from "@nestjs/common";
import { FIRESTORE, FirestoreStorageNestModule } from "./core";

/** Interface for test helper that clears a collection by path. */
export interface TestFirestoreClear {
  clear(path: string): Promise<void>;
}

@Injectable()
export class TestFirestoreClearService implements TestFirestoreClear {
  constructor(@Inject(FIRESTORE) private readonly firestore: Firestore) {}

  async clear(path: string): Promise<void> {
    const col = this.firestore.collection(path);
    let docs: Array<QueryDocumentSnapshot> = [];
    try {
      const snapshot = await col.get();
      docs = snapshot.docs ?? [];
    } catch (err) {
      if (err instanceof TypeError && String((err as Error).message).includes("undefined or null")) {
        return;
      }
      throw err;
    }
    for (const doc of docs) {
      await doc.ref.delete();
    }
  }
}

export interface WithMemoryStorageOptions {
  useFactory: () => Firestore;
}

export function withMemoryStorage(options: WithMemoryStorageOptions): DynamicModule {
  return {
    module: FirestoreStorageNestModule,
    global: false,
    providers: [{ provide: FIRESTORE, useFactory: options.useFactory }, TestFirestoreClearService],
    exports: [FIRESTORE, TestFirestoreClearService],
  };
}
