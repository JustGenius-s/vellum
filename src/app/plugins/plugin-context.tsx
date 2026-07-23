import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { PluginStore } from "@/app/plugins/capabilities";
import type {
  CapabilityToken,
  PluginServiceToken,
  WorkspacePluginScope,
} from "@/app/plugins/plugin-api";
import type { WorkspacePluginRegistry } from "@/app/plugins/plugin-registry";

const WorkspacePluginContext = createContext<WorkspacePluginRegistry | null>(null);
const WorkspacePluginScopeContext = createContext<WorkspacePluginScope | null>(null);

export function WorkspacePluginProvider({
  registry,
  children,
}: {
  registry: WorkspacePluginRegistry;
  children: ReactNode;
}) {
  return (
    <WorkspacePluginContext.Provider value={registry}>
      {children}
    </WorkspacePluginContext.Provider>
  );
}

export function useWorkspacePluginRegistry() {
  const registry = useContext(WorkspacePluginContext);
  if (!registry) throw new Error("WorkspacePluginProvider is missing");
  return registry;
}

export function useWorkspacePlugins() {
  const registry = useWorkspacePluginRegistry();
  return useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
}

export function WorkspacePluginScopeProvider({
  pluginId,
  children,
}: {
  pluginId: string;
  children: ReactNode;
}) {
  const registry = useWorkspacePluginRegistry();
  return (
    <WorkspacePluginScopeContext.Provider value={registry.scope(pluginId)}>
      {children}
    </WorkspacePluginScopeContext.Provider>
  );
}

export function useWorkspacePluginScope() {
  const scope = useContext(WorkspacePluginScopeContext);
  if (!scope) throw new Error("WorkspacePluginScopeProvider is missing");
  return scope;
}

export function usePluginCapability<T>(token: CapabilityToken<T>) {
  return useWorkspacePluginScope().get(token);
}

export function usePluginService<T>(token: PluginServiceToken<T>) {
  return useWorkspacePluginScope().getService(token);
}

export function usePluginStore<T, Selected = T>(
  store: PluginStore<T>,
  selector: (snapshot: T) => Selected = (snapshot) => snapshot as unknown as Selected,
  isEqual: (left: Selected, right: Selected) => boolean = Object.is,
) {
  const selectorRef = useRef(selector);
  const equalityRef = useRef(isEqual);
  const cacheRef = useRef<{ snapshot: T; selected: Selected } | null>(null);

  if (selectorRef.current !== selector || equalityRef.current !== isEqual) {
    selectorRef.current = selector;
    equalityRef.current = isEqual;
    cacheRef.current = null;
  }

  const getSelection = useCallback(() => {
    const snapshot = store.getSnapshot();
    const cached = cacheRef.current;
    if (cached?.snapshot === snapshot) return cached.selected;
    const selected = selectorRef.current(snapshot);
    if (cached && equalityRef.current(cached.selected, selected)) {
      cacheRef.current = { snapshot, selected: cached.selected };
      return cached.selected;
    }
    cacheRef.current = { snapshot, selected };
    return selected;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
