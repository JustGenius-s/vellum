import { useEffect, useMemo, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  BookOpenTextIcon,
  CheckIcon,
  CopySimpleIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { DOCUMENTS_CAPABILITY, FILES_CAPABILITY } from "@/app/plugins/capabilities";
import { usePluginCapability, usePluginService, usePluginStore } from "@/app/plugins/plugin-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  insertCitationReference,
  searchReferences,
  type ReferenceItem,
} from "@/domain/bibliography";
import { documentFormat } from "@/domain/workspace";
import { REFERENCE_LIBRARY_SERVICE } from "@/features/references/reference-library-service";

function authorSummary(item: ReferenceItem) {
  if (!item.authors.length) return "Unknown author";
  const names = item.authors.map((author) => author.name);
  if (names.length <= 2) return names.join(" · ");
  return `${names[0]} · ${names[1]} +${names.length - 2}`;
}

function ReferenceRow({ item, onSelect }: { item: ReferenceItem; onSelect(): void }) {
  return (
    <button
      type="button"
      className="group w-full border-b border-sidebar-border/70 px-2.5 py-3 text-left transition-colors hover:bg-sidebar-accent/65 focus-visible:bg-sidebar-accent/65 focus-visible:outline-none"
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        <BookOpenTextIcon className="mt-0.5 size-4 shrink-0 text-sidebar-primary" weight="duotone" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-sidebar-foreground">{item.title}</span>
          <span className="mt-1 block truncate text-[10px] text-sidebar-foreground/58">
            {authorSummary(item)}{item.year ? ` · ${item.year}` : ""}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[9px] text-sidebar-foreground/42">
            <span className="truncate font-mono">{item.key}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{item.source.relativePath}</span>
          </span>
        </span>
        {item.duplicateKey ? <WarningCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" /> : null}
      </div>
    </button>
  );
}

function ReferenceDetails({
  item,
  canInsert,
  onInsert,
  onOpenSource,
  insertState,
}: {
  item: ReferenceItem;
  canInsert: boolean;
  onInsert(): void;
  onOpenSource(): void;
  insertState: "idle" | "success" | "error";
}) {
  const fields = Object.entries(item.fields).filter(([name, value]) => value && name.toLowerCase() !== "author");
  return (
    <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
      <SheetHeader className="border-b pr-12">
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="secondary">{item.type}</Badge>
          {item.year ? <span className="text-xs text-muted-foreground">{item.year}</span> : null}
          {item.duplicateKey ? <Badge variant="destructive">Duplicate key</Badge> : null}
        </div>
        <SheetTitle className="text-base leading-6">{item.title}</SheetTitle>
        <SheetDescription className="font-mono text-[10px]">@{item.key}</SheetDescription>
      </SheetHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <section>
            <h3 className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Authors</h3>
            <div className="space-y-1.5 text-xs">
              {item.authors.length ? item.authors.map((author) => <p key={author.name}>{author.name}</p>) : <p className="text-muted-foreground">No author field</p>}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Source</h3>
            <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted" onClick={onOpenSource}>
              <ArrowSquareOutIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono">{item.source.relativePath}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">line {item.line}</span>
            </button>
          </section>

          {item.container || item.doi || item.url ? (
            <section>
              <h3 className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Publication</h3>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {item.container ? <p>{item.container}</p> : null}
                {item.doi ? <p className="break-all font-mono">doi:{item.doi}</p> : null}
                {item.url ? <p className="break-all font-mono">{item.url}</p> : null}
              </div>
            </section>
          ) : null}

          {fields.length ? (
            <section>
              <h3 className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Fields</h3>
              <dl className="divide-y divide-border rounded-md border text-xs">
                {fields.map(([name, value]) => (
                  <div key={name} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 px-2.5 py-2">
                    <dt className="font-mono text-[10px] text-muted-foreground">{name}</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <Button className="w-full" disabled={!canInsert || item.duplicateKey || insertState === "success"} onClick={onInsert}>
          {insertState === "success" ? <CheckIcon data-icon="inline-start" /> : <CopySimpleIcon data-icon="inline-start" />}
          {insertState === "success" ? "Inserted" : item.duplicateKey ? "Resolve duplicate key" : "Insert citation"}
        </Button>
        {!canInsert ? <p className="mt-2 text-center text-[10px] text-muted-foreground">Open a Typst document to insert a citation.</p> : null}
        {insertState === "error" ? <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-destructive"><WarningCircleIcon /> Could not update the document.</p> : null}
      </div>
    </SheetContent>
  );
}

export function ReferencesPanel() {
  const files = usePluginCapability(FILES_CAPABILITY);
  const documents = usePluginCapability(DOCUMENTS_CAPABILITY);
  const service = usePluginService(REFERENCE_LIBRARY_SERVICE);
  const catalog = usePluginStore(service);
  const filesState = usePluginStore(files);
  const documentsState = usePluginStore(documents);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insertState, setInsertState] = useState<"idle" | "success" | "error">("idle");
  const filteredItems = useMemo(() => searchReferences(catalog.items, query), [catalog.items, query]);
  const selectedItem = catalog.items.find((item) => item.id === selectedId) ?? null;
  const activePath = documentsState.activePath;
  const canInsert = Boolean(activePath && documentFormat(activePath) === "typst");

  useEffect(() => {
    if (catalog.status === "idle") void service.refresh();
  }, [catalog.status, service]);

  async function insertCitation(item: ReferenceItem) {
    if (!canInsert || !activePath || item.duplicateKey) return;
    setInsertState("idle");
    try {
      const content = await documents.readText(activePath);
      const tab = documentsState.tabs.find((candidate) => candidate.path === activePath);
      const insertion = insertCitationReference(content, item.key, documents.getCursorOffset(activePath));
      await documents.applyEdit({
        path: activePath,
        changes: [{ from: insertion.from, to: insertion.to, insert: insertion.insert }],
        expectedRevision: tab?.revision ?? 0,
        selectionAfter: insertion.selectionAfter,
        activate: true,
        focus: true,
      });
      setInsertState("success");
    } catch {
      setInsertState("error");
    }
  }

  function openSource(item: ReferenceItem) {
    void files.openFile(item.source.path, item.line);
    setSelectedId(null);
  }

  if (!filesState.vaultPath) {
    return <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground"><BookOpenTextIcon className="size-7" weight="duotone" /><p>Open a vault to browse BibTeX references.</p></div>;
  }

  return (
    <div className="flex min-h-full flex-col group-data-[collapsible=icon]:hidden">
      <div className="sticky top-0 z-10 space-y-2 bg-sidebar pb-2">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sidebar-foreground/45" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search references" className="h-8 border-sidebar-border bg-sidebar-accent/35 pl-8 text-xs" />
        </div>
        <div className="flex items-center justify-between px-1 text-[10px] text-sidebar-foreground/48">
          <span>{filteredItems.length} of {catalog.items.length} references</span>
          <Button variant="ghost" size="icon-xs" aria-label="Refresh references" title="Refresh references" onClick={() => void service.refresh()}><ArrowClockwiseIcon className={catalog.status === "loading" ? "animate-spin" : undefined} /></Button>
        </div>
      </div>

      {catalog.status === "loading" && !catalog.items.length ? (
        <div className="space-y-2 px-1 pt-2">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-16 w-full rounded-md" />)}</div>
      ) : filteredItems.length ? (
        <div className="-mx-2">{filteredItems.map((item) => <ReferenceRow key={item.id} item={item} onSelect={() => { setSelectedId(item.id); setInsertState("idle"); }} />)}</div>
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground"><MagnifyingGlassIcon className="size-6" /><p>{catalog.items.length ? "No references match this search." : "No .bib files in this vault."}</p></div>
      )}

      {catalog.issues.length ? <div className="mt-3 border-t border-sidebar-border/70 px-2 pt-3 text-[10px] text-muted-foreground"><p className="mb-1 flex items-center gap-1 font-medium text-destructive"><InfoIcon /> {catalog.issues.length} parser issue{catalog.issues.length === 1 ? "" : "s"}</p>{catalog.issues.slice(0, 2).map((issue) => <p key={`${issue.path}:${issue.message}`} className="truncate">{issue.message}</p>)}</div> : null}

      <Sheet open={Boolean(selectedItem)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        {selectedItem ? <ReferenceDetails item={selectedItem} canInsert={canInsert} onInsert={() => void insertCitation(selectedItem)} onOpenSource={() => openSource(selectedItem)} insertState={insertState} /> : null}
      </Sheet>
    </div>
  );
}
