use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{mpsc, Arc, Condvar, LazyLock, Mutex};
use std::time::Instant;
use tauri::{ipc::Channel, State};
use typst::diag::{Severity, SourceDiagnostic};
use typst::utils::hash128;
use typst::{World, WorldExt};

use crate::world::{CompileProgress, CompileProgressReporter, TypstWorld, WorldOverlay};

static WIKILINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").expect("valid wikilink regex")
});

static MARKDOWN_INLINE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(!?\[\[[^\]\n]+\]\]|!\[[^\]\n]*\]\([^\)\n]+\)|\[[^\]\n]+\]\([^\)\n]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\$[^$\n]+\$)"#,
    )
    .expect("valid markdown inline regex")
});

fn normalize_document_target(target: &str) -> String {
    let target = target.trim();
    if Path::new(target).extension().is_some() {
        target.to_string()
    } else {
        format!("{target}.typ")
    }
}

fn escape_typst_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

pub(crate) fn apply_font_preferences(source: String, latin_font: &str, cjk_font: &str) -> (String, u32) {
    let families = [latin_font, cjk_font]
        .into_iter()
        .filter(|family| !family.is_empty())
        .map(|family| format!("\"{}\"", escape_typst_string(family)))
        .collect::<Vec<_>>();

    match families.as_slice() {
        [] => (source, 0),
        [family] => (format!("#show: set text(font: {family})\n{source}"), 1),
        _ => (
            format!("#show: set text(font: ({}))\n{source}", families.join(", ")),
            1,
        ),
    }
}

