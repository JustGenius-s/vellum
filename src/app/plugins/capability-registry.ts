import type { CapabilityToken, WorkspaceCapabilityHost } from "@/app/plugins/plugin-api";

export class WorkspaceCapabilityRegistry implements WorkspaceCapabilityHost {
  private readonly capabilities = new Map<string, unknown>();

  provide<T>(token: CapabilityToken<T>, capability: T) {
    if (this.capabilities.has(token.id)) {
      throw new Error(`Capability ${token.id} is already provided`);
    }
    this.capabilities.set(token.id, capability);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (this.capabilities.get(token.id) === capability) this.capabilities.delete(token.id);
    };
  }

  has(token: CapabilityToken<unknown>) {
    return this.capabilities.has(token.id);
  }

  get<T>(token: CapabilityToken<T>): T {
    if (!this.capabilities.has(token.id)) {
      throw new Error(`Capability ${token.id} is unavailable`);
    }
    return this.capabilities.get(token.id) as T;
  }
}
