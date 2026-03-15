import type { BaseModel } from "firestore-storage-core";

export interface UserModel extends BaseModel {
  name: string;
  email: string;
}

export interface PostModel extends BaseModel {
  title: string;
  body: string;
  publishedAt: Date;
}
