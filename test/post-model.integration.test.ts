import { Test } from "@nestjs/testing";
import { FIRESTORE } from "../src/core";
import { TestFirestoreClearService, withMemoryStorage } from "../src/testing";
import type { PostModel } from "./fixtures/models";
import { PostModelRepository, UserModelRepository } from "./fixtures/repositories";
import { getTestFirestore } from "./helpers/firestore";

describe("Post model (nested under user)", () => {
  let userRepo: UserModelRepository;
  let postRepo: PostModelRepository;
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
    userRepo = new UserModelRepository(firestore);
    postRepo = new PostModelRepository(firestore);
    clearService = module.get(TestFirestoreClearService);
  });

  beforeEach(async () => {
    await clearService.clear("users");
    testUserId = userRepo.generateId();
    await userRepo.write({ id: testUserId, name: "Author", email: "author@example.com", _rawPath: "" });
  });

  afterEach(async () => {
    await clearService.clear(`users/${testUserId}/posts`);
  });

  function postModel(id: string, title: string, body: string, publishedAt: Date): PostModel {
    return { id, title, body, publishedAt, _rawPath: "" };
  }

  function collectionIds() {
    return { userId: testUserId };
  }

  function documentIds(postId: string) {
    return { userId: testUserId, postId };
  }

  it("writes a new post under a user", async () => {
    const postId = postRepo.generateId();
    const model: PostModel = postModel(postId, "First Post", "Hello world", new Date("2025-01-15T10:00:00Z"));

    const saved = await postRepo.write(model, collectionIds());

    expect(saved).toMatchObject({ id: postId, title: "First Post", body: "Hello world" });
  });

  it("updates existing post via write", async () => {
    const postId = postRepo.generateId();
    await postRepo.write(postModel(postId, "Old", "Body", new Date()), collectionIds());

    const updated = await postRepo.write(postModel(postId, "Updated", "New body", new Date()), collectionIds());

    expect(updated).toMatchObject({ id: postId, title: "Updated", body: "New body" });
  });

  it("findById returns saved post", async () => {
    const postId = postRepo.generateId();
    await postRepo.write(postModel(postId, "Nested", "Content", new Date()), collectionIds());

    const found = await postRepo.findById(documentIds(postId));

    expect(found).toMatchObject({ id: postId, title: "Nested", body: "Content" });
  });

  it("findById returns null when post does not exist", async () => {
    const found = await postRepo.findById(documentIds("nonexistent-post-id"));

    expect(found).toBeNull();
  });

  it("lists all posts under a user", async () => {
    const id1 = postRepo.generateId();
    const id2 = postRepo.generateId();
    await postRepo.write(postModel(id1, "Post 1", "B1", new Date()), collectionIds());
    await postRepo.write(postModel(id2, "Post 2", "B2", new Date()), collectionIds());

    const list = await postRepo.list(null, collectionIds());

    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id).sort()).toEqual([id1, id2].sort());
  });

  it("lists with filter by attributes", async () => {
    const id1 = postRepo.generateId();
    const id2 = postRepo.generateId();
    await postRepo.write(postModel(id1, "Draft", "B1", new Date()), collectionIds());
    await postRepo.write(postModel(id2, "Published", "B2", new Date()), collectionIds());

    const list = await postRepo.list({ title: "Draft" }, collectionIds());

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: id1, title: "Draft" });
  });

  it("removes post by document ids", async () => {
    const postId = postRepo.generateId();
    await postRepo.write(postModel(postId, "ToDelete", "X", new Date()), collectionIds());

    await postRepo.delete(documentIds(postId));

    const found = await postRepo.findById(documentIds(postId));
    expect(found).toBeNull();
  });

  describe("query", () => {
    it("filters with '>' condition on date", async () => {
      const cutoff = new Date("2025-02-01T00:00:00Z");
      await postRepo.write(
        postModel(postRepo.generateId(), "Old", "B1", new Date("2025-01-15T10:00:00Z")),
        collectionIds(),
      );
      await postRepo.write(
        postModel(postRepo.generateId(), "New1", "B2", new Date("2025-02-10T10:00:00Z")),
        collectionIds(),
      );
      await postRepo.write(
        postModel(postRepo.generateId(), "New2", "B3", new Date("2025-03-01T10:00:00Z")),
        collectionIds(),
      );

      const list = await postRepo.query((q) => q.where("publishedAt", ">", cutoff), collectionIds());

      expect(list).toHaveLength(2);
      expect(list.map((p) => p.title).sort()).toEqual(["New1", "New2"]);
    });

    it("filters with '!=' condition", async () => {
      await postRepo.write(postModel(postRepo.generateId(), "Draft", "B1", new Date()), collectionIds());
      await postRepo.write(postModel(postRepo.generateId(), "Published", "B2", new Date()), collectionIds());
      await postRepo.write(postModel(postRepo.generateId(), "Archived", "B3", new Date()), collectionIds());

      const list = await postRepo.query((q) => q.where("title", "!=", "Published"), collectionIds());

      expect(list).toHaveLength(2);
      expect(list.map((p) => p.title).sort()).toEqual(["Archived", "Draft"]);
    });

    it("filters with multiple conditions", async () => {
      const after = new Date("2025-01-01T00:00:00Z");
      await postRepo.write(
        postModel(postRepo.generateId(), "News", "B1", new Date("2025-02-01T10:00:00Z")),
        collectionIds(),
      );
      await postRepo.write(
        postModel(postRepo.generateId(), "News", "B2", new Date("2024-06-01T10:00:00Z")),
        collectionIds(),
      );
      await postRepo.write(
        postModel(postRepo.generateId(), "Other", "B3", new Date("2025-03-01T10:00:00Z")),
        collectionIds(),
      );

      const list = await postRepo.query(
        (q) => q.where("title", "==", "News").where("publishedAt", ">", after),
        collectionIds(),
      );

      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ title: "News", body: "B1" });
    });

    it("returns results in orderBy order", async () => {
      await postRepo.write(
        postModel(postRepo.generateId(), "Third", "B1", new Date("2025-03-01T10:00:00Z")),
        collectionIds(),
      );
      await postRepo.write(
        postModel(postRepo.generateId(), "First", "B2", new Date("2025-01-01T10:00:00Z")),
        collectionIds(),
      );
      await postRepo.write(
        postModel(postRepo.generateId(), "Second", "B3", new Date("2025-02-01T10:00:00Z")),
        collectionIds(),
      );

      const list = await postRepo.query((q) => q.orderBy("publishedAt", "asc"), collectionIds());

      expect(list).toHaveLength(3);
      expect(list.map((p) => p.title)).toEqual(["First", "Second", "Third"]);
    });
  });
});
