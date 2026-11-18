import type { Firestore } from "@google-cloud/firestore";
import { Test } from "@nestjs/testing";
import {
  FIRESTORE,
  TestFirestoreClearService,
  TransactionProvider,
  withMemoryStorage,
  type SoftDeletableEntityRepository,
} from "../src";
import { Note } from "./fixtures/entities";
import type { NoteModel } from "./fixtures/models";
import {
  NoteEntityRepository,
  NoteModelRepository,
  UserNoteEntityRepository,
  UserNoteModelRepository,
} from "./fixtures/repositories";
import { getTestFirestore } from "./helpers/firestore";

/** Hides drafts on top of deleted notes, combining its own rule with the soft-delete filter. */
class PublishedNoteEntityRepository extends NoteEntityRepository {
  protected override modelCustomFilter(model: NoteModel): boolean {
    return super.modelCustomFilter(model) && !model.text.startsWith("draft:");
  }
}

type ScopeName = "root collection" | "nested collection";

interface Scope {
  readonly repository: SoftDeletableEntityRepository<Note, NoteModel>;
  readonly parentIds: string[];
  /** Writes a note the way code that predates soft deletion did: with no `deleted` field at all. */
  writeWithoutDeletedField(id: string, text: string): Promise<void>;
}

interface ReadContext {
  readonly repository: SoftDeletableEntityRepository<Note, NoteModel>;
  readonly parentIds: string[];
  readonly ids: string[];
  readonly transactionProvider: TransactionProvider;
}

type Read = (context: ReadContext) => Promise<Note[]>;

const SCOPE_NAMES: ScopeName[] = ["root collection", "nested collection"];

function createScopes(firestore: Firestore, userId: string): Record<ScopeName, Scope> {
  const noteModelRepository = new NoteModelRepository(firestore);
  const userNoteModelRepository = new UserNoteModelRepository(firestore);
  return {
    "root collection": {
      repository: new NoteEntityRepository(firestore),
      parentIds: [],
      writeWithoutDeletedField: async (id, text) => {
        await noteModelRepository.write({ id, text }, undefined);
      },
    },
    "nested collection": {
      repository: new UserNoteEntityRepository(firestore),
      parentIds: [userId],
      writeWithoutDeletedField: async (id, text) => {
        await userNoteModelRepository.write({ id, text }, { userId });
      },
    },
  };
}

function withoutMissing(notes: (Note | null)[]): Note[] {
  return notes.filter((note): note is Note => note !== null);
}

function sortById(notes: Note[]): Note[] {
  return [...notes].sort((left, right) => left.id.localeCompare(right.id));
}

const filteredReads: [string, Read][] = [
  [
    "findById",
    async ({ repository, parentIds, ids }) =>
      withoutMissing(await Promise.all(ids.map((id) => repository.findById(id, ...parentIds)))),
  ],
  ["findAllById", ({ repository, parentIds, ids }) => repository.findAllById(ids, ...parentIds)],
  ["list", ({ repository, parentIds }) => repository.list(undefined, ...parentIds)],
  ["query", ({ repository, parentIds }) => repository.query((queryBuilder) => queryBuilder, ...parentIds)],
  [
    "findByIdInTransaction",
    ({ repository, parentIds, ids, transactionProvider }) =>
      transactionProvider.withTransaction(async (transaction) =>
        withoutMissing(
          await Promise.all(ids.map((id) => repository.findByIdInTransaction(transaction, id, ...parentIds))),
        ),
      ),
  ],
];

const includingDeletedReads: [string, Read][] = [
  [
    "findByIdIncludingDeleted",
    async ({ repository, parentIds, ids }) =>
      withoutMissing(await Promise.all(ids.map((id) => repository.findByIdIncludingDeleted(id, ...parentIds)))),
  ],
  [
    "findAllByIdIncludingDeleted",
    ({ repository, parentIds, ids }) => repository.findAllByIdIncludingDeleted(ids, ...parentIds),
  ],
  ["listIncludingDeleted", ({ repository, parentIds }) => repository.listIncludingDeleted(undefined, ...parentIds)],
  [
    "queryIncludingDeleted",
    ({ repository, parentIds }) => repository.queryIncludingDeleted((queryBuilder) => queryBuilder, ...parentIds),
  ],
];

