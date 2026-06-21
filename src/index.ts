/**
 * NestJS module for Firestore (firestore-storage v7 compatible).
 * Production: forRootAsync, FIRESTORE. Testing: withMemoryStorage, TestFirestoreClearService, createMemoryFirestore.
 * Repository helpers: EntityRepository, path-ids, ModelTransformer.
 */
export { FIRESTORE, type FirestoreStorageModuleAsyncOptions } from "./core";
export { EntityRepository, type BulkDeleteItem, type BulkSaveItem, type Id } from "./entity-repository";
export { createMemoryFirestore } from "./firestore-memory";
export { ModelRepository } from "./model-repository";
export type { ModelDataWithOptionalId, ModelTransformer } from "./model-transformer";
export { FirestoreStorageNestModule } from "./module-with-memory";
export {
  TestFirestoreClearService,
  withMemoryStorage,
  type TestFirestoreClear,
  type WithMemoryStorageOptions,
} from "./testing";
export { TransactionProvider } from "./transaction-provider";
