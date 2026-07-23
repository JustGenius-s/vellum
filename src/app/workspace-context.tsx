import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { WorkspaceController } from "@/application/workspace-controller";
import type { WorkspaceState } from "@/application/workspace-state";

const WorkspaceContext = createContext<WorkspaceController | null>(null);

export function WorkspaceProvider({
  controller,
  children,
}: {
  controller: WorkspaceController;
  children: ReactNode;
}) {
  useEffect(() => {
    void controller.initialize();
  }, [controller]);

  return <WorkspaceContext.Provider value={controller}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceController() {
  const controller = useContext(WorkspaceContext);
  if (!controller) throw new Error("WorkspaceProvider is missing");
  return controller;
}

export function useWorkspace() {
  const controller = useWorkspaceController();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, state };
}

export function shallowEqual<T extends Record<string, unknown>>(left: T, right: T) {
  if (Object.is(left, right)) return true;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.is(left[key], right[key]));
}

export function useWorkspaceSelector<T>(
  selector: (state: WorkspaceState) => T,
  isEqual: (left: T, right: T) => boolean = Object.is,
) {
  const controller = useWorkspaceController();
  const selectorRef = useRef(selector);
  const equalityRef = useRef(isEqual);
  const cacheRef = useRef<{ state: WorkspaceState; value: T } | null>(null);

  if (selectorRef.current !== selector || equalityRef.current !== isEqual) {
    selectorRef.current = selector;
    equalityRef.current = isEqual;
    cacheRef.current = null;
  }

  const getSelection = useCallback(() => {
    const state = controller.getSnapshot();
    const cached = cacheRef.current;
    if (cached?.state === state) return cached.value;
    const selected = selectorRef.current(state);
    if (cached && equalityRef.current(cached.value, selected)) {
      cacheRef.current = { state, value: cached.value };
      return cached.value;
    }
    cacheRef.current = { state, value: selected };
    return selected;
  }, [controller]);

  return useSyncExternalStore(controller.subscribe, getSelection, getSelection);
}
