# CLAUDE.md

Guidance for working with `@hubert.legec/firestore-storage-nest`.

## Project Overview

A thin NestJS adapter around the [`firestore-storage`](https://github.com/freshfox/firestore-storage) repository library:

- DI plumbing (`FIRESTORE` token, `FirestoreStorageNestModule`, `withMemoryStorage`).
- `ModelRepository<T, Path>` — a subclass of upstream's `BaseRepository` that adds batch and document
  reference helpers (`withBatch`, `docRef`, `newDocRef`) using its legitimate protected access to
  `firestore`. Project model repositories should extend this class, not upstream's `BaseRepository`.
- `EntityRepository<E, M>` — a composition wrapper that maps a domain entity to a Firestore-backed
  `ModelRepository`. Provides `save`, `bulkSave*`, `delete`, `bulkDelete*`, `findById`, `findAllById`,
  `list`, `listAll`, `query`, `generateId`.
- `ModelTransformer<E, M>` — entity ↔ model conversion contract used by `EntityRepository`.
- An in-memory backend (`createMemoryFirestore`) and `TestFirestoreClearService` for tests.

## Commands

```bash
pnpm build               # tsc build of dist/
pnpm test                # vitest run (in-memory backend)
pnpm test:emulator       # FIRESTORE_EMULATOR_HOST=localhost:8080 vitest run
pnpm lint                # ESLint check
pnpm lint:fix            # ESLint auto-fix
```

The emulator suite requires a running Firestore emulator on `localhost:8080`
(`firebase emulators:start --only firestore`). `globalSetup.ts` aborts the run if it's not reachable.

## Architecture Rules

### Visibility is a contract — never bypass it

**Never** access another class's `protected` or `private` members via casts, `any`, or structural
type tricks. Examples that are prohibited:

```ts
// ❌ Reaching into protected fields through a cast
const firestore = (this.modelRepository as unknown as { firestore: Firestore }).firestore;

// ❌ Accessing private state via `any`
const internal = (someObject as any).internalField;

// ❌ Calling a private/protected method by erasing the type
(someObject as { _doInternalWork: () => void })._doInternalWork();
```

If you need access to internal state of another class, the correct fix is to **expose a proper
API on that class**, not to bypass the modifier at the call site. Reasons:

- A cast hides coupling from the type system; future refactors of the owning class can break callers
  silently.
- The cast loses the intent: future readers can't tell whether it's safe, when it was added, or
  whether the field will keep existing under that name.
- It encourages copies of the same hack at other call sites.

When the owning class lives in a third-party package you can't change, prefer one of:

1. **Subclass it** and add a typed accessor or helper that uses the protected member legitimately,
   then have your code depend on the subclass. (This is exactly why `ModelRepository` exists here.)
2. **Pass the dependency in explicitly** at the boundary that needs it (constructor injection).
3. **Accept the limitation** and pick a different design — sometimes the hack signals that the
   abstraction is wrong.

### Where `firestore` lives

The `Firestore` instance is owned by upstream `BaseRepository` as `protected firestore: Firestore`.
It must stay there. Do not:

- Add a `firestore` field to `EntityRepository` (or any other class that already has access via a
  `ModelRepository`).
- Re-export `firestore` from `ModelRepository`.
- Pass `Firestore` as a separate constructor argument when a `ModelRepository` instance is already
  available.

Instead, expose any new capability via a method on `ModelRepository` (it has direct protected
access). Current public surface:

- `withBatch(work)` — opens a `WriteBatch`, runs `work(batch)`, commits on success. The lifecycle
  is owned by the method; callers never see `firestore`.
- `docRef(ids)` — `DocumentReference` for an existing document path.
- `newDocRef(ids)` — `DocumentReference` with an auto-generated id under the given collection.

If you need more, add another method on `ModelRepository` in the same style: take the high-level
input, do the Firestore work inside, return a typed result. Do not return the raw `WriteBatch`
without an owning lifecycle, and never return the `Firestore` itself.

## Engineering Standards

- **Source of truth:** Trust the code over docs and README. Verify against reality before changing
  load-bearing behavior.
- **TypeScript:** No `any`. Use casting only when the structural types genuinely match. Define
  explicit `interface`/`type` aliases for non-trivial shapes (especially discriminated unions).
  Handle `null` / `undefined` at boundaries.
- **Conditionals:** Always use curly braces.
  `if (condition) { ... } else if (other) { ... } else { ... }`.
- **File endings:** Exactly one trailing newline. No extra blank lines at EOF.
- **Side effects:** Prefer functions that do not mutate their inputs. Return new values; don't
  modify arguments.
- **Array iteration:** Prefer `map`, `filter`, `reduce`, `flatMap` for transformations. Use
  `for`/`for...of`/`forEach` for imperative control flow (early exits, side-effect-only loops,
  hot paths).
- **Method size:** Aim for under 30 lines. Extract private methods when a method grows beyond that.
  Each method should do one thing: fetch, validate, transform, or orchestrate.
- **Class member ordering:** `@typescript-eslint/member-ordering` is enforced. Order: public static
  field → protected static field → private static field → public instance field →
  protected/private instance field → constructor → public instance methods → private instance
  methods → public static methods → private static methods.
- **No abbreviations in identifiers:** Use full words for variables, parameters, and fields.
  `documentReference` not `docRef` only when full clarity matters; established short names like
  `ids`, `id`, `db` from a well-known domain are fine. Single-letter loop counters (`i`) are
  acceptable only in tight, obvious loops.
- **DRY:** Leverage existing helpers (`ModelRepository`, `EntityRepository`, the test fixtures).
  Don't reimplement traversal or batching at the call site.

## Testing

- **TDD-first for behavior changes:** Add or update the spec first, watch it fail for the right
  reason, then implement.
- **One Vitest file per area:** `test/*.integration.test.ts`. Use the existing fixture entities
  (`User`, `Post`) and repositories where possible; introduce new fixtures only when an existing
  one would mislead.
- **Cover both backends:** Tests run against the in-memory backend by default
  (`createMemoryFirestore`). Run `pnpm test:emulator` before publishing to verify parity with real
  Firestore. New repository helpers that touch `WriteBatch`/`DocumentReference` semantics belong in
  the emulator-validated path.
- **No mocking of internal modules:** Don't `vi.mock()` anything inside this package. The whole
  point of the in-memory backend is to avoid mocking; new tests should follow that.
- **Quality bar:** A change is not done until `pnpm lint`, `pnpm build`, and `pnpm test` all pass.
  Run `pnpm lint:fix` after editing to catch formatting drift.

## Behavioral Notes

- When the user corrects the same pattern twice in a session, suggest a permanent rule here so the
  guidance doesn't have to be repeated next session.