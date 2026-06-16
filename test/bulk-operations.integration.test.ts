import { Test } from "@nestjs/testing";
import { TestFirestoreClearService, withMemoryStorage, FIRESTORE } from "../src";
import type { Post, User } from "./fixtures/entities";
import { PostEntityRepository, UserEntityRepository } from "./fixtures/repositories";
import { getTestFirestore } from "./helpers/firestore";

describe("Bulk operations", () => {
  let userRepository: UserEntityRepository;
  let postRepository: PostEntityRepository;
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
    userRepository = new UserEntityRepository(firestore);
    postRepository = new PostEntityRepository(firestore);
    clearService = module.get(TestFirestoreClearService);
  });

  beforeEach(async () => {
    await clearService.clear("users");
  });

  describe("bulkSave", () => {
    it("is a no-op for an empty array", async () => {
      await expect(userRepository.bulkSave([])).resolves.toBeUndefined();
      const list = await userRepository.list();
      expect(list).toHaveLength(0);
    });

    it("saves many entities under the root collection in a single call", async () => {
      const users: User[] = Array.from({ length: 5 }, (_, index) => ({
        id: userRepository.generateId(),
        name: `User ${index}`,
        email: `user${index}@example.com`,
      }));

      await userRepository.bulkSave(users);

      const list = await userRepository.list();
      expect(list).toHaveLength(users.length);
      expect(list.map((user) => user.id).sort()).toEqual(users.map((user) => user.id).sort());
    });

    it("overwrites existing entities with the same id (no-merge semantics, matching save)", async () => {
      const id = userRepository.generateId();
      await userRepository.save({ id, name: "Original", email: "original@example.com" });

      await userRepository.bulkSave([{ id, name: "Replaced", email: "replaced@example.com" }]);

      const found = await userRepository.findById(id);
      expect(found).toEqual(expect.objectContaining({ id, name: "Replaced", email: "replaced@example.com" }));
    });

    it("saves many nested entities under a shared parent path", async () => {
      const userId = userRepository.generateId();
      await userRepository.save({ id: userId, name: "Author", email: "author@example.com" });
      const posts: Post[] = Array.from({ length: 3 }, (_, index) => ({
        id: postRepository.generateId(),
        title: `Post ${index}`,
        body: `Body ${index}`,
        publishedAt: new Date("2025-01-15T10:00:00Z"),
      }));

      await postRepository.bulkSave(posts, userId);

      const list = await postRepository.list(undefined, userId);
      expect(list).toHaveLength(posts.length);
      expect(list.map((post) => post.id).sort()).toEqual(posts.map((post) => post.id).sort());
    });

    it("crosses the 500-document batch boundary by splitting into multiple commits", async () => {
      const userCount = 501;
      const users: User[] = Array.from({ length: userCount }, (_, index) => ({
        id: userRepository.generateId(),
        name: `User ${index}`,
        email: `user${index}@example.com`,
      }));

      await userRepository.bulkSave(users);

      const list = await userRepository.list();
      expect(list).toHaveLength(userCount);
      expect(new Set(list.map((user) => user.id))).toEqual(new Set(users.map((user) => user.id)));
    });
  });

  describe("bulkSaveAll", () => {
    it("is a no-op for an empty array", async () => {
      await expect(postRepository.bulkSaveAll([])).resolves.toBeUndefined();
    });

    it("saves entities across different parent paths in a single call", async () => {
      const userA = userRepository.generateId();
      const userB = userRepository.generateId();
      await userRepository.bulkSave([
        { id: userA, name: "A", email: "a@example.com" },
        { id: userB, name: "B", email: "b@example.com" },
      ]);
      const postOnA: Post = {
        id: postRepository.generateId(),
        title: "On A",
        body: "x",
        publishedAt: new Date("2025-02-01T00:00:00Z"),
      };
      const postOnB: Post = {
        id: postRepository.generateId(),
        title: "On B",
        body: "y",
        publishedAt: new Date("2025-02-02T00:00:00Z"),
      };

      await postRepository.bulkSaveAll([
        { value: postOnA, parentIds: [userA] },
        { value: postOnB, parentIds: [userB] },
      ]);

      const aPosts = await postRepository.list(undefined, userA);
      const bPosts = await postRepository.list(undefined, userB);
      expect(aPosts).toEqual([expect.objectContaining({ id: postOnA.id, title: "On A" })]);
      expect(bPosts).toEqual([expect.objectContaining({ id: postOnB.id, title: "On B" })]);
    });
  });

  describe("bulkDelete", () => {
    it("is a no-op for an empty array", async () => {
      await expect(userRepository.bulkDelete([])).resolves.toBeUndefined();
    });

    it("deletes many entities under the root collection in a single call", async () => {
      const ids = Array.from({ length: 4 }, () => userRepository.generateId());
      await userRepository.bulkSave(
        ids.map((id, index) => ({ id, name: `User ${index}`, email: `user${index}@example.com` })),
      );

      await userRepository.bulkDelete(ids.slice(0, 3));

      const remaining = await userRepository.list();
      expect(remaining.map((user) => user.id)).toEqual([ids[3]]);
    });

    it("crosses the 500-document batch boundary by splitting into multiple commits", async () => {
      const userCount = 501;
      const users: User[] = Array.from({ length: userCount }, (_, index) => ({
        id: userRepository.generateId(),
        name: `User ${index}`,
        email: `user${index}@example.com`,
      }));
      await userRepository.bulkSave(users);

      await userRepository.bulkDelete(users.map((user) => user.id));

      expect(await userRepository.list()).toEqual([]);
    });
  });

  describe("bulkDeleteAll", () => {
    it("is a no-op for an empty array", async () => {
      await expect(postRepository.bulkDeleteAll([])).resolves.toBeUndefined();
    });

    it("deletes documents across different parent paths in a single call", async () => {
      const userA = userRepository.generateId();
      const userB = userRepository.generateId();
      await userRepository.bulkSave([
        { id: userA, name: "A", email: "a@example.com" },
        { id: userB, name: "B", email: "b@example.com" },
      ]);
      const postOnA: Post = {
        id: postRepository.generateId(),
        title: "On A",
        body: "x",
        publishedAt: new Date("2025-02-01T00:00:00Z"),
      };
      const postOnB: Post = {
        id: postRepository.generateId(),
        title: "On B",
        body: "y",
        publishedAt: new Date("2025-02-02T00:00:00Z"),
      };
      await postRepository.bulkSaveAll([
        { value: postOnA, parentIds: [userA] },
        { value: postOnB, parentIds: [userB] },
      ]);

      await postRepository.bulkDeleteAll([
        { id: postOnA.id, parentIds: [userA] },
        { id: postOnB.id, parentIds: [userB] },
      ]);

      expect(await postRepository.list(undefined, userA)).toEqual([]);
      expect(await postRepository.list(undefined, userB)).toEqual([]);
    });
  });
});
