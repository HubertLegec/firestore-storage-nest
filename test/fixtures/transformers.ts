import { Timestamp } from "@google-cloud/firestore";
import type { ModelTransformer } from "../../src/model-transformer";
import { Post, User } from "./entities";
import type { PostModel, UserModel } from "./models";

/** Normalizes Firestore Timestamp or Date to Date (emulator/in-memory returns Timestamp). */
function toDate(value: Date | number | Timestamp): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "number") {
    return new Date(value);
  }
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return new Date(value as unknown as number);
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
