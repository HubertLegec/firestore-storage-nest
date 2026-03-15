import { Test } from "@nestjs/testing";
import { FIRESTORE } from "../src/core";
import { TestFirestoreClearService, withMemoryStorage } from "../src/testing";
import type { User } from "./fixtures/entities";
import { UserEntityRepository } from "./fixtures/repositories";
import { getTestFirestore } from "./helpers/firestore";

describe("User entity (root collection)", () => {
  let userRepo: UserEntityRepository;
  let clearService: TestFirestoreClearService;

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
    clearService = module.get(TestFirestoreClearService);
    await clearService.clear("users");
  });

  it("create: saves a new user and returns it with generated id", async () => {
    const user: Omit<User, "id"> = { name: "Alice", email: "alice@example.com" };
    const id = userRepo.generateId();
    const toSave: User = { ...user, id };
    const saved = await userRepo.save(toSave);
    expect(saved.id).toBe(id);
    expect(saved.name).toBe("Alice");
    expect(saved.email).toBe("alice@example.com");
  });

  it("update: overwrites existing user by id", async () => {
    const id = userRepo.generateId();
    await userRepo.save({ id, name: "Bob", email: "bob@old.com" });
    const updated = await userRepo.save({ id, name: "Bob", email: "bob@new.com" });
    expect(updated.id).toBe(id);
    expect(updated.email).toBe("bob@new.com");
  });

  it("fetch: findById returns saved user", async () => {
    const id = userRepo.generateId();
    await userRepo.save({ id, name: "Carol", email: "carol@example.com" });
    const found = await userRepo.findById(id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(id);
    expect(found!.name).toBe("Carol");
  });

  it("fetch: findById returns null when not found", async () => {
    const found = await userRepo.findById("nonexistent-id");
    expect(found).toBeNull();
  });

  it("list: returns all users", async () => {
    const id1 = userRepo.generateId();
    const id2 = userRepo.generateId();
    await userRepo.save({ id: id1, name: "User1", email: "u1@example.com" });
    await userRepo.save({ id: id2, name: "User2", email: "u2@example.com" });
    const list = await userRepo.list();
    expect(list).toHaveLength(2);
    expect(list.map((u) => u.id).sort()).toEqual([id1, id2].sort());
  });

  it("list: can filter by attributes", async () => {
    const id1 = userRepo.generateId();
    const id2 = userRepo.generateId();
    await userRepo.save({ id: id1, name: "Alice", email: "alice@example.com" });
    await userRepo.save({ id: id2, name: "Bob", email: "bob@example.com" });
    const list = await userRepo.list({ name: "Alice" });
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("Alice");
  });

  it("delete: removes user by id", async () => {
    const id = userRepo.generateId();
    await userRepo.save({ id, name: "ToDelete", email: "del@example.com" });
    await userRepo.delete(id);
    const found = await userRepo.findById(id);
    expect(found).toBeNull();
  });
});
