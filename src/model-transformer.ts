import type { BaseModel } from "firestore-storage-core";

export interface ModelTransformer<E, M extends BaseModel> {
  fromModel(model: M): E;
  toModel(entity: E): M;
}
