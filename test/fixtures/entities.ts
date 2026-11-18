export class User {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly email: string,
  ) {}
}

export class Post {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly body: string,
    readonly publishedAt: Date,
  ) {}
}

export class Note {
  constructor(
    readonly id: string,
    readonly text: string,
    readonly deleted: boolean,
  ) {}
}
