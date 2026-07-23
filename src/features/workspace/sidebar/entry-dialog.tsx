import { useEffect, useState, type FormEvent } from "react";
import { useWorkspaceController } from "@/app/workspace-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fileStem } from "@/domain/workspace";
import type { EntryDialogState } from "@/features/workspace/sidebar/workspace-sidebar-types";

export function EntryDialog({ state, onClose }: { state: EntryDialogState; onClose(): void }) {
  const controller = useWorkspaceController();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (state?.kind === "rename") setName(fileStem(state.name));
    else setName("");
    setError("");
  }, [state]);

  const title =
    state?.kind === "rename"
      ? "Rename entry"
      : state?.kind === "folder"
        ? "New folder"
        : "New file";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!state || !name.trim()) return;
    setPending(true);
    setError("");
    try {
      if (state.kind === "rename") await controller.renameEntry(state.path, name.trim());
      else await controller.createEntry(state.parent, name.trim(), state.kind === "folder");
      onClose();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {state?.kind === "folder"
                ? "Folders organize the local vault without changing file formats."
                : "Create .typ, .md, .bib, .csv, .tsv, .json, or .jsonl files. Binary datasets can be added through the filesystem."}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-xs font-medium">
            Name
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="research-note"
            />
            {error ? <span className="text-xs font-normal text-destructive">{error}</span> : null}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Working" : state?.kind === "rename" ? "Rename" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
