import { Test } from "@nestjs/testing";
import { FIRESTORE } from "../src/core";
import { TestFirestoreClearService, withMemoryStorage } from "../src/testing";
import type { Post } from "./fixtures/entities";
import { PostEntityRepository, UserEntityRepository } from "./fixtures/repositories";
import { getTestFirestore } from "./helpers/firestore";

describe("Post entity (nested under user)", () => {
  let userRepository: UserEntityRepository;
  let postRepository: PostEntityRepository;
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

    const firestore = module.get(FIRESTORE);
    userRepository = new UserEntityRepository(firestore);
    postRepository = new PostEntityRepository(firestore);
    clearService = module.get(TestFirestoreClearService);
  });

  beforeEach(async () => {
    await clearService.clear("users");
    testUserId = userRepository.generateId();
    await userRepository.save({ id: testUserId, name: "Author", email: "author@example.com" });
  });

  afterEach(async () => {
    await clearService.clear(`users/${testUserId}/posts`);
  });

  it("saves a new post under a user", async () => {
    const postId = postRepository.generateId();
    const post: Post = {
      id: postId,
      title: "First Post",
      body: "Hello world",
      publishedAt: new Date("2025-01-15T10:00:00Z"),
    };

    const saved = await postRepository.save(post, testUserId);

    expect(saved).toEqual(post);
  });

  it("updates existing post", async () => {
    const postId = postRepository.generateId();
    await postRepository.save({ id: postId, title: "Old", body: "Body", publishedAt: new Date() }, testUserId);

    const updated = await postRepository.save(
      { id: postId, title: "Updated", body: "New body", publishedAt: new Date() },
      testUserId,
    );

    expect(updated).toEqual(expect.objectContaining({ id: postId, title: "Updated", body: "New body" }));
  });

  it("findById returns saved post", async () => {
    const postId = postRepository.generateId();
    await postRepository.save({ id: postId, title: "Nested", body: "Content", publishedAt: new Date() }, testUserId);

    const found = await postRepository.findById(postId, testUserId);

    expect(found).toEqual(expect.objectContaining({ id: postId, title: "Nested", body: "Content" }));
  });

  it("findById returns null when post does not exist", async () => {
    const found = await postRepository.findById("nonexistent-post-id", testUserId);

    expect(found).toBeNull();
  });

  it("lists all posts under a user", async () => {
    const id1 = postRepository.generateId();
    const id2 = postRepository.generateId();
    await postRepository.save({ id: id1, title: "Post 1", body: "B1", publishedAt: new Date() }, testUserId);
    await postRepository.save({ id: id2, title: "Post 2", body: "B2", publishedAt: new Date() }, testUserId);

    const list = await postRepository.list(undefined, testUserId);

    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id).sort()).toEqual([id1, id2].sort());
  });

  it("lists with filter by attributes", async () => {
    const id1 = postRepository.generateId();
    const id2 = postRepository.generateId();
    await postRepository.save({ id: id1, title: "Draft", body: "B1", publishedAt: new Date() }, testUserId);
    await postRepository.save({ id: id2, title: "Published", body: "B2", publishedAt: new Date() }, testUserId);

    const list = await postRepository.list({ title: "Draft" }, testUserId);

    expect(list).toEqual([expect.objectContaining({ id: id1, title: "Draft" })]);
  });

  it("removes post by id under user", async () => {
    const postId = postRepository.generateId();
    await postRepository.save({ id: postId, title: "ToDelete", body: "X", publishedAt: new Date() }, testUserId);

    await postRepository.delete(postId, testUserId);

    const found = await postRepository.findById(postId, testUserId);
    expect(found).toBeNull();
  });
});
