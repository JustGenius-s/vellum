import { useMemo, useState } from "react";
import {
  ArrowClockwiseIcon,
  ChartLineIcon,
  CheckIcon,
  DatabaseIcon,
  FunctionIcon,
  GridFourIcon,
  RowsIcon,
  SlidersHorizontalIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { useWorkspace } from "@/app/workspace-context";
import { Badge } from "@/components/ui/badge";
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DataChartType, SeriesStatistics, TensorPoint } from "@/domain/data";
import { fileName, fileStem } from "@/domain/workspace";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[index]}`;
}

function formatNumber(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(3);
  }
  return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(value);
}

function paginationItems(currentPage: number, totalPages: number | null) {
  if (totalPages == null) return [currentPage];
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 3) return [1, 2, 3, "ellipsis-right", totalPages];
  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis-left", totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "ellipsis-left", currentPage, "ellipsis-right", totalPages];
}

function DataLoading() {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="space-y-3 border-b p-4 md:border-r md:border-b-0">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-4/5" />
      </div>
      <div className="space-y-4 p-5 md:p-7">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-36 w-full" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatisticsView({ statistics }: { statistics: SeriesStatistics[] }) {
  if (!statistics.length) {
    return (
      <div className="flex min-h-56 items-center justify-center px-5 text-sm text-muted-foreground">
        No numeric series were found in this projection.
      </div>
    );
  }

  return (
    <div className="divide-y">
      {statistics.map((series) => (
        <section key={series.name} className="py-5 first:pt-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-sm font-medium">{series.name}</h3>
            {series.sampled ? <Badge variant="outline">Sampled</Badge> : null}
            <span className="text-xs text-muted-foreground">
              {series.validCount.toLocaleString()} valid · {series.missingCount.toLocaleString()} missing
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            {[
              ["Minimum", series.min],
              ["Maximum", series.max],
              ["Mean", series.mean],
              ["Median", series.median],
              ["Std. deviation", series.standardDeviation],
              ["First quartile", series.q1],
              ["Third quartile", series.q3],
              ["Count", series.count],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-background px-3 py-3.5">
                <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  {label}
                </dt>
                <dd className="mt-1.5 font-mono text-sm font-medium tabular-nums">
                  {formatNumber(value as number | null)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function TablePreview() {
  const { controller, state } = useWorkspace();
  const preview = state.dataPreview;
  if (!preview) return null;
  const canPrevious = preview.rowOffset > 0;
  const canNext =
    preview.totalRows != null && preview.rowOffset + preview.rows.length < preview.totalRows;
  const currentPage = Math.floor(preview.rowOffset / state.dataQuery.limit) + 1;
  const totalPages =
    preview.totalRows == null
      ? null
      : Math.max(1, Math.ceil(preview.totalRows / state.dataQuery.limit));
  const pages = paginationItems(currentPage, totalPages);
  const rowLabel =
    preview.totalRows === 0
      ? "0 rows"
      : preview.rows.length === 0
        ? `No rows at offset ${preview.rowOffset.toLocaleString()}`
        : preview.totalRows == null
          ? `${preview.rows.length} rows`
          : `${(preview.rowOffset + 1).toLocaleString()}–${(
              preview.rowOffset + preview.rows.length
            ).toLocaleString()} of ${preview.totalRows.toLocaleString()}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
      <div className="min-h-0 flex-1 overflow-hidden [&_[data-slot=table-container]]:h-full [&_[data-slot=table-container]]:overflow-auto">
        <Table className="w-max min-w-full border-collapse text-xs">
          <TableHeader className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-auto w-12 border-r px-2 py-2 text-right font-mono font-normal text-muted-foreground">
                #
              </TableHead>
              {preview.columns.map((column) => (
                <TableHead
                  key={column.name}
                  className="h-auto min-w-32 border-r px-3 py-2 text-left font-medium last:border-r-0"
                >
                  <span className="block truncate">{column.name}</span>
                  <span className="mt-0.5 block font-mono text-[9px] font-normal text-muted-foreground">
                    {column.dataType}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.length ? (
              preview.rows.map((row, rowIndex) => (
                <TableRow
                  key={preview.rowOffset + rowIndex}
                  className="odd:bg-muted/20 hover:bg-muted/45"
                >
                  <TableCell className="border-r px-2 py-2 text-right font-mono text-[10px] text-muted-foreground">
                    {preview.rowOffset + rowIndex + 1}
                  </TableCell>
                  {preview.columns.map((column, columnIndex) => {
                    const value = row[columnIndex];
                    return (
                      <TableCell
                        key={column.name}
                        className={`max-w-80 border-r px-3 py-2 last:border-r-0 ${column.numeric ? "text-right font-mono tabular-nums" : "text-left"}`}
                        title={value == null ? "" : String(value)}
                      >
                        <span className="block truncate text-foreground/85">
                          {value == null ? <span className="text-muted-foreground/45">null</span> : String(value)}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={preview.columns.length + 1}
                  className="h-36 px-4 text-center text-sm text-muted-foreground"
                >
                  No rows in this projection.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t bg-muted/20 px-3 py-2">
        <span className="font-mono text-[10px] text-muted-foreground">{rowLabel}</span>
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#data-previous-page"
                aria-disabled={!canPrevious || state.dataPending}
                tabIndex={!canPrevious || state.dataPending ? -1 : undefined}
                className={
                  !canPrevious || state.dataPending
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
                onClick={(event) => {
                  event.preventDefault();
                  if (!canPrevious || state.dataPending) return;
                  void controller.setDataPage(
                    Math.max(0, preview.rowOffset - state.dataQuery.limit),
                  );
                }}
              />
            </PaginationItem>
            {pages.map((page) =>
              typeof page === "number" ? (
                <PaginationItem key={page}>
                  <PaginationLink
                    href={`#data-page-${page}`}
                    isActive={page === currentPage}
                    aria-label={
                      page === currentPage ? `Current page, page ${page}` : `Go to page ${page}`
                    }
                    aria-disabled={state.dataPending}
                    tabIndex={state.dataPending ? -1 : undefined}
                    className={state.dataPending ? "pointer-events-none opacity-50" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      if (page === currentPage || state.dataPending) return;
                      void controller.setDataPage((page - 1) * state.dataQuery.limit);
                    }}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ) : (
                <PaginationItem key={page}>
                  <PaginationEllipsis />
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href="#data-next-page"
                aria-disabled={!canNext || state.dataPending}
                tabIndex={!canNext || state.dataPending ? -1 : undefined}
                className={
                  !canNext || state.dataPending ? "pointer-events-none opacity-50" : undefined
                }
                onClick={(event) => {
                  event.preventDefault();
                  if (!canNext || state.dataPending) return;
                  void controller.setDataPage(preview.rowOffset + state.dataQuery.limit);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </footer>
    </div>
  );
}

function normalizeTensorPoints(points: TensorPoint[]) {
  const values = points.flatMap((point) => (point.value == null ? [] : [point.value]));
  if (!values.length) return { min: 0, max: 0, span: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return { min, max, span };
}

function TensorPlot() {
  const preview = useWorkspace().state.dataPreview?.tensor;
  if (!preview || !preview.points.length) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border text-sm text-muted-foreground">
        This slice contains no numeric values.
      </div>
    );
  }
  const { min, span } = normalizeTensorPoints(preview.points);
  if (preview.varyingDimensions.length <= 1) {
    const points = preview.points
      .flatMap((point, index) =>
        point.value == null
          ? []
          : [
              `${24 + (index / Math.max(1, preview.points.length - 1)) * 752},${
                224 - ((point.value - min) / span) * 190
              }`,
            ],
      )
      .join(" ");
    return (
      <div className="rounded-lg border bg-muted/10 p-3">
        <svg viewBox="0 0 800 250" className="h-auto w-full" role="img" aria-label="One-dimensional tensor slice">
          <line x1="24" y1="224" x2="776" y2="224" stroke="var(--border)" />
          <line x1="24" y1="24" x2="24" y2="224" stroke="var(--border)" />
          <polyline points={points} fill="none" stroke="var(--foreground)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    );
  }

  const xValues = [...new Set(preview.points.map((point) => point.coordinates.at(-1) ?? 0))];
  const yValues = [...new Set(preview.points.map((point) => point.coordinates[0] ?? 0))];
  const width = 760 / Math.max(1, xValues.length);
  const height = 210 / Math.max(1, yValues.length);
  return (
    <div className="rounded-lg border bg-muted/10 p-3">
      <svg viewBox="0 0 800 250" className="h-auto w-full" role="img" aria-label="Two-dimensional tensor slice">
        {preview.points.map((point, index) => {
          if (point.value == null) return null;
          const x = xValues.indexOf(point.coordinates.at(-1) ?? 0);
          const y = yValues.indexOf(point.coordinates[0] ?? 0);
          return (
            <rect
              key={`${point.coordinates.join("-")}-${index}`}
              x={24 + x * width}
              y={20 + y * height}
              width={Math.max(1, width)}
              height={Math.max(1, height)}
              fill="var(--foreground)"
              opacity={0.08 + ((point.value - min) / span) * 0.82}
            />
          );
        })}
      </svg>
    </div>
  );
}

function DimensionControls() {
  const { controller, state } = useWorkspace();
  const dataset = controller.selectedDataset;
  if (!dataset || dataset.kind !== "tensor") return null;

  return (
    <div className="divide-y rounded-lg border">
      {dataset.dimensions.map((dimension, index) => {
        const varying = state.dataQuery.varyingDimensions.includes(index);
        const fixed = state.dataQuery.fixedDimensions.find((item) => item.dimension === index);
        return (
          <div key={`${dimension.name}-${index}`} className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-xs font-medium">{dimension.name}</span>
                <Badge variant="outline">{dimension.size.toLocaleString()}</Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {varying ? "Varies across the generated slice" : "Fixed at one index"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!varying ? (
                <Input
                  key={`${index}-${fixed?.index ?? 0}`}
                  type="number"
                  min={0}
                  max={Math.max(0, dimension.size - 1)}
                  defaultValue={fixed?.index ?? 0}
                  className="w-24 font-mono"
                  aria-label={`${dimension.name} fixed index`}
                  onBlur={(event) =>
                    void controller.setDataFixedDimension(index, Number(event.currentTarget.value))
                  }
                />
              ) : null}
              <Button
                variant={varying ? "secondary" : "outline"}
                size="sm"
                disabled={
                  state.dataPending ||
                  (!varying && state.dataQuery.varyingDimensions.length >= 2) ||
                  (varying && state.dataQuery.varyingDimensions.length === 1)
                }
                onClick={() => void controller.setDataVaryingDimension(index, !varying)}
              >
                {varying ? <CheckIcon /> : null}
                {varying ? "Varying" : "Use axis"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChartDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { controller, state } = useWorkspace();
  const preview = state.dataPreview;
  const [chartType, setChartType] = useState<DataChartType>("line");
  const numeric = preview?.columns.filter((column) => column.numeric) ?? [];
  const [xColumn, setXColumn] = useState("");
  const [yColumn, setYColumn] = useState("");
  const [title, setTitle] = useState("");
  const tensor = preview?.kind === "tensor";
  const effectiveX =
    numeric.some((column) => column.name === xColumn) ? xColumn : numeric[0]?.name || "";
  const effectiveY =
    numeric.some((column) => column.name === yColumn)
      ? yColumn
      : numeric.find((column) => column.name !== effectiveX)?.name || "";

  async function generate() {
    const result = await controller.generateDataChart(
      chartType,
      tensor ? null : effectiveX || null,
      tensor ? null : effectiveY || null,
      title.trim() || null,
    );
    if (result) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Typst chart</DialogTitle>
          <DialogDescription>
            Vellum writes a portable JSON projection, a TOML recipe, and editable Typst source next to the data file.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-xs font-medium">
            Chart type
            <Select value={chartType} onValueChange={(value) => setChartType(value as DataChartType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="scatter">Scatter</SelectItem>
                <SelectItem value="bar">Bar</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-2 text-xs font-medium sm:col-span-2">
            Caption
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={fileStem(state.activePath)} />
          </label>
          {!tensor ? (
            <>
              <label className="grid gap-2 text-xs font-medium">
                X column
                <Select value={effectiveX} onValueChange={setXColumn}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a column" />
                  </SelectTrigger>
                  <SelectContent>
                    {numeric.map((column) => (
                      <SelectItem key={column.name} value={column.name}>
                        {column.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2 text-xs font-medium">
                Y column
                <Select value={effectiveY} onValueChange={setYColumn}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a column" />
                  </SelectTrigger>
                  <SelectContent>
                    {numeric.map((column) => (
                      <SelectItem key={column.name} value={column.name}>
                        {column.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
              The current dimension recipe will be exported as a numeric projection. Fixed dimensions and sampling remain recorded in the TOML recipe.
            </p>
          )}
        </div>
        {state.dataError ? <p className="text-xs text-destructive">{state.dataError}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={state.dataChartPending || (!tensor && (!effectiveX || !effectiveY))}
            onClick={() => void generate()}
          >
            <ChartLineIcon />
            {state.dataChartPending ? "Generating" : "Generate chart"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DataInspector() {
  const { controller, state } = useWorkspace();
  const [chartOpen, setChartOpen] = useState(false);
  const catalog = state.dataCatalog;
  const dataset = controller.selectedDataset;
  const activeName = fileName(state.activePath);
  const shapeLabel = dataset?.shape.length ? dataset.shape.join(" × ") : "scalar";
  const datasetSummary = useMemo(() => {
    if (!dataset) return "";
    return dataset.kind === "table"
      ? `${dataset.rowCount?.toLocaleString() ?? "Unknown"} rows · ${dataset.columns.length} columns`
      : `${dataset.shape.length} dimensions · ${shapeLabel}`;
  }, [dataset, shapeLabel]);

  if (state.dataPending && !catalog) return <DataLoading />;

  if (state.dataError && !catalog) {
    return (
      <div className="flex h-full items-center justify-center px-5 py-10">
        <div className="max-w-lg">
          <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <WarningCircleIcon className="size-5" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Could not inspect this data file</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.dataError}</p>
          <Button className="mt-5" variant="outline" onClick={() => void controller.compileActive()}>
            <ArrowClockwiseIcon /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!catalog || !dataset) return <DataLoading />;

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label="Data inspector">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <DatabaseIcon className="size-4.5" weight="duotone" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">{activeName}</h1>
            <Badge variant="outline" className="font-mono uppercase">
              {catalog.format}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {catalog.adapter} · {formatBytes(catalog.sizeBytes)}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={state.dataPending} onClick={() => void controller.refreshDataPreview()}>
          <ArrowClockwiseIcon /> Refresh
        </Button>
        <Button size="sm" disabled={state.dataPending || !state.dataPreview} onClick={() => setChartOpen(true)}>
          <ChartLineIcon /> Generate chart
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-h-0 border-b bg-muted/15 md:border-r md:border-b-0">
          <div className="border-b px-4 py-3">
            <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Datasets
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {catalog.datasets.length} readable {catalog.datasets.length === 1 ? "dataset" : "datasets"}
            </p>
          </div>
          <ScrollArea className="h-[10rem] md:h-[calc(100%-4.1rem)]">
            <div className="space-y-1 p-2">
              {catalog.datasets.map((item) => {
                const active = item.id === dataset.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors active:translate-y-px ${
                      active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                    }`}
                    onClick={() => void controller.selectDataset(item.id)}
                  >
                    {item.kind === "table" ? (
                      <RowsIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <GridFourIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">{item.name}</span>
                      <span className="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground">
                        {item.kind === "table"
                          ? `${item.rowCount?.toLocaleString() ?? "?"} × ${item.columns.length}`
                          : item.shape.join(" × ") || "scalar"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        <main className="min-h-0 overflow-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col px-4 py-5 sm:px-6 lg:px-8">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">{dataset.name}</h2>
                  <Badge variant="secondary">{dataset.kind}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {datasetSummary} · <span className="font-mono">{dataset.dataType}</span>
                </p>
              </div>
              {state.dataPending ? <Badge variant="outline">Reading projection</Badge> : null}
            </div>

            {catalog.warnings.length ? (
              <div className="mb-4 space-y-1 rounded-lg border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                {catalog.warnings.map((warning) => (
                  <p key={warning} className="flex gap-2">
                    <WarningCircleIcon className="mt-0.5 size-3.5 shrink-0" /> {warning}
                  </p>
                ))}
              </div>
            ) : null}

            <Tabs defaultValue="preview" className="min-h-0 flex-1">
              <TabsList variant="line">
                <TabsTrigger value="preview">
                  {dataset.kind === "table" ? <RowsIcon /> : <ChartLineIcon />} Preview
                </TabsTrigger>
                <TabsTrigger value="statistics">
                  <FunctionIcon /> Statistics
                </TabsTrigger>
                {dataset.kind === "tensor" ? (
                  <TabsTrigger value="dimensions">
                    <SlidersHorizontalIcon /> Dimensions
                  </TabsTrigger>
                ) : null}
              </TabsList>
              <TabsContent value="preview" className="mt-4 min-h-0">
                {state.dataPending && state.dataPreview ? (
                  <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <ArrowClockwiseIcon className="animate-spin" /> Updating projection
                  </div>
                ) : null}
                {dataset.kind === "table" ? <TablePreview /> : <TensorPlot />}
              </TabsContent>
              <TabsContent value="statistics" className="mt-4">
                <StatisticsView statistics={state.dataPreview?.statistics ?? []} />
              </TabsContent>
              {dataset.kind === "tensor" ? (
                <TabsContent value="dimensions" className="mt-4 space-y-4">
                  <div className="max-w-2xl">
                    <h3 className="text-sm font-medium">Slice dimensions</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Choose one or two varying dimensions. Every other dimension is fixed at an index and remains part of the saved conversion recipe.
                    </p>
                  </div>
                  <DimensionControls />
                </TabsContent>
              ) : null}
            </Tabs>
          </div>
        </main>
      </div>

      <ChartDialog open={chartOpen} onOpenChange={setChartOpen} />
    </section>
  );
}
