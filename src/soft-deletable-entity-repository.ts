import type { Query } from "firestore-storage";
import type { BaseModel, ModelQuery } from "firestore-storage-core";
import { EntityRepository, type BulkDeleteItem, type Id } from "./entity-repository";

/** A model that can be soft-deleted: the document stays, flagged as deleted. */
export interface SoftDeletableModel extends BaseModel {
  /** True once the document is soft-deleted. A missing field means the document is active. */
  deleted?: boolean;
}

/** The update that soft-deletes a document; typed against the model so the field name can't drift. */
const SOFT_DELETE: Required<Pick<SoftDeletableModel, "deleted">> = { deleted: true };

/**
 * gRPC status Firestore reports when `update` targets a missing document. Mirrors `GrpcStatus.NOT_FOUND` from
 * `@google-cloud/firestore`, which exists only in its typings and can't be read at runtime.
 */
const GRPC_NOT_FOUND = 5;

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === GRPC_NOT_FOUND;
}

/**
 * Entity repository whose `delete` methods soft-delete: they set `deleted: true` on the document instead of
 * removing it. Reads inherited from {@link EntityRepository} (`findById`, `findAllById`, `list`, `query`,
 * `findByIdInTransaction`) leave deleted documents out; the `…IncludingDeleted` reads return them too.
 * The `…HardDelete…` methods remove documents for good, whether or not they are soft-deleted.
 *
 * Deleted documents are filtered out in memory, after they are read, so they still count towards Firestore reads
 * and billing. A `where("deleted", "!=", true)` query can't replace the filter: Firestore also drops documents that
 * have no `deleted` field, and those count as active.
 *
 * `bulkDelete` goes through {@link bulkDeleteAll}, so both soft-delete.
 */
export abstract class SoftDeletableEntityRepository<E, M extends SoftDeletableModel> extends EntityRepository<E, M> {
  /**
   * Soft-delete: set `deleted: true` on the document and leave every other field as it is.
   * A missing document is a no-op; no document is created.
   */
  override async delete(id: Id, ...parentIds: Id[]): Promise<void> {
    try {
      await this.documentReferenceById(id, parentIds).update(SOFT_DELETE);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  /**
   * Soft-delete many documents across potentially different parent paths in batched commits of 500
   * (Firestore WriteBatch limit). Not atomic across chunks. No document is created or removed.
   *
   * Pass ids of existing documents only: a missing document fails the commit of its whole chunk, leaving that
   * chunk's documents unchanged (earlier chunks stay committed).
   */
  override async bulkDeleteAll(items: BulkDeleteItem[]): Promise<void> {
    await this.commitInChunks(items, (batch, { id, parentIds = [] }) => {
      batch.update(this.documentReferenceById(id, parentIds), SOFT_DELETE);
    });
  }

  /**
   * Remove the document for good, whether or not it is soft-deleted. A missing document is a no-op.
   * Use {@link delete} unless the data must really go (e.g. an erasure request).
   */
  hardDelete(id: Id, ...parentIds: Id[]): Promise<void> {
    return super.delete(id, ...parentIds);
  }

  /**
   * Remove many documents under a shared parent path for good, in batched commits of 500
   * (Firestore WriteBatch limit). Not atomic across chunks. Missing documents are skipped.
   */
  async bulkHardDelete(ids: Id[], ...parentIds: Id[]): Promise<void> {
    // Not `super.bulkDelete`: it calls `this.bulkDeleteAll`, which soft-deletes here.
    await this.bulkHardDeleteAll(ids.map((id) => ({ id, parentIds })));
  }

  /**
   * Remove many documents across potentially different parent paths for good, in batched commits of 500
   * (Firestore WriteBatch limit). Not atomic across chunks. Missing documents are skipped.
   */
  bulkHardDeleteAll(items: BulkDeleteItem[]): Promise<void> {
    return super.bulkDeleteAll(items);
  }

  /** Like `findById`, but also returns a deleted document. `null` only when the document is missing. */
  async findByIdIncludingDeleted(id: Id, ...parentIds: Id[]): Promise<E | null> {
    const model = await this.findModelById(id, parentIds);
    return model ? this.modelTransformer.fromModel(model) : null;
  }

  /** Like `findAllById`, but also returns deleted documents. Empty `ids` resolves to `[]` without a read. */
  async findAllByIdIncludingDeleted(ids: Id[], ...parentIds: Id[]): Promise<E[]> {
    return this.toEntities(await this.findAllModelsById(ids, parentIds));
  }

  /** Like `list`, but also returns deleted documents. Same as `listAll`. */
  listIncludingDeleted(attributes?: ModelQuery<M>, ...parentIds: Id[]): Promise<E[]> {
    return this.listAll(attributes, ...parentIds);
  }

  /** Like `query`, but also returns deleted documents. */
  async queryIncludingDeleted(cb: (qb: Query<M>) => Query<M>, ...parentIds: Id[]): Promise<E[]> {
    return this.toEntities(await this.queryModels(cb, parentIds));
  }

  /**
   * Leaves out soft-deleted documents. A subclass that needs extra filtering must keep this rule by combining
   * with it: `return super.modelCustomFilter(model) && …;`.
   */
  protected override modelCustomFilter(model: M): boolean {
    return model.deleted !== true;
  }
}
