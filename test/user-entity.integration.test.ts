import { Test } from "@nestjs/testing";
import { FIRESTORE } from "../src/core";
import { TestFirestoreClearService, withMemoryStorage } from "../src/testing";
import type { User } from "./fixtures/entities";
import { UserEntityRepository } from "./fixtures/repositories";
import { getTestFirestore } from "./helpers/firestore";

describe("User entity (root collection)", () => {
  let userRepo: UserEntityRepository;
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
    userRepo = new UserEntityRepository(firestore);
    clearService = module.get(TestFirestoreClearService);
  });

  beforeEach(async () => {
    await clearService.clear("users");
  });

  it("creates a new user and returns it with generated id", async () => {
    const user: User = { id: userRepo.generateId(), name: "Alice", email: "alice@example.com" };

    const saved = await userRepo.save(user);

    expect(saved).toEqual({ id: user.id, name: "Alice", email: "alice@example.com" });
  });

  it("updates existing user", async () => {
    const id = userRepo.generateId();
    await userRepo.save({ id, name: "Bob", email: "bob@old.com" });

    const updated = await userRepo.save({ id, name: "Bob", email: "bob@new.com" });

    expect(updated).toEqual(expect.objectContaining({ id, name: "Bob", email: "bob@new.com" }));
  });

  it("findById returns saved user", async () => {
    const id = userRepo.generateId();
    await userRepo.save({ id, name: "Carol", email: "carol@example.com" });

    const found = await userRepo.findById(id);

    expect(found).toEqual(expect.objectContaining({ id, name: "Carol", email: "carol@example.com" }));
  });

  it("findById returns null when not found", async () => {
    const found = await userRepo.findById("nonexistent-id");

    expect(found).toBeNull();
  });

  it("lists all users", async () => {
    const id1 = userRepo.generateId();
    const id2 = userRepo.generateId();
    await userRepo.save({ id: id1, name: "User1", email: "u1@example.com" });
    await userRepo.save({ id: id2, name: "User2", email: "u2@example.com" });

    const list = await userRepo.list();

    expect(list).toHaveLength(2);
    expect(list.map((u) => u.id).sort()).toEqual([id1, id2].sort());
  });

  it("lists with filter by attributes", async () => {
    const id1 = userRepo.generateId();
    const id2 = userRepo.generateId();
    await userRepo.save({ id: id1, name: "Alice", email: "alice@example.com" });
    await userRepo.save({ id: id2, name: "Bob", email: "bob@example.com" });

    const list = await userRepo.list({ name: "Alice" });

    expect(list).toEqual([expect.objectContaining({ id: id1, name: "Alice" })]);
  });

  it("removes user by id", async () => {
    const id = userRepo.generateId();
    await userRepo.save({ id, name: "ToDelete", email: "del@example.com" });
    await userRepo.delete(id);

    const found = await userRepo.findById(id);

    expect(found).toBeNull();
  });
});
