import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretUpIcon,
  MagnifyingGlassIcon,
  SelectionAllIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  selectMatches,
  setSearchQuery,
} from "@codemirror/search";
import {
  runScopeHandlers,
  type EditorView,
  type Panel,
  type ViewUpdate,
} from "@codemirror/view";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

const mainFieldAttribute = { "main-field": "true" } as const;
const matchCountLimit = 9_999;

interface MatchStatus {
  current: number;
  total: number;
  limited: boolean;
}

function getMatchStatus(view: EditorView, query: SearchQuery): MatchStatus {
  if (!query.valid) return { current: 0, total: 0, limited: false };

  const selection = view.state.selection.main;
  const cursor = query.getCursor(view.state);
  let current = 0;
  let total = 0;

  for (;;) {
    const result = cursor.next();
    if (result.done) break;
    total += 1;

    if (result.value.from === selection.from && result.value.to === selection.to) {
      current = total;
    }

    if (total > matchCountLimit) {
      return {
        current: current > matchCountLimit ? 0 : current,
        total: matchCountLimit,
        limited: true,
      };
    }
  }

  return { current, total, limited: false };
}

function updateSearchQuery(
  view: EditorView,
  update: Partial<
    Pick<SearchQuery, "search" | "replace" | "caseSensitive" | "regexp" | "wholeWord">
  >,
) {
  const current = getSearchQuery(view.state);
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({
        search: update.search ?? current.search,
        replace: update.replace ?? current.replace,
        caseSensitive: update.caseSensitive ?? current.caseSensitive,
        literal: current.literal,
        regexp: update.regexp ?? current.regexp,
        wholeWord: update.wholeWord ?? current.wholeWord,
      }),
    ),
  });
}

function MatchCount({ query, status }: { query: SearchQuery; status: MatchStatus }) {
  let label = "Type to search";
  if (query.search && !query.valid) {
    label = "Invalid pattern";
  } else if (query.valid && status.total === 0) {
    label = "No results";
  } else if (status.current) {
    label = `${status.current} / ${status.total}${status.limited ? "+" : ""}`;
  } else if (status.total) {
    label = `${status.total}${status.limited ? "+" : ""} results`;
  }

  return (
    <InputGroupText
      className="min-w-16 justify-end font-mono text-[10px] tabular-nums whitespace-nowrap"
      aria-live="polite"
    >
      {label}
    </InputGroupText>
  );
}

function SearchOption({
  active,
  label,
  children,
  onToggle,
}: {
  active: boolean;
  label: string;
  children: string;
  onToggle(): void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      className="size-7 rounded-md font-mono text-[10px] tracking-tighter"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onToggle}
    >
      <span aria-hidden="true">{children}</span>
    </Button>
  );
}

