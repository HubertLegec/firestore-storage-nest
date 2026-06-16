import type { DocumentReference, WriteBatch } from "@google-cloud/firestore";
import { BaseRepository } from "firestore-storage";
import type { BaseModel, CollectionIds, CollectionPath, DocumentIds } from "firestore-storage-core";

/**
 * Drop-in replacement for upstream `firestore-storage`'s `BaseRepository`. Adds batch and document
 * reference helpers that delegate to the protected Firestore instance owned by the upstream class,
 * so callers never need to reach into protected state. Extend this from your `*-model.repository.ts`
 * files instead of upstream's `BaseRepository`.
 */
export abstract class ModelRepository<
  T extends BaseModel,
  Path extends CollectionPath<string, string, void | object>,
> extends BaseRepository<T, Path> {
  /**
   * Runs `work` against a freshly created Firestore {@link WriteBatch} and commits it on success.
   * The caller adds operations inside the callback; the batch lifecycle is owned here. Firestore
   * caps a batch at 500 operations — callers writing more must split the work themselves.
   */
  async withBatch(work: (batch: WriteBatch) => void | Promise<void>): Promise<void> {
    const batch = this.firestore.batch();
    await work(batch);
    await batch.commit();
  }

  /** Returns a {@link DocumentReference} for an existing document path. */
  docRef(ids: DocumentIds<Path>): DocumentReference {
    return this.firestore.doc(this.getDocumentPath(ids));
  }

  /** Returns a {@link DocumentReference} with a freshly generated id under the given collection. */
  newDocRef(ids: CollectionIds<Path>): DocumentReference {
    return this.firestore.collection(this.getCollectionPath(ids)).doc();
  }
}
