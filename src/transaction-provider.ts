import type { Firestore, Transaction } from "@google-cloud/firestore";
import { Inject, Injectable } from "@nestjs/common";
import { FIRESTORE } from "./core";

/**
 * Cross-cutting transaction orchestration service. Runs work inside a Firestore transaction.
 * Use when you need atomic operations across multiple repositories or services.
 * All reads must precede writes within the callback (standard Firestore rule).
 * Rolls back automatically if the callback throws.
 */
@Injectable()
export class TransactionProvider {
  constructor(@Inject(FIRESTORE) private readonly firestore: Firestore) {}

  /**
   * Runs `work` inside a Firestore transaction and returns whatever the callback resolves with.
   * The transaction lifecycle is owned by this method — callers only perform read/write operations.
   */
  async withTransaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction(work);
  }
}
