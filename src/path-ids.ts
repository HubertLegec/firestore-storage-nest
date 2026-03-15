import type { CollectionPath } from "firestore-storage-core";

type Path = CollectionPath<string, string, void | object>;

/**
 * Build DocumentIds object from path and ordered id values (root to leaf).
 * Depends on firestore-storage-core CollectionPath shape (idKey, parent); see getOrderedIdKeys.
 */
export function pathToDocumentIds(path: Path, ids: string[]): Record<string, string> {
  const keys = getOrderedIdKeys(path);
  return Object.fromEntries(keys.map((k, i) => [k, ids[i] ?? ""]));
}

/**
 * Build CollectionIds object from path and parent id values (no document id).
 */
export function pathToCollectionIds(path: Path, ids: string[]): Record<string, string> {
  const p = path as unknown as { parent?: Path };
  return pathToDocumentIds(p.parent as Path, ids);
}

function getOrderedIdKeys(path: Path | undefined): string[] {
  if (!path) return [];
  const p = path as unknown as { idKey: string; parent?: Path };
  return [...getOrderedIdKeys(p.parent), p.idKey];
}
