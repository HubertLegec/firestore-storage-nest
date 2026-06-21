/**
 * Core NestJS module for Firestore (production).
 */
import { DynamicModule, InjectionToken, Module } from "@nestjs/common";
import type { Firestore } from "@google-cloud/firestore";
import { TransactionProvider } from "./transaction-provider";
import { FIRESTORE } from "./tokens";

export { FIRESTORE };

export interface FirestoreStorageModuleAsyncOptions {
  useFactory: () => Firestore;
  inject?: unknown[];
  global?: boolean;
}

@Module({})
export class FirestoreStorageNestModule {
  static forRootAsync(options: FirestoreStorageModuleAsyncOptions): DynamicModule {
    return {
      module: FirestoreStorageNestModule,
      global: options.global ?? false,
      providers: [
        {
          provide: FIRESTORE,
          useFactory: options.useFactory,
          inject: (options.inject ?? []) as InjectionToken[],
        },
        TransactionProvider,
      ],
      exports: [FIRESTORE, TransactionProvider],
    };
  }
}
