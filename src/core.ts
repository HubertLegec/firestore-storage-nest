/**
 * Core NestJS module for Firestore (production).
 */
import { DynamicModule, InjectionToken, Module } from "@nestjs/common";
import type { Firestore } from "@google-cloud/firestore";

export const FIRESTORE = Symbol("FIRESTORE");

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
      ],
      exports: [FIRESTORE],
    };
  }
}
