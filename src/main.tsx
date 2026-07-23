import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/App";
import { WorkspacePluginProvider } from "@/app/plugins/plugin-context";
import { createWorkspacePluginRuntime } from "@/app/plugins/runtime";
import { WorkspaceProvider } from "@/app/workspace-context";
import { WorkspaceController } from "@/application/workspace-controller";
import { createWorkspaceGateway } from "@/infrastructure/runtime";
import "@/index.css";

const controller = new WorkspaceController(createWorkspaceGateway());
const pluginRuntime = createWorkspacePluginRuntime(controller);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkspacePluginProvider registry={pluginRuntime.registry}>
      <WorkspaceProvider controller={controller}>
        <App />
      </WorkspaceProvider>
    </WorkspacePluginProvider>
  </StrictMode>,
);
