import type { BaseModel, ModelDataOnly } from "firestore-storage-core";

export type ModelDataWithOptionalId<T extends BaseModel> = Partial<Pick<T, "id">> & ModelDataOnly<T>;

export interface ModelTransformer<E, M extends BaseModel> {
  fromModel(model: M): E;
  toModel(entity: E): ModelDataWithOptionalId<M>;
}