fn escape_typst_markup(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        if matches!(character, '\\' | '#' | '$' | '*' | '_' | '`' | '<' | '>' | '@') {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

fn render_wikilink(value: &str) -> String {
    let value = value.strip_prefix('!').unwrap_or(value);
    let inner = value.trim_start_matches("[[").trim_end_matches("]]");
    let (target, label) = inner
        .split_once('|')
        .map(|(target, label)| (target.trim(), label.trim()))
        .unwrap_or_else(|| (inner.trim(), inner.trim()));
    let target = normalize_document_target(target);
    format!(
        "#link(\"{}\")[{}]",
        escape_typst_string(&target),
        markdown_inline(label)
    )
}

fn render_markdown_token(value: &str) -> String {
    if value.starts_with("[[") || value.starts_with("![[") {
        return render_wikilink(value);
    }

    if value.starts_with("![") {
        if let Some(split) = value.find("](") {
            let path = &value[split + 2..value.len().saturating_sub(1)];
            return format!("#image(\"{}\")", escape_typst_string(path));
        }
    }

    if value.starts_with('[') {
        if let Some(split) = value.find("](") {
            let label = &value[1..split];
            let target = &value[split + 2..value.len().saturating_sub(1)];
            return format!(
                "#link(\"{}\")[{}]",
                escape_typst_string(target),
                markdown_inline(label)
            );
        }
    }

    if value.starts_with("**") && value.ends_with("**") {
        return format!("*{}*", markdown_inline(&value[2..value.len() - 2]));
    }
    if value.starts_with("__") && value.ends_with("__") {
        return format!("*{}*", markdown_inline(&value[2..value.len() - 2]));
    }
    if ((value.starts_with('*') && value.ends_with('*'))
        || (value.starts_with('_') && value.ends_with('_')))
        && value.len() >= 2
    {
        return format!("_{}_", markdown_inline(&value[1..value.len() - 1]));
    }
    if value.starts_with('`') && value.ends_with('`') && value.len() >= 2 {
        return format!(
            "#raw(\"{}\")",
            escape_typst_string(&value[1..value.len() - 1])
        );
    }
    if value.starts_with('$') && value.ends_with('$') {
        return value.to_string();
    }

    escape_typst_markup(value)
}

fn markdown_inline(value: &str) -> String {
    let mut output = String::new();
    let mut cursor = 0;
    for found in MARKDOWN_INLINE_RE.find_iter(value) {
        output.push_str(&escape_typst_markup(&value[cursor..found.start()]));
        output.push_str(&render_markdown_token(found.as_str()));
        cursor = found.end();
    }
    output.push_str(&escape_typst_markup(&value[cursor..]));
    output
}

fn markdown_embed_target(line: &str) -> Option<&str> {
    let trimmed = line.trim();
    let inner = trimmed.strip_prefix("![[")?.strip_suffix("]]")?;
    Some(inner.split_once('|').map(|(target, _)| target).unwrap_or(inner).trim())
}

pub(crate) fn markdown_to_typst(source: &str) -> String {
    let mut output = String::new();
    let mut fenced = false;

    for line in source.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            fenced = !fenced;
            output.push_str(line);
            output.push('\n');
            continue;
        }
        if fenced {
            output.push_str(line);
            output.push('\n');
            continue;
        }

        if let Some(target) = markdown_embed_target(line) {
            let target = normalize_document_target(target);
            if target.to_ascii_lowercase().ends_with(".typ") {
                output.push_str(&format!("#include \"{}\"", escape_typst_string(&target)));
            } else {
                output.push_str(&render_wikilink(&format!("[[{target}]]")));
            }
            output.push('\n');
            continue;
        }

        let heading_level = trimmed.chars().take_while(|character| *character == '#').count();
        if (1..=6).contains(&heading_level)
            && trimmed[heading_level..]
                .chars()
                .next()
                .is_some_and(char::is_whitespace)
        {
            output.push_str(&"=".repeat(heading_level));
            output.push(' ');
            output.push_str(&markdown_inline(trimmed[heading_level..].trim_start()));
            output.push('\n');
            continue;
        }

        if let Some(quote) = trimmed.strip_prefix("> ") {
            output.push_str("#quote(block: true)[");
            output.push_str(&markdown_inline(quote));
            output.push_str("]\n");
            continue;
        }

        let unordered = ["- ", "* ", "+ "]
            .into_iter()
            .find_map(|marker| trimmed.strip_prefix(marker));
        if let Some(item) = unordered {
            output.push_str("- ");
            output.push_str(&markdown_inline(item));
            output.push('\n');
            continue;
        }

        if let Some((number, item)) = trimmed.split_once(". ") {
            if !number.is_empty() && number.chars().all(|character| character.is_ascii_digit()) {
                output.push_str("+ ");
                output.push_str(&markdown_inline(item));
                output.push('\n');
                continue;
            }
        }

        if trimmed.len() >= 3
            && trimmed
                .chars()
                .all(|character| matches!(character, '-' | '*' | '_' | ' '))
        {
            output.push_str("#line(length: 100%)\n");
            continue;
        }

        output.push_str(&markdown_inline(line));
        output.push('\n');
    }

    output
}

pub(crate) fn expand_wikilinks(source: &str) -> String {
    WIKILINK_RE
        .replace_all(source, |captures: &regex::Captures| {
            let target = captures.get(1).map(|value| value.as_str()).unwrap_or("");
            let label = captures
                .get(2)
                .map(|value| value.as_str())
                .unwrap_or(target);
            let escaped_target = target.replace('\\', "\\\\").replace('"', "\\\"");
            let escaped_label = label.replace('\\', "\\\\").replace('"', "\\\"");
            let target = normalize_document_target(&escaped_target);
            format!("#link(\"{}\")[{}]", target, escaped_label)
        })
        .into_owned()
}

