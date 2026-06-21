import type { Firestore } from "@google-cloud/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryFirestore } from "../src/firestore-memory";
import { TransactionProvider } from "../src/transaction-provider";

describe("TransactionProvider", () => {
  let firestore: Firestore;
  let provider: TransactionProvider;

  beforeEach(async () => {
    firestore = createMemoryFirestore();
    provider = new TransactionProvider(firestore);
  });

  it("runs work inside a transaction and returns the result", async () => {
    await firestore.collection("test").doc("doc1").set({ value: 100 });

    const result = await provider.withTransaction(async (transaction) => {
      const snap = await transaction.get(firestore.collection("test").doc("doc1"));
      const currentValue = snap.data() as { value: number };
      const newValue = (currentValue?.value ?? 0) + 50;
      transaction.update(firestore.collection("test").doc("doc1"), { value: newValue });
      return newValue as number;
    });

    expect(result).toBe(150);
    const finalSnap = await firestore.collection("test").doc("doc1").get();
    const finalData = finalSnap.data() as { value: number };
    expect(finalData.value).toBe(150);
  });

  it("rolls back on error", async () => {
    await firestore.collection("test").doc("doc1").set({ value: 100 });

    await expect(
      provider.withTransaction(async (transaction) => {
        const snap = await transaction.get(firestore.collection("test").doc("doc1"));
        const data = snap.data() as { value: number };
        transaction.update(firestore.collection("test").doc("doc1"), { value: data.value + 100 });
        throw new Error("test error");
      }),
    ).rejects.toThrow("test error");

    const finalSnap = await firestore.collection("test").doc("doc1").get();
    const finalData = finalSnap.data() as { value: number };
    expect(finalData.value).toBe(100);
  });

  it("handles multiple reads and writes in order", async () => {
    await firestore.collection("test").doc("doc1").set({ balance: 100 });
    await firestore.collection("test").doc("doc2").set({ balance: 50 });

    await provider.withTransaction(async (transaction) => {
      const snap1 = await transaction.get(firestore.collection("test").doc("doc1"));
      const snap2 = await transaction.get(firestore.collection("test").doc("doc2"));

      const data1 = snap1.data() as { balance: number };
      const data2 = snap2.data() as { balance: number };

      const balance1 = data1?.balance ?? 0;
      const balance2 = data2?.balance ?? 0;

      transaction.update(firestore.collection("test").doc("doc1"), { balance: balance1 - 30 });
      transaction.update(firestore.collection("test").doc("doc2"), { balance: balance2 + 30 });
    });

    const snap1 = await firestore.collection("test").doc("doc1").get();
    const snap2 = await firestore.collection("test").doc("doc2").get();

    const data1 = snap1.data() as { balance: number };
    const data2 = snap2.data() as { balance: number };

    expect(data1.balance).toBe(70);
    expect(data2.balance).toBe(80);
  });
});
