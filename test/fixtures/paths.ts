import { CollectionPath } from "firestore-storage-core";

/** Root collection: /users/{userId} */
export const UsersCollection = new CollectionPath<"userId", string, void>("users", "userId");

/** Nested collection: /users/{userId}/posts/{postId} */
export const PostsCollection = new CollectionPath<"postId", string, { userId: string }>(
  "posts",
  "postId",
  UsersCollection,
);