pub(crate) fn preprocess_source(path: &str, source: &str) -> String {
    if path.to_ascii_lowercase().ends_with(".md") {
        markdown_to_typst(source)
    } else {
        expand_wikilinks(source)
    }
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileOverlay {
    path: String,
    revision: u64,
    content: String,
}

#[derive(Clone, Copy, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CompileIntent {
    Preview,
    Validate,
    Export,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileRequest {
    request_id: String,
    intent: CompileIntent,
    vault_path: String,
    main_file: String,
    latin_font: String,
    cjk_font: String,
    package_cache_path: Option<String>,
    package_data_path: Option<String>,
    #[serde(default)]
    cached_page_ids: Vec<String>,
    overlays: Vec<CompileOverlay>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompileDiagnostic {
    severity: String,
    message: String,
    line: Option<u32>,
    column: Option<u32>,
    path: Option<String>,
    hints: Vec<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageOrderEntry {
    id: String,
    width: f64,
    height: f64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedPage {
    id: String,
    svg: String,
}

#[derive(Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileTimings {
    queue_ms: f64,
    prepare_ms: f64,
    compile_ms: f64,
    render_ms: f64,
    total_ms: f64,
}

#[derive(Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileMetrics {
    timings: CompileTimings,
    file_cache_hits: usize,
    file_cache_misses: usize,
    rendered_pages: usize,
    reused_pages: usize,
    svg_bytes: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileSvgResult {
    request_id: String,
    diagnostics: Vec<CompileDiagnostic>,
    page_order: Vec<PageOrderEntry>,
    changed_pages: Vec<ChangedPage>,
    metrics: CompileMetrics,
}

struct SvgCacheEntry {
    svg: String,
    last_used: u64,
}

struct SvgPageCache {
    entries: HashMap<String, SvgCacheEntry>,
    bytes: usize,
    capacity: usize,
    clock: u64,
}

impl SvgPageCache {
    fn new(capacity: usize) -> Self {
        Self { entries: HashMap::new(), bytes: 0, capacity, clock: 0 }
    }

    fn get(&mut self, key: &str) -> Option<String> {
        self.clock = self.clock.wrapping_add(1);
        let entry = self.entries.get_mut(key)?;
        entry.last_used = self.clock;
        Some(entry.svg.clone())
    }

    fn insert(&mut self, key: String, svg: String) {
        self.clock = self.clock.wrapping_add(1);
        if let Some(previous) = self.entries.remove(&key) {
            self.bytes = self.bytes.saturating_sub(previous.svg.len());
        }
        self.bytes += svg.len();
        self.entries.insert(key, SvgCacheEntry { svg, last_used: self.clock });
        while self.bytes > self.capacity && self.entries.len() > 1 {
            let Some(oldest) = self.entries.iter().min_by_key(|(_, value)| value.last_used).map(|(key, _)| key.clone()) else { break; };
            if let Some(removed) = self.entries.remove(&oldest) {
                self.bytes = self.bytes.saturating_sub(removed.svg.len());
            }
        }
    }
}

enum CompileJobKind {
    Svg {
        request: CompileRequest,
        reporter: CompileProgressReporter,
        reply: mpsc::Sender<Result<CompileSvgResult, String>>,
    },
    Pdf {
        request: CompileRequest,
        reply: mpsc::Sender<Result<Vec<u8>, String>>,
    },
}

struct CompileJob {
    sequence: u64,
    queued_at: Instant,
    kind: CompileJobKind,
}

impl CompileJob {
    fn priority(&self) -> u8 {
        match &self.kind {
            CompileJobKind::Svg { request, .. } | CompileJobKind::Pdf { request, .. } => {
                match request.intent {
                    CompileIntent::Preview => 3,
                    CompileIntent::Export => 2,
                    CompileIntent::Validate => 1,
                }
            }
        }
    }

    fn is_preview(&self) -> bool {
        matches!(
            &self.kind,
            CompileJobKind::Svg { request, .. } if request.intent == CompileIntent::Preview
        )
    }

    fn cancel(self, reason: &str) {
        match self.kind {
            CompileJobKind::Svg { reply, .. } => { let _ = reply.send(Err(reason.to_string())); }
            CompileJobKind::Pdf { reply, .. } => { let _ = reply.send(Err(reason.to_string())); }
        }
    }
}

struct RuntimeQueue {
    jobs: Vec<CompileJob>,
    sequence: u64,
}

struct RuntimeShared {
    queue: Mutex<RuntimeQueue>,
    ready: Condvar,
}

#[derive(Clone)]
pub struct CompileRuntime {
    shared: Arc<RuntimeShared>,
}

impl Default for CompileRuntime {
    fn default() -> Self {
        let shared = Arc::new(RuntimeShared {
            queue: Mutex::new(RuntimeQueue { jobs: Vec::new(), sequence: 0 }),
            ready: Condvar::new(),
        });
        let worker_shared = shared.clone();
        std::thread::Builder::new()
            .name("vellum-compile-runtime".into())
            .spawn(move || compile_worker(worker_shared))
            .expect("compile runtime worker should start");
        Self { shared }
    }
}

impl CompileRuntime {
    fn submit_svg(
        &self,
        request: CompileRequest,
        progress: Channel<CompileProgress>,
    ) -> Result<CompileSvgResult, String> {
        let reporter = CompileProgressReporter::new(progress);
        reporter.emit("queued", 2, "Queued for compilation", Some(request.request_id.clone()));
        let (reply, response) = mpsc::channel();
        self.enqueue(CompileJobKind::Svg { request, reporter, reply })?;
        response.recv().map_err(|_| "Compile runtime stopped".to_string())?
    }

    fn submit_pdf(&self, request: CompileRequest) -> Result<Vec<u8>, String> {
        let (reply, response) = mpsc::channel();
        self.enqueue(CompileJobKind::Pdf { request, reply })?;
        response.recv().map_err(|_| "Compile runtime stopped".to_string())?
    }

    fn enqueue(&self, kind: CompileJobKind) -> Result<(), String> {
        let preview = matches!(
            &kind,
            CompileJobKind::Svg { request, .. } if request.intent == CompileIntent::Preview
        );
        let mut queue = self.shared.queue.lock().map_err(|_| "Compile queue is unavailable")?;
        if preview {
            let mut kept = Vec::with_capacity(queue.jobs.len());
            for job in queue.jobs.drain(..) {
                if job.is_preview() { job.cancel("Preview request superseded"); } else { kept.push(job); }
            }
            queue.jobs = kept;
        }
        if queue.jobs.len() >= 16 {
            return Err("Compile queue is full".into());
        }
        queue.sequence = queue.sequence.wrapping_add(1);
        let sequence = queue.sequence;
        queue.jobs.push(CompileJob { sequence, queued_at: Instant::now(), kind });
        self.shared.ready.notify_one();
        Ok(())
    }
}

fn compile_worker(shared: Arc<RuntimeShared>) {
    let mut svg_cache = SvgPageCache::new(64 * 1024 * 1024);
    loop {
        let job = {
            let mut queue = shared.queue.lock().expect("compile queue lock");
            while queue.jobs.is_empty() {
                queue = shared.ready.wait(queue).expect("compile queue wait");
            }
            let index = queue.jobs.iter().enumerate().max_by(|(_, left), (_, right)| {
                left.priority().cmp(&right.priority()).then_with(|| right.sequence.cmp(&left.sequence))
            }).map(|(index, _)| index).unwrap_or(0);
            queue.jobs.remove(index)
        };
        match job.kind {
            CompileJobKind::Svg { request, reporter, reply } => {
                let result = compile_svg_sync(request, reporter, job.queued_at, &mut svg_cache);
                let _ = reply.send(result);
            }
            CompileJobKind::Pdf { request, reply } => {
                let result = compile_pdf_sync(request);
                let _ = reply.send(result);
            }
        }
    }
}

fn format_diagnostic(
    world: &TypstWorld,
    diagnostic: &SourceDiagnostic,
    main_line_offset: u32,
) -> CompileDiagnostic {
    let severity = match diagnostic.severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
    }
    .to_string();
    let mut line = None;
    let mut column = None;
    let mut path = None;

    if let Some(id) = diagnostic.span.id() {
        path = Some(id.vpath().get_without_slash().to_string());
        if let Some(range) = world.range(diagnostic.span) {
            if let Ok(source) = world.source(id) {
                if let Some((line_index, column_index)) =
                    source.lines().byte_to_line_column(range.start)
                {
                    let line_number = (line_index + 1) as u32;
                    line = if id == world.main() {
                        line_number.checked_sub(main_line_offset).filter(|line| *line > 0)
                    } else {
                        Some(line_number)
                    };
                    column = Some((column_index + 1) as u32);
                }
            }
        }
    }

    CompileDiagnostic {
        severity,
        message: diagnostic.message.to_string(),
        line,
        column,
        path,
        hints: diagnostic
            .hints
            .iter()
            .map(|hint| hint.v.to_string())
            .collect(),
    }
}

fn normalized_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn main_source(request: &CompileRequest) -> Result<String, String> {
    let main = normalized_path(&request.main_file);
    request
        .overlays
        .iter()
        .find(|overlay| normalized_path(&overlay.path) == main)
        .map(|overlay| overlay.content.clone())
        .ok_or_else(|| "The main document is missing from compile overlays".to_string())
}

fn build_world(
    request: &CompileRequest,
    progress: Option<CompileProgressReporter>,
) -> Result<(TypstWorld, u32), String> {
    let source = preprocess_source(&request.main_file, &main_source(request)?);
    let (prepared, main_line_offset) =
        apply_font_preferences(source, &request.latin_font, &request.cjk_font);
    let overlays = request
        .overlays
        .iter()
        .map(|overlay| WorldOverlay {
            path: overlay.path.clone(),
            revision: overlay.revision,
            content: overlay.content.clone(),
        })
        .collect();
    let world = TypstWorld::new(
        prepared,
        request.vault_path.clone(),
        request.main_file.clone(),
        request.package_cache_path.clone(),
        request.package_data_path.clone(),
        progress,
        overlays,
    )?;
    Ok((world, main_line_offset))
}

fn compile_svg_sync(
    request: CompileRequest,
    reporter: CompileProgressReporter,
    queued_at: Instant,
    svg_cache: &mut SvgPageCache,
) -> Result<CompileSvgResult, String> {
    let queue_ms = queued_at.elapsed().as_secs_f64() * 1000.0;
    let main_name = Path::new(&request.main_file)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(&request.main_file)
        .to_string();
    reporter.emit("preparing", 10, "Preparing source", Some(main_name.clone()));
    let prepare_started = Instant::now();
    let (world, main_line_offset) = build_world(&request, Some(reporter.clone()))?;
    let prepare_ms = prepare_started.elapsed().as_secs_f64() * 1000.0;
    reporter.emit("compiling", 22, "Compiling document", Some(main_name));
    let compile_started = Instant::now();
    let warned = typst::compile::<typst_layout::PagedDocument>(&world);
    let compile_ms = compile_started.elapsed().as_secs_f64() * 1000.0;
    let mut diagnostics: Vec<CompileDiagnostic> = warned
        .warnings
        .iter()
        .map(|item| format_diagnostic(&world, item, main_line_offset))
        .collect();
    let world_metrics = world.metrics();

    let mut page_order = Vec::new();
    let mut changed_pages = Vec::new();
    let mut rendered_pages = 0;
    let mut reused_pages = 0;
    let mut svg_bytes = 0;
    let render_started = Instant::now();

    match warned.output {
        Ok(document) => {
            let mut available_page_ids: HashSet<String> =
                request.cached_page_ids.iter().cloned().collect();
            let options = typst_svg::SvgOptions::default();
            let page_count = document.pages().len();
            for (index, page) in document.pages().iter().enumerate() {
                let id = format!("{:032x}", hash128(page));
                page_order.push(PageOrderEntry {
                    id: id.clone(),
                    width: page.frame.width().to_pt(),
                    height: page.frame.height().to_pt(),
                });
                if request.intent == CompileIntent::Validate {
                    continue;
                }
                if available_page_ids.contains(&id) {
                    reused_pages += 1;
                } else {
                    let cache_key = format!("svg-default-v1:{id}");
                    let svg = if let Some(svg) = svg_cache.get(&cache_key) {
                        reused_pages += 1;
                        svg
                    } else {
                        rendered_pages += 1;
                        let svg = typst_svg::svg(page, &options);
                        svg_cache.insert(cache_key, svg.clone());
                        svg
                    };
                    svg_bytes += svg.len();
                    changed_pages.push(ChangedPage { id: id.clone(), svg });
                    available_page_ids.insert(id);
                }
                let completed = index + 1;
                reporter.emit(
                    "rendering",
                    76 + ((completed * 22) / page_count.max(1)) as u8,
                    "Rendering preview",
                    Some(format!("Page {completed} of {page_count}")),
                );
            }
            reporter.emit("complete", 100, "Preview updated", None);
        }
        Err(errors) => {
            diagnostics.extend(
                errors
                    .iter()
                    .map(|item| format_diagnostic(&world, item, main_line_offset)),
            );
            reporter.emit(
                "complete",
                100,
                "Compile finished",
                Some(format!("{} errors", errors.len())),
            );
        }
    }

    let render_ms = render_started.elapsed().as_secs_f64() * 1000.0;
    let total_ms = queued_at.elapsed().as_secs_f64() * 1000.0;
    Ok(CompileSvgResult {
        request_id: request.request_id,
        diagnostics,
        page_order,
        changed_pages,
        metrics: CompileMetrics {
            timings: CompileTimings { queue_ms, prepare_ms, compile_ms, render_ms, total_ms },
            file_cache_hits: world_metrics.file_cache_hits,
            file_cache_misses: world_metrics.file_cache_misses,
            rendered_pages,
            reused_pages,
            svg_bytes,
        },
    })
}

fn compile_pdf_sync(request: CompileRequest) -> Result<Vec<u8>, String> {
    let (world, _) = build_world(&request, None)?;
    let warned = typst::compile::<typst_layout::PagedDocument>(&world);
    let document = warned.output.map_err(|errors| {
        errors
            .iter()
            .map(|error| error.message.to_string())
            .collect::<Vec<_>>()
            .join("; ")
    })?;
    typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|error| format!("{error:?}"))
}

#[tauri::command]
pub async fn compile_typst_svg(
    request: CompileRequest,
    progress: Channel<CompileProgress>,
    runtime: State<'_, CompileRuntime>,
) -> Result<CompileSvgResult, String> {
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || runtime.submit_svg(request, progress))
        .await
        .map_err(|error| format!("SVG compile task failed: {error}"))?
}

