import type { Firestore } from "@google-cloud/firestore";
import { BaseRepository } from "firestore-storage";
import { Repository } from "firestore-storage-core";
import { EntityRepository } from "../../src/entity-repository";
import type { Post, User } from "./entities";
import type { PostModel, UserModel } from "./models";
import { PostsCollection, UsersCollection } from "./paths";
import { PostTransformer, UserTransformer } from "./transformers";

@Repository({ path: UsersCollection })
export class UserModelRepository extends BaseRepository<UserModel, typeof UsersCollection> {}

@Repository({ path: PostsCollection })
export class PostModelRepository extends BaseRepository<PostModel, typeof PostsCollection> {}

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
