import type { BaseModel } from "firestore-storage-core";
import type { SoftDeletableModel } from "../../src";

export interface UserModel extends BaseModel {
  name: string;
  email: string;
}

export interface PostModel extends BaseModel {
  title: string;
  body: string;
  publishedAt: Date;
}

export interface NoteModel extends SoftDeletableModel {
  text: string;
}