#[tauri::command]
pub async fn compile_typst_pdf(
    request: CompileRequest,
    runtime: State<'_, CompileRuntime>,
) -> Result<Vec<u8>, String> {
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || runtime.submit_pdf(request))
        .await
        .map_err(|error| format!("PDF compile task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{apply_font_preferences, expand_wikilinks, markdown_to_typst};

    #[test]
    fn expands_wikilinks_with_optional_labels() {
        let source = "See [[method]] and [[atlas|Field atlas]].";
        let expanded = expand_wikilinks(source);
        assert!(expanded.contains("#link(\"method.typ\")[method]"));
        assert!(expanded.contains("#link(\"atlas.typ\")[Field atlas]"));
    }

    #[test]
    fn converts_markdown_to_typst_markup() {
        let source = "# Notes\n\nA **strong** idea with [source](https://example.com).\n\n![[method.typ]]\n";
        let converted = markdown_to_typst(source);
        assert!(converted.contains("= Notes"));
        assert!(converted.contains("A *strong* idea"));
        assert!(converted.contains("#link(\"https://example.com\")[source]"));
        assert!(converted.contains("#include \"method.typ\""));
    }

    #[test]
    fn applies_escaped_font_fallbacks() {
        let (prepared, line_offset) = apply_font_preferences(
            "Hello 中文".into(),
            "Latin \"Display\"",
            "CJK\\Family",
        );
        assert_eq!(line_offset, 1);
        assert!(prepared.starts_with(
            "#show: set text(font: (\"Latin \\\"Display\\\"\", \"CJK\\\\Family\"))\n"
        ));
    }
}
