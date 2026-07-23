import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  FolderOpenIcon,
  GearSixIcon,
  RobotIcon,
  ShieldCheckIcon,
  TextAaIcon,
  type Icon,
} from "@phosphor-icons/react";

import { shallowEqual, useWorkspaceController, useWorkspaceSelector } from "@/app/workspace-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function SettingsSection({
  icon: IconComponent,
  title,
  description,
  children,
}: {
  icon: Icon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 py-8 md:grid-cols-[minmax(0,0.72fr)_minmax(20rem,1fr)] md:gap-12 lg:gap-20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <IconComponent className="size-4.5" weight="duotone" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function FontSelect({
  id,
  label,
  description,
  value,
  options,
  pending,
  onValueChange,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  options: string[];
  pending: boolean;
  onValueChange(value: string): void;
}) {
  const placeholder = pending ? "Loading fonts" : "No fonts found";

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value || undefined}
        onValueChange={onValueChange}
        disabled={pending || options.length === 0}
      >
        <SelectTrigger id={id} className="h-9 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="max-h-80">
          {options.map((family) => (
            <SelectItem key={family} value={family} style={{ fontFamily: family }}>
              {family}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

function EditorSettings() {
  const controller = useWorkspaceController();
  const state = useWorkspaceSelector(
    (workspace) => ({
      cjkFont: workspace.cjkFont,
      fontCatalog: workspace.fontCatalog,
      fontsPending: workspace.fontsPending,
      latinFont: workspace.latinFont,
      vaultPath: workspace.vaultPath,
    }),
    shallowEqual,
  );

  return (
    <div className="divide-y">
      <SettingsSection
        icon={TextAaIcon}
        title="Document typography"
        description="Choose the fonts Vellum passes to Typst when compiling documents and generated figures."
      >
        <FieldGroup className="grid gap-5 sm:grid-cols-2">
          <FontSelect
            id="latin-font"
            label="Latin font"
            description="Used for English text, numbers, and Latin symbols."
            value={state.latinFont}
            options={state.fontCatalog.latin}
            pending={state.fontsPending}
            onValueChange={(family) => controller.setFontPreference("latin", family)}
          />
          <FontSelect
            id="cjk-font"
            label="CJK font"
            description="Used for Chinese, Japanese, and Korean text."
            value={state.cjkFont}
            options={state.fontCatalog.cjk}
            pending={state.fontsPending}
            onValueChange={(family) => controller.setFontPreference("cjk", family)}
          />
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        icon={FolderOpenIcon}
        title="Workspace"
        description="Inspect the active local vault and refresh its file tree after external changes."
      >
        <FieldGroup>
          <Field>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor="workspace-path">Current vault</FieldLabel>
              <Badge variant="outline" className="font-normal">
                {state.vaultPath ? "Local" : "Not open"}
              </Badge>
            </div>
            <Input
              id="workspace-path"
              value={state.vaultPath || "No local workspace is open"}
              readOnly
              className="h-9 font-mono text-xs text-foreground/75"
              title={state.vaultPath || undefined}
            />
            <FieldDescription>
              Workspace files remain in this folder and can be edited by other local tools.
            </FieldDescription>
          </Field>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 active:translate-y-px"
              onClick={() => void controller.refreshTree()}
              disabled={!state.vaultPath}
            >
              <ArrowClockwiseIcon data-icon="inline-start" />
              Refresh workspace
            </Button>
          </div>
        </FieldGroup>
      </SettingsSection>
    </div>
  );
}

function AiSettings() {
  const controller = useWorkspaceController();
  const state = useWorkspaceSelector(
    (workspace) => ({
      aiApiKey: workspace.aiApiKey,
      aiBaseUrl: workspace.aiBaseUrl,
      aiModel: workspace.aiModel,
    }),
    shallowEqual,
  );
  const configured = Boolean(state.aiBaseUrl.trim() && state.aiModel.trim());

  return (
    <div className="divide-y">
      <SettingsSection
        icon={RobotIcon}
        title="AI provider"
        description="Connect an OpenAI-compatible text generation endpoint for data-aware Typst charts."
      >
        <FieldGroup>
          <div className="flex items-center gap-2">
            <Badge variant={configured ? "secondary" : "outline"} className="font-normal">
              {configured ? (
                <CheckCircleIcon data-icon="inline-start" weight="fill" />
              ) : null}
              {configured ? "Configured" : "Model required"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Changes to the endpoint and model are saved automatically.
            </span>
          </div>

          <Field>
            <FieldLabel htmlFor="ai-base-url">Base URL</FieldLabel>
            <Input
              id="ai-base-url"
              value={state.aiBaseUrl}
              onChange={(event) => controller.setAiBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1"
              className="h-9 font-mono text-xs"
              spellCheck={false}
              autoCapitalize="none"
            />
            <FieldDescription>
              Include the API version path expected by your provider.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="ai-model">Model</FieldLabel>
            <Input
              id="ai-model"
              value={state.aiModel}
              onChange={(event) => controller.setAiModel(event.target.value)}
              placeholder="Your model ID"
              className="h-9 font-mono text-xs"
              spellCheck={false}
              autoCapitalize="none"
            />
            <FieldDescription>
              Use the exact model identifier exposed by the endpoint.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="ai-api-key">API key</FieldLabel>
            <Input
              id="ai-api-key"
              type="password"
              value={state.aiApiKey}
              onChange={(event) => controller.setAiApiKey(event.target.value)}
              placeholder="Optional for local endpoints"
              className="h-9 font-mono text-xs"
              autoComplete="new-password"
              spellCheck={false}
            />
            <FieldDescription>
              Saved with Vellum's local application settings. Leave it empty when the endpoint does
              not require authentication.
            </FieldDescription>
          </Field>

          <Alert className="bg-muted/40">
            <ShieldCheckIcon />
            <AlertTitle>Saved on this device</AlertTitle>
            <AlertDescription>
              The key is stored in Vellum's local session data so it is restored after restart. It
              is never written to the workspace or generated figure files.
            </AlertDescription>
          </Alert>
        </FieldGroup>
      </SettingsSection>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
        <SidebarTrigger className="md:hidden" />
        <GearSixIcon className="size-4 text-muted-foreground" weight="duotone" />
        <span className="text-sm font-medium">Settings</span>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
          <div className="max-w-2xl">
            <p className="font-mono text-xs text-muted-foreground">VELLUM / SETTINGS</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Workspace preferences
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Configure document rendering, the active local workspace, and the AI provider used to
              create Typst charts from data.
            </p>
          </div>

          <Tabs defaultValue="editor" className="mt-9 gap-0">
            <TabsList variant="line" className="w-full justify-start gap-5 border-b pb-3">
              <TabsTrigger value="editor" className="flex-none px-0">
                <TextAaIcon data-icon="inline-start" />
                Editor &amp; workspace
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex-none px-0">
                <RobotIcon data-icon="inline-start" />
                AI
              </TabsTrigger>
            </TabsList>
            <TabsContent value="editor">
              <EditorSettings />
            </TabsContent>
            <TabsContent value="ai">
              <AiSettings />
            </TabsContent>
          </Tabs>
        </main>
      </ScrollArea>
    </div>
  );
}
