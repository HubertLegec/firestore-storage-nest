import type { WriteBatch } from "@google-cloud/firestore";
import { Query } from "firestore-storage";
import type { BaseModel, CollectionPath, ModelQuery } from "firestore-storage-core";
import { ModelRepository } from "./model-repository";
import type { ModelTransformer } from "./model-transformer";

type Path = CollectionPath<string, string, void | object>;

/**
 * Entity id type (string).
 * Public API of EntityRepository (save, delete, findById, findAllById, list, query, generateId)
 * is unchanged from master: same method names and signatures for all classes extending it.
 */
export type Id = string;

function getOrderedIdKeys(path: Path | undefined): string[] {
  if (!path) {
    return [];
  }
  const p = path as unknown as { idKey: string; parent?: Path };
  return [...getOrderedIdKeys(p.parent), p.idKey];
}

export interface BulkSaveItem<E> {
  readonly value: E;
  readonly parentIds?: Id[];
}

export interface BulkDeleteItem {
  readonly id: Id;
  readonly parentIds?: Id[];
}

export abstract class EntityRepository<E, M extends BaseModel> {
  // Firestore caps WriteBatch and Transaction commits at 500 operations.
  // https://firebase.google.com/docs/firestore/manage-data/transactions#batched-writes
  private static readonly BATCH_LIMIT = 500;

  protected constructor(
    protected readonly modelRepository: ModelRepository<M, Path>,
    protected readonly modelTransformer: ModelTransformer<E, M>,
  ) {}

  protected getPath(): Path {
    return this.modelRepository.getPath();
  }

  async save(value: E, ...parentIds: Id[]): Promise<E> {
    const model = this.modelTransformer.toModel(value);
    const collectionIds = this.pathToCollectionIds(this.getPath(), [...parentIds]);
    const saved = await this.modelRepository.write(model, collectionIds);
    return this.modelTransformer.fromModel(saved);
  }

  /**
   * Save many entities under a shared parent path in batched commits.
   * Splits into chunks of 500 (Firestore WriteBatch limit). Not atomic across chunks:
   * if commit of a later chunk fails, prior chunks remain persisted.
   * Auto-generated document ids are not surfaced — pre-generate ids via {@link generateId} when needed.
   */
  async bulkSave(values: E[], ...parentIds: Id[]): Promise<void> {
    await this.bulkSaveAll(values.map((value) => ({ value, parentIds })));
  }

  /**
   * Save many entities across potentially different parent paths in batched commits.
   * Use for fan-out writes where each entity lives under a different parent document.
   * Splits into chunks of 500 (Firestore WriteBatch limit). Not atomic across chunks.
   * Auto-generated document ids are not surfaced — pre-generate ids via {@link generateId} when needed.
   */
  async bulkSaveAll(items: BulkSaveItem<E>[]): Promise<void> {
    await this.commitInChunks(items, (batch, { value, parentIds = [] }) => {
      const model = this.modelTransformer.toModel(value);
      const { id, data } = this.modelRepository.toFirestoreDocument(model);
      const docRef = id
        ? this.modelRepository.docRef(this.pathToDocumentIds(this.getPath(), [...parentIds, id]))
        : this.modelRepository.newDocRef(this.pathToCollectionIds(this.getPath(), parentIds));
      batch.set(docRef, data);
    });
  }

  delete(id: Id, ...parentIds: Id[]): Promise<void> {
    const documentIds = this.pathToDocumentIds(this.getPath(), [...parentIds, id]);
    return this.modelRepository.delete(documentIds);
  }

  /**
   * Delete many documents under a shared parent path in batched commits.
   * Splits into chunks of 500 (Firestore WriteBatch limit). Not atomic across chunks.
   */
  async bulkDelete(ids: Id[], ...parentIds: Id[]): Promise<void> {
    await this.bulkDeleteAll(ids.map((id) => ({ id, parentIds })));
  }

