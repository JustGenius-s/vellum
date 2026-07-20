import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/App";
import { WorkspaceProvider } from "@/app/workspace-context";
import { WorkspaceController } from "@/application/workspace-controller";
import { createWorkspaceGateway } from "@/infrastructure/runtime";
import "@/index.css";

document.documentElement.classList.add("dark");

const controller = new WorkspaceController(createWorkspaceGateway());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkspaceProvider controller={controller}>
      <App />
    </WorkspaceProvider>
  </StrictMode>,
);