function SearchPanelContent({
  view,
  query,
  status,
}: {
  view: EditorView;
  query: SearchQuery;
  status: MatchStatus;
}) {
  const [replaceOpen, setReplaceOpen] = useState(() => Boolean(query.replace));
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const canNavigate = query.valid && status.total > 0;
  const invalidPattern = Boolean(query.search) && !query.valid;

  const toggleReplace = () => {
    setReplaceOpen((open) => {
      const next = !open;
      if (next) {
        requestAnimationFrame(() => replaceInputRef.current?.focus());
      }
      return next;
    });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (runScopeHandlers(view, event.nativeEvent, "search-panel")) {
      event.preventDefault();
      return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();

    const target = event.target as HTMLInputElement;
    if (target.name === "replace") {
      replaceNext(view);
    } else if (event.shiftKey) {
      findPrevious(view);
    } else {
      findNext(view);
    }
  };

  return (
    <form
      className="flex w-full flex-col gap-2 p-2"
      aria-label="Find and replace"
      onSubmit={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <InputGroup className="h-9 min-w-64 flex-[1_1_24rem] rounded-lg bg-background shadow-none">
          <InputGroupInput
            {...mainFieldAttribute}
            name="search"
            value={query.search}
            placeholder="Find in document"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalidPattern}
            className="h-9 text-sm"
            onChange={(event) => updateSearchQuery(view, { search: event.target.value })}
          />
          <InputGroupAddon align="inline-start" className="text-muted-foreground/70">
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end" className="gap-0.5 pr-1">
            <MatchCount query={query} status={status} />
            <InputGroupButton
              size="icon-xs"
              aria-label="Previous match"
              title="Previous match (Shift+Enter)"
              disabled={!canNavigate}
              onClick={() => findPrevious(view)}
            >
              <ArrowUpIcon />
            </InputGroupButton>
            <InputGroupButton
              size="icon-xs"
              aria-label="Next match"
              title="Next match (Enter)"
              disabled={!canNavigate}
              onClick={() => findNext(view)}
            >
              <ArrowDownIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
          <SearchOption
            active={query.caseSensitive}
            label="Match case"
            onToggle={() => updateSearchQuery(view, { caseSensitive: !query.caseSensitive })}
          >
            Aa
          </SearchOption>
          <SearchOption
            active={query.regexp}
            label="Use regular expression"
            onToggle={() => updateSearchQuery(view, { regexp: !query.regexp })}
          >
            .*
          </SearchOption>
          <SearchOption
            active={query.wholeWord}
            label="Match whole word"
            onToggle={() => updateSearchQuery(view, { wholeWord: !query.wholeWord })}
          >
            ab
          </SearchOption>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8"
          aria-label="Select all matches"
          title="Select all matches"
          disabled={!canNavigate}
          onClick={() => selectMatches(view)}
        >
          <SelectionAllIcon />
        </Button>
        <Button
          type="button"
          variant={replaceOpen ? "secondary" : "ghost"}
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
          aria-expanded={replaceOpen}
          onClick={toggleReplace}
        >
          {replaceOpen ? <CaretUpIcon /> : <CaretDownIcon />}
          Replace
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto size-8 text-muted-foreground"
          aria-label="Close search"
          title="Close search (Esc)"
          onClick={() => closeSearchPanel(view)}
        >
          <XIcon />
        </Button>
      </div>

      {replaceOpen ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <InputGroup className="h-9 min-w-64 flex-[1_1_24rem] rounded-lg bg-background shadow-none">
            <InputGroupInput
              ref={replaceInputRef}
              name="replace"
              value={query.replace}
              placeholder="Replace with"
              autoComplete="off"
              spellCheck={false}
              className="h-9 text-sm"
              onChange={(event) => updateSearchQuery(view, { replace: event.target.value })}
            />
            <InputGroupAddon
              align="inline-start"
              className="text-[10px] font-medium uppercase tracking-wide"
            >
              Replace
            </InputGroupAddon>
          </InputGroup>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!canNavigate}
            onClick={() => replaceNext(view)}
          >
            Replace
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 text-xs"
            disabled={!canNavigate}
            onClick={() => replaceAll(view)}
          >
            Replace all
          </Button>
          <div className="hidden w-8 sm:block" aria-hidden="true" />
        </div>
      ) : null}
    </form>
  );
}

class EditorSearchPanel implements Panel {
  readonly dom = document.createElement("div");
  readonly top = true;
  private readonly root: Root;
  private readonly view: EditorView;
  private focusFrame = 0;

  constructor(view: EditorView) {
    this.view = view;
    this.dom.className = "cm-search";
    this.root = createRoot(this.dom);
    this.render();
  }

  mount() {
    this.focusFrame = requestAnimationFrame(() => {
      const searchInput = this.dom.querySelector<HTMLInputElement>("[main-field]");
      searchInput?.focus();
      searchInput?.select();
    });
  }

  update(update: ViewUpdate) {
    const queryChanged = update.transactions.some((transaction) =>
      transaction.effects.some((effect) => effect.is(setSearchQuery)),
    );

    if (update.docChanged || update.selectionSet || queryChanged) {
      this.render();
    }
  }

  destroy() {
    cancelAnimationFrame(this.focusFrame);
    this.root.unmount();
  }

  private render() {
    const query = getSearchQuery(this.view.state);
    this.root.render(
      <SearchPanelContent
        view={this.view}
        query={query}
        status={getMatchStatus(this.view, query)}
      />,
    );
  }
}

export function createEditorSearchPanel(view: EditorView): Panel {
  return new EditorSearchPanel(view);
}