  /**
   * Delete many documents across potentially different parent paths in batched commits.
   * Splits into chunks of 500 (Firestore WriteBatch limit). Not atomic across chunks.
   */
  async bulkDeleteAll(items: BulkDeleteItem[]): Promise<void> {
    await this.commitInChunks(items, (batch, { id, parentIds = [] }) => {
      const docRef = this.modelRepository.docRef(this.pathToDocumentIds(this.getPath(), [...parentIds, id]));
      batch.delete(docRef);
    });
  }

  async findById(id: Id, ...parentIds: Id[]): Promise<E | null> {
    const documentIds = this.pathToDocumentIds(this.getPath(), [...parentIds, id]);
    const model = await this.modelRepository.findById(documentIds);
    if (!model || !this.modelCustomFilter(model)) {
      return null;
    }
    return this.modelTransformer.fromModel(model);
  }

  async findAllById(ids: Id[], ...parentIds: Id[]): Promise<E[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    const collectionIds = this.pathToCollectionIds(this.getPath(), [...parentIds]);
    const result = await this.modelRepository.findAll(ids, collectionIds);
    return result
      .filter((m) => !!m)
      .filter((m) => this.modelCustomFilter(m as M))
      .map((m) => this.modelTransformer.fromModel(m as M));
  }

  async list(attributes?: ModelQuery<M>, ...parentIds: Id[]): Promise<E[]> {
    const collectionIds = this.pathToCollectionIds(this.getPath(), [...parentIds]);
    const result = await this.modelRepository.list(attributes ?? null, collectionIds);
    return result.filter((o) => this.modelCustomFilter(o)).map((m) => this.modelTransformer.fromModel(m));
  }

  async listAll(attributes?: ModelQuery<M>, ...parentIds: Id[]): Promise<E[]> {
    const collectionIds = this.pathToCollectionIds(this.getPath(), [...parentIds]);
    const result = await this.modelRepository.list(attributes ?? null, collectionIds);
    return result.map((m) => this.modelTransformer.fromModel(m));
  }

  async query(cb: (qb: Query<M>) => Query<M>, ...parentIds: Id[]): Promise<E[]> {
    const collectionIds = this.pathToCollectionIds(this.getPath(), [...parentIds]);
    const result = await this.modelRepository.query(cb, collectionIds);
    return result
      .filter((m) => !!m)
      .filter((m) => this.modelCustomFilter(m))
      .map((m) => this.modelTransformer.fromModel(m));
  }

  generateId() {
    return this.modelRepository.generateId();
  }

  /** Override in subclasses to filter out models (e.g. deleted). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected modelCustomFilter(_model: M): boolean {
    return true;
  }

  /**
   * Slice `items` into BATCH_LIMIT-sized chunks and commit each chunk in its own WriteBatch.
   * Empty input is a no-op. Not atomic across chunks.
   */
  private async commitInChunks<T>(items: T[], applyToBatch: (batch: WriteBatch, item: T) => void): Promise<void> {
    for (let start = 0; start < items.length; start += EntityRepository.BATCH_LIMIT) {
      const chunk = items.slice(start, start + EntityRepository.BATCH_LIMIT);
      await this.modelRepository.withBatch((batch) => {
        for (const item of chunk) {
          applyToBatch(batch, item);
        }
      });
    }
  }

  /**
   * Build CollectionIds object from path and parent id values (no document id).
   */
  protected pathToCollectionIds(path: Path, ids: string[]): Record<string, string> {
    const { parent } = path as unknown as { parent?: Path };
    return this.pathToDocumentIds(parent as Path, ids);
  }

  /**
   * Build DocumentIds object from path and ordered id values (root to leaf).
   * Depends on firestore-storage-core CollectionPath shape (idKey, parent); see getOrderedIdKeys.
   */
  protected pathToDocumentIds(path: Path | undefined, ids: string[]): Record<string, string> {
    const keys = getOrderedIdKeys(path);
    return Object.fromEntries(keys.map((k, i) => [k, ids[i] ?? ""]));
  }
}