describe("SoftDeletableEntityRepository", () => {
  let firestore: Firestore;
  let clearService: TestFirestoreClearService;
  let transactionProvider: TransactionProvider;
  let userId: string;
  let otherUserId: string;
  let scopes: Record<ScopeName, Scope>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        withMemoryStorage({
          useFactory: () => getTestFirestore(),
        }),
      ],
    }).compile();

    firestore = module.get<Firestore>(FIRESTORE);
    clearService = module.get(TestFirestoreClearService);
    transactionProvider = module.get(TransactionProvider);
  });

  beforeEach(async () => {
    await clearService.clear("notes");
    userId = firestore.collection("users").doc().id;
    otherUserId = firestore.collection("users").doc().id;
    scopes = createScopes(firestore, userId);
  });

  afterEach(async () => {
    await clearService.clear(`users/${userId}/notes`);
    await clearService.clear(`users/${otherUserId}/notes`);
  });

  describe.each(SCOPE_NAMES)("in a %s", (scopeName) => {
    let repository: SoftDeletableEntityRepository<Note, NoteModel>;
    let parentIds: string[];

    beforeEach(() => {
      ({ repository, parentIds } = scopes[scopeName]);
    });

    describe("delete", () => {
      it("marks the document deleted and keeps its other fields", async () => {
        const note = await repository.save(new Note(repository.generateId(), "Hello", false), ...parentIds);

        await repository.delete(note.id, ...parentIds);

        expect(await repository.findByIdIncludingDeleted(note.id, ...parentIds)).toEqual(
          new Note(note.id, "Hello", true),
        );
      });

      it("creates no document and doesn't throw for a missing id", async () => {
        const missingId = repository.generateId();

        await expect(repository.delete(missingId, ...parentIds)).resolves.toBeUndefined();

        expect(await repository.findByIdIncludingDeleted(missingId, ...parentIds)).toBeNull();
        expect(await repository.listIncludingDeleted(undefined, ...parentIds)).toEqual([]);
      });
    });

    describe("reads", () => {
      let active: Note;
      let withoutDeletedField: Note;
      let deleted: Note;
      let ids: string[];

      beforeEach(async () => {
        active = await repository.save(new Note(repository.generateId(), "Active", false), ...parentIds);
        withoutDeletedField = new Note(repository.generateId(), "Written before soft deletion", false);
        await scopes[scopeName].writeWithoutDeletedField(withoutDeletedField.id, withoutDeletedField.text);
        const toDelete = await repository.save(new Note(repository.generateId(), "Deleted", false), ...parentIds);
        await repository.delete(toDelete.id, ...parentIds);
        deleted = new Note(toDelete.id, "Deleted", true);
        ids = [active.id, withoutDeletedField.id, deleted.id];
      });

      it.each(filteredReads)(
        "%s returns active documents and documents with no deleted field, and leaves out deleted ones",
        async (_name, read) => {
          const result = await read({ repository, parentIds, ids, transactionProvider });

          expect(sortById(result)).toEqual(sortById([active, withoutDeletedField]));
        },
      );

      it.each(includingDeletedReads)("%s returns deleted and active documents", async (_name, read) => {
        const result = await read({ repository, parentIds, ids, transactionProvider });

        expect(sortById(result)).toEqual(sortById([active, withoutDeletedField, deleted]));
      });

      it("findByIdIncludingDeleted returns null for a missing id", async () => {
        expect(await repository.findByIdIncludingDeleted(repository.generateId(), ...parentIds)).toBeNull();
      });

      it("findAllByIdIncludingDeleted returns an empty array for empty ids", async () => {
        expect(await repository.findAllByIdIncludingDeleted([], ...parentIds)).toEqual([]);
      });
    });

    describe("bulkDelete", () => {
      it("is a no-op for an empty array", async () => {
        await expect(repository.bulkDelete([], ...parentIds)).resolves.toBeUndefined();
      });

      it("soft-deletes every document across more than one 500-item chunk and removes none", async () => {
        const notes = Array.from(
          { length: 501 },
          (_, index) => new Note(repository.generateId(), `Note ${index}`, false),
        );
        await repository.bulkSave(notes, ...parentIds);

        await repository.bulkDelete(
          notes.map((note) => note.id),
          ...parentIds,
        );

        expect(await repository.list(undefined, ...parentIds)).toEqual([]);
        const stored = await repository.listIncludingDeleted(undefined, ...parentIds);
        expect(sortById(stored)).toEqual(sortById(notes.map((note) => new Note(note.id, note.text, true))));
      });

      it("rejects a chunk containing a missing id without creating a document", async () => {
        const missingId = repository.generateId();

        await expect(repository.bulkDelete([missingId], ...parentIds)).rejects.toThrow();

        expect(await repository.listIncludingDeleted(undefined, ...parentIds)).toEqual([]);
      });
    });

    describe("hardDelete", () => {
      it.each([false, true])("removes a document whose deleted flag is %s", async (deleted) => {
        const note = await repository.save(new Note(repository.generateId(), "Doomed", deleted), ...parentIds);

        await repository.hardDelete(note.id, ...parentIds);

        expect(await repository.findByIdIncludingDeleted(note.id, ...parentIds)).toBeNull();
      });

      it("doesn't throw for a missing id", async () => {
        await expect(repository.hardDelete(repository.generateId(), ...parentIds)).resolves.toBeUndefined();
      });
    });

    describe("bulkHardDelete", () => {
      it("is a no-op for an empty array", async () => {
        await expect(repository.bulkHardDelete([], ...parentIds)).resolves.toBeUndefined();
      });

      it("removes active and soft-deleted documents across more than one 500-item chunk", async () => {
        const notes = Array.from(
          { length: 501 },
          (_, index) => new Note(repository.generateId(), `Note ${index}`, index % 2 === 0),
        );
        await repository.bulkSave(notes, ...parentIds);

        await repository.bulkHardDelete(
          notes.map((note) => note.id),
          ...parentIds,
        );

        expect(await repository.listIncludingDeleted(undefined, ...parentIds)).toEqual([]);
      });

      it("skips missing ids and still removes the existing ones", async () => {
        const existing = await repository.save(new Note(repository.generateId(), "Existing", false), ...parentIds);

        await repository.bulkHardDelete([repository.generateId(), existing.id], ...parentIds);

        expect(await repository.listIncludingDeleted(undefined, ...parentIds)).toEqual([]);
      });
    });
  });

  describe("bulkHardDeleteAll", () => {
    it("is a no-op for an empty array", async () => {
      await expect(scopes["nested collection"].repository.bulkHardDeleteAll([])).resolves.toBeUndefined();
    });

    it("removes documents across different parents", async () => {
      const repository = scopes["nested collection"].repository;
      const noteOfUser = new Note(repository.generateId(), "Of user", false);
      const noteOfOtherUser = new Note(repository.generateId(), "Of other user", true);
      await repository.bulkSaveAll([
        { value: noteOfUser, parentIds: [userId] },
        { value: noteOfOtherUser, parentIds: [otherUserId] },
      ]);

      await repository.bulkHardDeleteAll([
        { id: noteOfUser.id, parentIds: [userId] },
        { id: noteOfOtherUser.id, parentIds: [otherUserId] },
      ]);

      expect(await repository.listIncludingDeleted(undefined, userId)).toEqual([]);
      expect(await repository.listIncludingDeleted(undefined, otherUserId)).toEqual([]);
    });
  });

  describe("bulkDeleteAll", () => {
    it("is a no-op for an empty array", async () => {
      await expect(scopes["nested collection"].repository.bulkDeleteAll([])).resolves.toBeUndefined();
    });

    it("soft-deletes documents across different parents and removes none", async () => {
      const repository = scopes["nested collection"].repository;
      const noteOfUser = new Note(repository.generateId(), "Of user", false);
      const noteOfOtherUser = new Note(repository.generateId(), "Of other user", false);
      await repository.bulkSaveAll([
        { value: noteOfUser, parentIds: [userId] },
        { value: noteOfOtherUser, parentIds: [otherUserId] },
      ]);

      await repository.bulkDeleteAll([
        { id: noteOfUser.id, parentIds: [userId] },
        { id: noteOfOtherUser.id, parentIds: [otherUserId] },
      ]);

      expect(await repository.list(undefined, userId)).toEqual([]);
      expect(await repository.list(undefined, otherUserId)).toEqual([]);
      expect(await repository.listIncludingDeleted(undefined, userId)).toEqual([
        new Note(noteOfUser.id, "Of user", true),
      ]);
      expect(await repository.listIncludingDeleted(undefined, otherUserId)).toEqual([
        new Note(noteOfOtherUser.id, "Of other user", true),
      ]);
    });
  });

  describe("modelCustomFilter override", () => {
    it("keeps deleted documents hidden when a subclass combines its rule with super", async () => {
      const repository = new PublishedNoteEntityRepository(firestore);
      const published = await repository.save(new Note(repository.generateId(), "Published", false));
      await repository.save(new Note(repository.generateId(), "draft: Unfinished", false));
      const deleted = await repository.save(new Note(repository.generateId(), "Published, then deleted", false));
      await repository.delete(deleted.id);

      expect(await repository.list()).toEqual([published]);
      expect(await repository.findById(deleted.id)).toBeNull();
    });
  });
});
