import { useSyncExternalStore } from "react";

import type { CompileProgress } from "@/domain/workspace";
import type { CompilePhase } from "@/application/workspace-state";

export interface CompileProgressState {
  phase: CompilePhase;
  progress: CompileProgress | null;
}

export class CompileProgressStore {
  private state: CompileProgressState = { phase: "idle", progress: null };
  private readonly listeners = new Set<() => void>();
  private frame: number | null = null;
  private pending: CompileProgressState | null = null;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.state;

  publish(state: CompileProgressState, immediate = false) {
    if (immediate || typeof requestAnimationFrame === "undefined") {
      this.cancelFrame();
      this.commit(state);
      return;
    }
    this.pending = state;
    if (this.frame != null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const pending = this.pending;
      this.pending = null;
      if (pending) this.commit(pending);
    });
  }

  reset() {
    this.publish({ phase: "idle", progress: null }, true);
  }

  private cancelFrame() {
    if (this.frame != null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.frame);
    }
    this.frame = null;
    this.pending = null;
  }

  private commit(state: CompileProgressState) {
    if (this.state.phase === state.phase && this.state.progress === state.progress) return;
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}

export function useCompileProgress(store: CompileProgressStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
