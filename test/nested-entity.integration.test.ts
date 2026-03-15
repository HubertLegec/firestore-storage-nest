import { Test } from "@nestjs/testing";
import { FIRESTORE } from "../src/core";
import { withMemoryStorage, TestFirestoreClearService } from "../src/testing";
import type { Post } from "./fixtures/entities";
import { PostEntityRepository, UserEntityRepository } from "./fixtures/repositories";
import { getTestFirestore } from "./helpers/firestore";

describe("Post entity (nested under user)", () => {
  let userRepo: UserEntityRepository;
  let postRepo: PostEntityRepository;
  let clearService: TestFirestoreClearService;
  let testUserId: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        withMemoryStorage({
          useFactory: () => getTestFirestore(),
        }),
      ],
    }).compile();

    const firestore = module.get(FIRESTORE);
    userRepo = new UserEntityRepository(firestore);
    postRepo = new PostEntityRepository(firestore);
    clearService = module.get(TestFirestoreClearService);
    await clearService.clear("users");
    testUserId = userRepo.generateId();
    await userRepo.save({ id: testUserId, name: "Author", email: "author@example.com" });
    await clearService.clear(`users/${testUserId}/posts`);
  });

  it("create: saves a new post under a user", async () => {
    const postId = postRepo.generateId();
    const post: Post = {
      id: postId,
      title: "First Post",
      body: "Hello world",
      publishedAt: new Date("2025-01-15T10:00:00Z"),
    };
    const saved = await postRepo.save(post, testUserId);
    expect(saved.id).toBe(postId);
    expect(saved.title).toBe("First Post");
    expect(saved.body).toBe("Hello world");
  });

  it("update: overwrites existing post by id under user", async () => {
    const postId = postRepo.generateId();
    await postRepo.save({ id: postId, title: "Old", body: "Body", publishedAt: new Date() }, testUserId);
    const updated = await postRepo.save(
      { id: postId, title: "Updated", body: "New body", publishedAt: new Date() },
      testUserId,
    );
    expect(updated.title).toBe("Updated");
    expect(updated.body).toBe("New body");
  });

  it("fetch: findById returns saved post when given (postId, userId)", async () => {
    const postId = postRepo.generateId();
    await postRepo.save({ id: postId, title: "Nested", body: "Content", publishedAt: new Date() }, testUserId);
    const found = await postRepo.findById(postId, testUserId);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(postId);
    expect(found!.title).toBe("Nested");
  });

  it("fetch: findById returns null when post does not exist", async () => {
    const found = await postRepo.findById("nonexistent-post-id", testUserId);
    expect(found).toBeNull();
  });

  it("list: returns all posts under a user", async () => {
    const id1 = postRepo.generateId();
    const id2 = postRepo.generateId();
    await postRepo.save({ id: id1, title: "Post 1", body: "B1", publishedAt: new Date() }, testUserId);
    await postRepo.save({ id: id2, title: "Post 2", body: "B2", publishedAt: new Date() }, testUserId);
    const list = await postRepo.list(undefined, testUserId);
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id).sort()).toEqual([id1, id2].sort());
  });

  it("list: can filter by attributes", async () => {
    const id1 = postRepo.generateId();
    const id2 = postRepo.generateId();
    await postRepo.save({ id: id1, title: "Draft", body: "B1", publishedAt: new Date() }, testUserId);
    await postRepo.save({ id: id2, title: "Published", body: "B2", publishedAt: new Date() }, testUserId);
    const list = await postRepo.list({ title: "Draft" }, testUserId);
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("Draft");
  });

  it("delete: removes post by id under user", async () => {
    const postId = postRepo.generateId();
    await postRepo.save({ id: postId, title: "ToDelete", body: "X", publishedAt: new Date() }, testUserId);
    await postRepo.delete(postId, testUserId);
    const found = await postRepo.findById(postId, testUserId);
    expect(found).toBeNull();
  });
});
