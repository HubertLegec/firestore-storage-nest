import type { DocumentReference, DocumentSnapshot, Transaction, WriteBatch } from "@google-cloud/firestore";
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
   * Stage a write of `value` on the given transaction; it is persisted when the transaction commits.
   * Overwrites any existing document with the same id. Firestore requires all transaction reads to
   * precede writes, so call this after any {@link findByIdInTransaction} calls.
   * Auto-generated document ids are not surfaced — pre-generate ids via {@link generateId} when needed.
   */
  saveInTransaction(transaction: Transaction, value: E, ...parentIds: Id[]): void {
    const { id, data } = this.modelRepository.toFirestoreDocument(this.modelTransformer.toModel(value));
    transaction.set(this.documentReference(id, parentIds), data);
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
      const { id, data } = this.modelRepository.toFirestoreDocument(this.modelTransformer.toModel(value));
      batch.set(this.documentReference(id, parentIds), data);
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
      batch.delete(this.documentReferenceById(id, parentIds));
    });
  }

  async findById(id: Id, ...parentIds: Id[]): Promise<E | null> {
    const model = await this.findModelById(id, parentIds);
    if (!model || !this.modelCustomFilter(model)) {
      return null;
    }
    return this.modelTransformer.fromModel(model);
  }

  /**
   * Read an entity as part of the given transaction, so the transaction fails over (retries) if the
   * document changes before commit. Returns `null` when the document is missing or rejected by
   * {@link modelCustomFilter}.
   */
  async findByIdInTransaction(transaction: Transaction, id: Id, ...parentIds: Id[]): Promise<E | null> {
    const snapshot = await transaction.get(this.documentReferenceById(id, parentIds));
    if (!snapshot.exists) {
      return null;
    }
    const model = this.modelRepository.fromFirestoreToObject(snapshot as DocumentSnapshot<M>);
    if (!this.modelCustomFilter(model)) {
      return null;
    }
    return this.modelTransformer.fromModel(model);
  }

  async findAllById(ids: Id[], ...parentIds: Id[]): Promise<E[]> {
    const models = await this.findAllModelsById(ids, parentIds);
    return this.toEntities(models.filter((model) => this.modelCustomFilter(model)));
  }

  async list(attributes?: ModelQuery<M>, ...parentIds: Id[]): Promise<E[]> {
    const models = await this.listModels(attributes, parentIds);
    return this.toEntities(models.filter((model) => this.modelCustomFilter(model)));
  }

  async listAll(attributes?: ModelQuery<M>, ...parentIds: Id[]): Promise<E[]> {
    return this.toEntities(await this.listModels(attributes, parentIds));
  }

  async query(cb: (qb: Query<M>) => Query<M>, ...parentIds: Id[]): Promise<E[]> {
    const models = await this.queryModels(cb, parentIds);
    return this.toEntities(models.filter((model) => this.modelCustomFilter(model)));
  }

  generateId() {
    return this.modelRepository.generateId();
  }

  /** Override in subclasses to filter out models (e.g. deleted). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected modelCustomFilter(_model: M): boolean {
    return true;
  }

  /** Read the model with `id` under the given parents, unfiltered. `null` when the document is missing. */
  protected findModelById(id: Id, parentIds: Id[]): Promise<M | null> {
    return this.modelRepository.findById(this.pathToDocumentIds(this.getPath(), [...parentIds, id]));
  }

  /**
   * Read the models with the given ids under the given parents, unfiltered. Missing documents are left out.
   * Empty `ids` resolves to `[]` without a read.
   */
  protected async findAllModelsById(ids: Id[], parentIds: Id[]): Promise<M[]> {
    if (ids.length === 0) {
      return [];
    }
    const models = await this.modelRepository.findAll(ids, this.pathToCollectionIds(this.getPath(), parentIds));
    return models.filter((model): model is M => model !== null);
  }

  /** List the models matching `attributes` (all when absent) under the given parents, unfiltered. */
  protected listModels(attributes: ModelQuery<M> | undefined, parentIds: Id[]): Promise<M[]> {
    return this.modelRepository.list(attributes ?? null, this.pathToCollectionIds(this.getPath(), parentIds));
  }

  /** Run the query built by `cb` in the collection under the given parents, unfiltered. */
  protected queryModels(cb: (qb: Query<M>) => Query<M>, parentIds: Id[]): Promise<M[]> {
    return this.modelRepository.query(cb, this.pathToCollectionIds(this.getPath(), parentIds));
  }

  /** Map models to entities with the repository's transformer. Applies no filter. */
  protected toEntities(models: M[]): E[] {
    return models.map((model) => this.modelTransformer.fromModel(model));
  }

  /**
   * Slice `items` into BATCH_LIMIT-sized chunks and commit each chunk in its own WriteBatch.
   * Empty input is a no-op. Not atomic across chunks.
   */
  protected async commitInChunks<T>(items: T[], applyToBatch: (batch: WriteBatch, item: T) => void): Promise<void> {
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
   * Reference to the document with `id` under the given parents, or a fresh auto-id reference
   * in the parent collection when `id` is absent.
   */
  private documentReference(id: Id | undefined, parentIds: Id[]): DocumentReference {
    if (id) {
      return this.documentReferenceById(id, parentIds);
    }
    return this.modelRepository.newDocRef(this.pathToCollectionIds(this.getPath(), parentIds));
  }

  /** Reference to the document with `id` under the given parents, whether or not it exists. */
  protected documentReferenceById(id: Id, parentIds: Id[]): DocumentReference {
    return this.modelRepository.docRef(this.pathToDocumentIds(this.getPath(), [...parentIds, id]));
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
