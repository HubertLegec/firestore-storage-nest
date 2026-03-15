# firestore-storage-nest

A **NestJS module** for easy integration with [Firestore](https://cloud.google.com/firestore) in NestJS applications, built for use with [firestore-storage](https://www.npmjs.com/package/firestore-storage) v7. It provides a shared Firestore instance via dependency injection and, for tests, an **in-memory Firestore** so you can run tests without the Firebase Emulator.

Published on [npm](https://www.npmjs.com/package/firestore-storage-nest).

## Features

- **Production**: Register Firestore once with `forRootAsync` and inject it anywhere with `@Inject(FIRESTORE)`.
- **Testing**: Use `withMemoryStorage()` for an in-memory Firestore (powered by [@firebase-bridge/firestore-admin](https://www.npmjs.com/package/@firebase-bridge/firestore-admin), Apache-2.0). No emulator required.
- **Repository helpers**: `EntityRepository`, `ModelTransformer`, and path helpers (`pathToDocumentIds`, `pathToCollectionIds`) for building repositories on top of firestore-storage v7.

## Installation

```bash
pnpm add firestore-storage-nest firestore-storage firestore-storage-core @google-cloud/firestore
# or
npm i firestore-storage-nest firestore-storage firestore-storage-core @google-cloud/firestore
```

For tests using the built-in in-memory Firestore, also install the optional dependency:

```bash
pnpm add -D @firebase-bridge/firestore-admin
# or rely on the package’s optional dependency
```

**Peer dependencies:** `@nestjs/common` (≥10), `@google-cloud/firestore` (≥6), `firestore-storage` (≥7), `firestore-storage-core` (≥7).

## Production usage

Register the module with your Firestore instance (e.g. from `firebase-admin`):

```ts
import { Module } from "@nestjs/common";
import { FirestoreStorageNestModule, FIRESTORE } from "firestore-storage-nest";
import { getFirestore } from "firebase-admin/firestore";

@Module({
  imports: [
    {
      ...FirestoreStorageNestModule.forRootAsync({
        useFactory: () => getFirestore(),
      }),
      global: true,
    },
  ],
})
export class AppModule {}
```

Inject the Firestore instance where needed:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { FIRESTORE } from "firestore-storage-nest";
import type { Firestore } from "@google-cloud/firestore";

@Injectable()
export class MyService {
  constructor(@Inject(FIRESTORE) private readonly firestore: Firestore) {}
}
```

## Testing with in-memory Firestore

Use the built-in in-memory Firestore so tests don’t need the Firebase Emulator:

```ts
import { Test } from "@nestjs/testing";
import {
  FirestoreStorageNestModule,
  TestFirestoreClearService,
} from "firestore-storage-nest";

const module = await Test.createTestingModule({
  imports: [FirestoreStorageNestModule.withMemoryStorage()],
  // ... your providers
}).compile();

// In beforeEach: clear collections between tests
const clearService = module.get(TestFirestoreClearService);
await clearService.clear("users");
await clearService.clear("posts");
```

For a custom in-memory instance, use:

```ts
FirestoreStorageNestModule.withMemoryStorage({
  useFactory: () => yourCustomFirestore,
})
```

`createMemoryFirestore()` from this package returns a real Firestore-compatible instance (from `@firebase-bridge/firestore-admin`).

### Running tests against the Firebase Emulator

To confirm compatibility with real Firestore, run the same test suite against the [Firestore emulator](https://firebase.google.com/docs/emulator_suite/connect_firestore):

1. Start the emulator: `firebase emulators:start --only firestore` (default port 8080).
2. Run tests with the emulator: `FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm test` (or `npm run test:emulator` if you add that script).

The package’s integration tests use a helper that switches to the emulator when `FIRESTORE_EMULATOR_HOST` is set, so the same tests run with in-memory Firestore by default and with the emulator when that env var is set.

## Repository helpers

- **`EntityRepository<E, M>`** – Abstract base for entity repositories (varargs API over firestore-storage v7).
- **`ModelTransformer<E, M>`** – Interface for converting between entity `E` and firestore-storage model `M`.
- **`pathToDocumentIds(path, ids)`** / **`pathToCollectionIds(path, ids)`** – Build v7 `DocumentIds` / `CollectionIds` from an ordered list of ids.
- **`Id`** – Type alias for entity id (string).

## API summary

| Export | Description |
|--------|-------------|
| `FIRESTORE` | Injection token for the Firestore instance |
| `FirestoreStorageNestModule` | Module with `forRootAsync(options)` and `withMemoryStorage(options?)` |
| `TestFirestoreClearService` | Service to clear collections in tests |
| `createMemoryFirestore()` | Returns an in-memory Firestore instance |
| `EntityRepository`, `ModelTransformer`, `pathToDocumentIds`, `pathToCollectionIds`, `Id` | Repository and path helpers |

## Development

From the repo:

- `pnpm test` – run tests (in-memory Firestore).
- `pnpm test:emulator` – run the same tests against the Firestore emulator (set `FIRESTORE_EMULATOR_HOST=localhost:8080`; start the emulator first).

The tests in `test/` demonstrate root and nested entity CRUD (create, update, fetch, list, delete) using `EntityRepository`, `withMemoryStorage`, and `TestFirestoreClearService`.

### Releasing

Releases are automated via GitHub Actions (`.github/workflows/release.yml`). To publish:

1. Set the version in `package.json` (e.g. `0.0.2`).
2. Commit, push to `main`, then create and push a tag matching that version: `git tag v0.0.2 && git push origin v0.0.2`.

The workflow will: publish the package to npm (using the version in `package.json`), create a GitHub Release from the tag with generated release notes, then bump the version on `main` (patch increment) and push the commit.

**Required:** Add an `NPM_TOKEN` repository secret (Settings → Secrets and variables → Actions). Use an npm [automation token](https://docs.npmjs.com/creating-and-viewing-access-tokens) or granular access token with “Publish packages” permission.

## License

MIT
