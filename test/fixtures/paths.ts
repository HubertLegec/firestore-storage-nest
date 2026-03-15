import { CollectionPath } from "firestore-storage-core";

/** Root collection: /users/{userId} */
export const UsersCollection = new CollectionPath("users", "userId");

/** Nested collection: /users/{userId}/posts/{postId} */
export const PostsCollection = new CollectionPath("posts", "postId", UsersCollection);
