import type { Firestore } from "@google-cloud/firestore";
import { Repository } from "firestore-storage-core";
import { EntityRepository, ModelRepository } from "../../src";
import type { Post, User } from "./entities";
import type { PostModel, UserModel } from "./models";
import { PostsCollection, UsersCollection } from "./paths";
import { PostTransformer, UserTransformer } from "./transformers";

@Repository({ path: UsersCollection })
export class UserModelRepository extends ModelRepository<UserModel, typeof UsersCollection> {}

@Repository({ path: PostsCollection })
export class PostModelRepository extends ModelRepository<PostModel, typeof PostsCollection> {}

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
