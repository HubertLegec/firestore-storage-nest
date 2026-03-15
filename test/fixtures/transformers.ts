import type { ModelTransformer } from "../../src/model-transformer";
import { Post, User } from "./entities";
import type { PostModel, UserModel } from "./models";

/** Normalizes Firestore Timestamp or Date to Date (emulator returns Timestamp). */
function toDate(value: Date | number): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
}

export class UserTransformer implements ModelTransformer<User, UserModel> {
  fromModel(model: UserModel): User {
    return new User(model.id, model.name, model.email);
  }

  toModel(entity: User): UserModel {
    return { id: entity.id, name: entity.name, email: entity.email, _rawPath: "" };
  }
}

export class PostTransformer implements ModelTransformer<Post, PostModel> {
  fromModel(model: PostModel): Post {
    return new Post(model.id, model.title, model.body, toDate(model.publishedAt));
  }

  toModel(entity: Post): PostModel {
    return {
      id: entity.id,
      title: entity.title,
      body: entity.body,
      publishedAt: entity.publishedAt,
      _rawPath: "",
    };
  }
}
