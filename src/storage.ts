import type { Sketch } from "./sketch/model";

export interface PartDocument {
  version: 1;
  sketches: Sketch[];
}

const KEY = "3dfrom2d.part.v1";

/** Load the autosaved part, or start an empty one. */
export function loadDocument(): PartDocument {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const doc = JSON.parse(raw) as PartDocument;
      if (doc.version === 1 && Array.isArray(doc.sketches)) return doc;
    }
  } catch {
    // Storage unavailable or corrupt: start fresh.
  }
  return { version: 1, sketches: [] };
}

export function saveDocument(doc: PartDocument): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
  } catch {
    // Ignore: autosave is a convenience until real file saving (step 4).
  }
}
