import type { Firestore } from "@google-cloud/firestore";
import { Test } from "@nestjs/testing";
import { FIRESTORE, TestFirestoreClearService, TransactionProvider, withMemoryStorage } from "../src";
import type { Post, User } from "./fixtures/entities";
import type { UserModel } from "./fixtures/models";
import { PostEntityRepository, UserEntityRepository } from "./fixtures/repositories";
import { getTestFirestore } from "./helpers/firestore";

/** Hides users whose name starts with "deleted:" to exercise `modelCustomFilter`. */
class ActiveUserEntityRepository extends UserEntityRepository {
  protected override modelCustomFilter(model: UserModel): boolean {
    return !model.name.startsWith("deleted:");
  }
}

describe("EntityRepository transaction helpers", () => {
  let userRepository: UserEntityRepository;
  let activeUserRepository: ActiveUserEntityRepository;
  let postRepository: PostEntityRepository;
  let transactionProvider: TransactionProvider;
  let clearService: TestFirestoreClearService;
  let testUserId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        withMemoryStorage({
          useFactory: () => getTestFirestore(),
        }),
      ],
    }).compile();

    const firestore = module.get<Firestore>(FIRESTORE);
    userRepository = new UserEntityRepository(firestore);
    activeUserRepository = new ActiveUserEntityRepository(firestore);
    postRepository = new PostEntityRepository(firestore);
    transactionProvider = new TransactionProvider(firestore);
    clearService = module.get(TestFirestoreClearService);
  });

  beforeEach(async () => {
    await clearService.clear("users");
    testUserId = userRepository.generateId();
    await userRepository.save({ id: testUserId, name: "Alice", email: "alice@example.com" });
  });

  afterEach(async () => {
    await clearService.clear(`users/${testUserId}/posts`);
  });

  describe("findByIdInTransaction", () => {
    it("reads an existing entity", async () => {
      const found = await transactionProvider.withTransaction((transaction) =>
        userRepository.findByIdInTransaction(transaction, testUserId),
      );

      expect(found).toEqual({ id: testUserId, name: "Alice", email: "alice@example.com" });
    });

    it("returns null for a missing entity", async () => {
      const found = await transactionProvider.withTransaction((transaction) =>
        userRepository.findByIdInTransaction(transaction, "missing"),
      );

      expect(found).toBeNull();
    });

    it("returns null when modelCustomFilter rejects the model", async () => {
      const hiddenId = userRepository.generateId();
      await userRepository.save({ id: hiddenId, name: "deleted:Bob", email: "bob@example.com" });

      const found = await transactionProvider.withTransaction((transaction) =>
        activeUserRepository.findByIdInTransaction(transaction, hiddenId),
      );

      expect(found).toBeNull();
    });

    it("reads a nested entity using parent ids", async () => {
      const postId = postRepository.generateId();
      const publishedAt = new Date("2026-01-01T00:00:00.000Z");
      await postRepository.save({ id: postId, title: "Hello", body: "World", publishedAt }, testUserId);

      const found = await transactionProvider.withTransaction((transaction) =>
        postRepository.findByIdInTransaction(transaction, postId, testUserId),
      );

      expect(found).toEqual({ id: postId, title: "Hello", body: "World", publishedAt });
    });
  });

  describe("saveInTransaction", () => {
    it("writes the entity when the transaction commits", async () => {
      const newUserId = userRepository.generateId();

      await transactionProvider.withTransaction(async (transaction) => {
        userRepository.saveInTransaction(transaction, { id: newUserId, name: "Carol", email: "carol@example.com" });
      });

      expect(await userRepository.findById(newUserId)).toEqual({
        id: newUserId,
        name: "Carol",
        email: "carol@example.com",
      });
    });

    it("overwrites an entity read in the same transaction", async () => {
      await transactionProvider.withTransaction(async (transaction) => {
        const user = await userRepository.findByIdInTransaction(transaction, testUserId);
        if (!user) {
          throw new Error("user not found");
        }
        userRepository.saveInTransaction(transaction, { ...user, name: "Alice Renamed" });
      });

      expect(await userRepository.findById(testUserId)).toEqual({
        id: testUserId,
        name: "Alice Renamed",
        email: "alice@example.com",
      });
    });

    // Real Firestore (and the emulator) lock documents read in a transaction, so the outside write
    // blocks until the lock times out (~60s) before the transaction is aborted and retried. The
    // in-memory backend detects the conflict at commit time instead, so the retry is immediate.
    it.skipIf(process.env.FIRESTORE_EMULATOR_HOST)(
      "retries when the entity is updated outside the transaction between read and save",
      async () => {
        let attempts = 0;

        await transactionProvider.withTransaction(async (transaction) => {
          attempts += 1;
          const user = await userRepository.findByIdInTransaction(transaction, testUserId);
          if (!user) {
            throw new Error("user not found");
          }
          if (attempts === 1) {
            await userRepository.save({ ...user, name: "Alice Outside" });
          }
          userRepository.saveInTransaction(transaction, { ...user, name: `${user.name} (tx)` });
        });

        expect(attempts).toBe(2);
        expect(await userRepository.findById(testUserId)).toEqual({
          id: testUserId,
          name: "Alice Outside (tx)",
          email: "alice@example.com",
        });
      },
    );

    it("retries conflicting concurrent transactions without losing either update", async () => {
      let attempts = 0;
      let firstAttemptReads = 0;
      let releaseWrites: () => void = () => {};
      const bothRead = new Promise<void>((resolve) => {
        releaseWrites = resolve;
      });
      const appendToName = (suffix: string) =>
        transactionProvider.withTransaction(async (transaction) => {
          attempts += 1;
          const user = await userRepository.findByIdInTransaction(transaction, testUserId);
          if (!user) {
            throw new Error("user not found");
          }
          firstAttemptReads += 1;
          if (firstAttemptReads === 2) {
            releaseWrites();
          }
          await bothRead;
          userRepository.saveInTransaction(transaction, { ...user, name: `${user.name} ${suffix}` });
        });

      await Promise.all([appendToName("A"), appendToName("B")]);

      expect(attempts).toBeGreaterThan(2);
      const saved = await userRepository.findById(testUserId);
      expect(["Alice A B", "Alice B A"]).toContain(saved?.name);
    });

    it("writes a nested entity using parent ids", async () => {
      const post: Post = {
        id: postRepository.generateId(),
        title: "Nested",
        body: "Body",
        publishedAt: new Date("2026-02-01T00:00:00.000Z"),
      };

      await transactionProvider.withTransaction(async (transaction) => {
        postRepository.saveInTransaction(transaction, post, testUserId);
      });

      expect(await postRepository.findById(post.id, testUserId)).toEqual(post);
    });

    it("discards the write when the transaction rolls back", async () => {
      const user: User = { id: testUserId, name: "Rolled Back", email: "alice@example.com" };

      await expect(
        transactionProvider.withTransaction(async (transaction) => {
          userRepository.saveInTransaction(transaction, user);
          throw new Error("abort");
        }),
      ).rejects.toThrow("abort");

      expect(await userRepository.findById(testUserId)).toEqual({
        id: testUserId,
        name: "Alice",
        email: "alice@example.com",
      });
    });
  });
});
