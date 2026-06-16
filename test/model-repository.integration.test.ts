import { Test } from "@nestjs/testing";
import { TestFirestoreClearService, withMemoryStorage, FIRESTORE } from "../src";
import { UsersCollection } from "./fixtures/paths";
import { UserModelRepository } from "./fixtures/repositories";
import { getTestFirestore } from "./helpers/firestore";

describe("ModelRepository helpers", () => {
  let userModelRepository: UserModelRepository;
  let clearService: TestFirestoreClearService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        withMemoryStorage({
          useFactory: () => getTestFirestore(),
        }),
      ],
    }).compile();

    const firestore = module.get(FIRESTORE);
    userModelRepository = new UserModelRepository(firestore);
    clearService = module.get(TestFirestoreClearService);
  });

  beforeEach(async () => {
    await clearService.clear("users");
  });

  describe("withBatch", () => {
    it("commits operations added inside the callback", async () => {
      const userId = userModelRepository.generateId();

      await userModelRepository.withBatch((batch) => {
        const ref = userModelRepository.docRef({ userId });
        batch.set(ref, { name: "Batched", email: "batched@example.com" });
      });

      const saved = await userModelRepository.findById({ userId });
      expect(saved).toEqual(expect.objectContaining({ id: userId, name: "Batched", email: "batched@example.com" }));
    });

    it("supports async callbacks", async () => {
      const userId = userModelRepository.generateId();

      await userModelRepository.withBatch(async (batch) => {
        await Promise.resolve();
        batch.set(userModelRepository.docRef({ userId }), { name: "Async", email: "async@example.com" });
      });

      const saved = await userModelRepository.findById({ userId });
      expect(saved).toEqual(expect.objectContaining({ id: userId, name: "Async" }));
    });

    it("does not persist anything when the callback throws", async () => {
      const userId = userModelRepository.generateId();

      await expect(
        userModelRepository.withBatch(() => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      const found = await userModelRepository.findById({ userId });
      expect(found).toBeNull();
    });
  });

  describe("docRef / newDocRef", () => {
    it("docRef points at a specific document path", () => {
      const ref = userModelRepository.docRef({ userId: "abc123" });

      expect(ref.path).toBe(`${UsersCollection.collectionName}/abc123`);
    });

    it("newDocRef generates a unique id under the collection", () => {
      const first = userModelRepository.newDocRef();
      const second = userModelRepository.newDocRef();
      expect(first.id).not.toBe(second.id);
      expect(first.path.startsWith(`${UsersCollection.collectionName}/`)).toBe(true);
    });
  });
});
