import { useSyncExternalStore } from "react";

import type { CompileProgressStore } from "@/application/compile-progress-store";

export function useCompileProgress(store: CompileProgressStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
