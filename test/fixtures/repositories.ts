import type { Firestore } from "@google-cloud/firestore";
import { Repository } from "firestore-storage-core";
import { EntityRepository, ModelRepository, SoftDeletableEntityRepository } from "../../src";
import type { Note, Post, User } from "./entities";
import type { NoteModel, PostModel, UserModel } from "./models";
import { NotesCollection, PostsCollection, UserNotesCollection, UsersCollection } from "./paths";
import { NoteTransformer, PostTransformer, UserTransformer } from "./transformers";

@Repository({ path: UsersCollection })
export class UserModelRepository extends ModelRepository<UserModel, typeof UsersCollection> {}

@Repository({ path: PostsCollection })
export class PostModelRepository extends ModelRepository<PostModel, typeof PostsCollection> {}

@Repository({ path: NotesCollection })
export class NoteModelRepository extends ModelRepository<NoteModel, typeof NotesCollection> {}

@Repository({ path: UserNotesCollection })
export class UserNoteModelRepository extends ModelRepository<NoteModel, typeof UserNotesCollection> {}

export class UserEntityRepository extends EntityRepository<User, UserModel> {
  constructor(firestore: Firestore) {
    super(new UserModelRepository(firestore), new UserTransformer());
  }
}

export class PostEntityRepository extends EntityRepository<Post, PostModel> {
  constructor(firestore: Firestore) {
    super(new PostModelRepository(firestore), new PostTransformer());
  }
}

export class NoteEntityRepository extends SoftDeletableEntityRepository<Note, NoteModel> {
  constructor(firestore: Firestore) {
    super(new NoteModelRepository(firestore), new NoteTransformer());
  }
}

export class UserNoteEntityRepository extends SoftDeletableEntityRepository<Note, NoteModel> {
  constructor(firestore: Firestore) {
    super(new UserNoteModelRepository(firestore), new NoteTransformer());
  }
}
