import { CollectionPath } from "firestore-storage-core";

/** Root collection: /users/{userId} */
export const UsersCollection = new CollectionPath<"userId", string, void>("users", "userId");

/** Nested collection: /users/{userId}/posts/{postId} */
export const PostsCollection = new CollectionPath<"postId", string, { userId: string }>(
  "posts",
  "postId",
  UsersCollection,
);

/** Soft-deletable root collection: /notes/{noteId} */
export const NotesCollection = new CollectionPath<"noteId", string, void>("notes", "noteId");

/** Soft-deletable nested collection: /users/{userId}/notes/{noteId} */
export const UserNotesCollection = new CollectionPath<"noteId", string, { userId: string }>(
  "notes",
  "noteId",
  UsersCollection,
);
