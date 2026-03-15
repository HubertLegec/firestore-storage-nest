import { BaseRepository, Query } from "firestore-storage";
import type { BaseModel, CollectionPath, ModelQuery } from "firestore-storage-core";
import type { ModelTransformer } from "./model-transformer";
import { pathToCollectionIds, pathToDocumentIds } from "./path-ids";

type Path = CollectionPath<string, string, void | object>;

/**
 * Entity id type (string).
 * Public API of EntityRepository (save, delete, findById, findAllById, list, query, generateId)
 * is unchanged from master: same method names and signatures for all classes extending it.
 */
export type Id = string;

export abstract class EntityRepository<E, M extends BaseModel> {
  protected constructor(
    protected readonly modelRepository: BaseRepository<M, Path>,
    protected readonly modelTransformer: ModelTransformer<E, M>,
  ) {}

  protected getPath(): Path {
    return this.modelRepository.getPath() as Path;
  }

  async save(value: E, ...ids: Id[]): Promise<E> {
    const model = this.modelTransformer.toModel(value);
    const collectionIds = pathToCollectionIds(this.getPath(), ids);
    const saved = await this.modelRepository.write(model, collectionIds);
    return this.modelTransformer.fromModel(saved);
  }

  delete(id: Id, ...ids: Id[]): Promise<void> {
    const documentIds = pathToDocumentIds(this.getPath(), [...ids, id]);
    return this.modelRepository.delete(documentIds);
  }

  async findById(id: Id, subcollectionId?: Id): Promise<E | null> {
    const documentIds = pathToDocumentIds(this.getPath(), subcollectionId !== undefined ? [subcollectionId, id] : [id]);
    const model = await this.modelRepository.findById(documentIds);
    if (!model || !this.modelCustomFilter(model)) {
      return null;
    }
    return this.modelTransformer.fromModel(model);
  }

  async findAllById(ids: Id[]): Promise<E[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    const collectionIds = pathToCollectionIds(this.getPath(), []);
    const result = await this.modelRepository.findAll(ids, collectionIds);
    return result
      .filter((m) => !!m)
      .filter((m) => this.modelCustomFilter(m as M))
      .map((m) => this.modelTransformer.fromModel(m as M));
  }

  async list(attributes?: ModelQuery<M>, ...ids: Id[]): Promise<E[]> {
    const collectionIds = pathToCollectionIds(this.getPath(), ids);
    const result = await this.modelRepository.list(attributes ?? null, collectionIds);
    return result.filter((o) => this.modelCustomFilter(o)).map((m) => this.modelTransformer.fromModel(m));
  }

  async query(cb: (qb: Query<M>) => Query<M>, ...ids: Id[]): Promise<E[]> {
    const collectionIds = pathToCollectionIds(this.getPath(), ids);
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
}
