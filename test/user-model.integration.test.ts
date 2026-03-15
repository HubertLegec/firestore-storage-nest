import { Test } from "@nestjs/testing";
import { FIRESTORE } from "../src/core";
import { TestFirestoreClearService, withMemoryStorage } from "../src/testing";
import type { UserModel } from "./fixtures/models";
import { UserModelRepository } from "./fixtures/repositories";
import { getTestFirestore } from "./helpers/firestore";

describe("User model (root collection)", () => {
  let userRepo: UserModelRepository;
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
    userRepo = new UserModelRepository(firestore);
    clearService = module.get(TestFirestoreClearService);
  });

  beforeEach(async () => {
    await clearService.clear("users");
  });

  function userModel(id: string, name: string, email: string): UserModel {
    return { id, name, email, _rawPath: "" };
  }

  it("writes a new user and returns it with generated id", async () => {
    const id = userRepo.generateId();
    const model: UserModel = userModel(id, "Alice", "alice@example.com");

    const saved = await userRepo.write(model);

    expect(saved).toMatchObject({ id, name: "Alice", email: "alice@example.com" });
  });

  it("updates existing user via write", async () => {
    const id = userRepo.generateId();
    await userRepo.write(userModel(id, "Bob", "bob@old.com"));

    const updated = await userRepo.write(userModel(id, "Bob", "bob@new.com"));

    expect(updated).toMatchObject({ id, name: "Bob", email: "bob@new.com" });
  });

  it("findById returns saved model", async () => {
    const id = userRepo.generateId();
    await userRepo.write(userModel(id, "Carol", "carol@example.com"));

    const found = await userRepo.findById({ userId: id });

    expect(found).toMatchObject({ id, name: "Carol", email: "carol@example.com" });
  });

  it("findById returns null when not found", async () => {
    const found = await userRepo.findById({ userId: "nonexistent-id" });

    expect(found).toBeNull();
  });

  it("lists all users", async () => {
    const id1 = userRepo.generateId();
    const id2 = userRepo.generateId();
    await userRepo.write(userModel(id1, "User1", "u1@example.com"));
    await userRepo.write(userModel(id2, "User2", "u2@example.com"));

    const list = await userRepo.list(null);

    expect(list).toHaveLength(2);
    expect(list.map((u) => u.id).sort()).toEqual([id1, id2].sort());
  });

  it("lists with filter by attributes", async () => {
    const id1 = userRepo.generateId();
    const id2 = userRepo.generateId();
    await userRepo.write(userModel(id1, "Alice", "alice@example.com"));
    await userRepo.write(userModel(id2, "Bob", "bob@example.com"));

    const list = await userRepo.list({ name: "Alice" });

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: id1, name: "Alice" });
  });

  it("removes user by document ids", async () => {
    const id = userRepo.generateId();
    await userRepo.write(userModel(id, "ToDelete", "del@example.com"));
    await userRepo.delete({ userId: id });

    const found = await userRepo.findById({ userId: id });

    expect(found).toBeNull();
  });

  describe("query", () => {
    it("filters with '>' condition", async () => {
      await userRepo.write(userModel(userRepo.generateId(), "Alice", "alice@example.com"));
      await userRepo.write(userModel(userRepo.generateId(), "Bob", "bob@example.com"));
      await userRepo.write(userModel(userRepo.generateId(), "Carol", "carol@example.com"));

      const list = await userRepo.query((q) => q.where("name", ">", "B"), undefined);

      expect(list).toHaveLength(2);
      expect(list.map((u) => u.name).sort()).toEqual(["Bob", "Carol"]);
    });

    it("filters with '!=' condition", async () => {
      const id1 = userRepo.generateId();
      const id2 = userRepo.generateId();
      await userRepo.write(userModel(id1, "Alice", "alice@example.com"));
      await userRepo.write(userModel(id2, "Bob", "bob@example.com"));
      await userRepo.write(userModel(userRepo.generateId(), "Carol", "carol@example.com"));

      const list = await userRepo.query((q) => q.where("email", "!=", "bob@example.com"), undefined);

      expect(list).toHaveLength(2);
      expect(list.map((u) => u.email).sort()).toEqual(["alice@example.com", "carol@example.com"]);
    });

    it("filters with multiple conditions", async () => {
      await userRepo.write(userModel(userRepo.generateId(), "Alice", "alice@example.com"));
      await userRepo.write(userModel(userRepo.generateId(), "Bob", "bob@example.com"));
      await userRepo.write(userModel(userRepo.generateId(), "Alice", "alice@example.com"));

      const list = await userRepo.query(
        (q) => q.where("name", "==", "Alice").where("email", "==", "alice@example.com"),
        undefined,
      );

      expect(list).toHaveLength(2);
      expect(list.every((u) => u.name === "Alice" && u.email === "alice@example.com")).toBe(true);
    });

    it("returns results in orderBy order", async () => {
      await userRepo.write(userModel(userRepo.generateId(), "Carol", "c@example.com"));
      await userRepo.write(userModel(userRepo.generateId(), "Alice", "a@example.com"));
      await userRepo.write(userModel(userRepo.generateId(), "Bob", "b@example.com"));

      const list = await userRepo.query((q) => q.orderBy("name", "asc"));

      expect(list).toHaveLength(3);
      expect(list.map((u) => u.name)).toEqual(["Alice", "Bob", "Carol"]);
    });
  });
});
