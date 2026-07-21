use regex::Regex;
use std::sync::LazyLock;
use typst::diag::{Severity, SourceDiagnostic};
use typst::{World, WorldExt};

use crate::world::TypstWorld;

static WIKILINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").expect("valid wikilink regex")
});

fn expand_wikilinks(source: &str) -> String {
    WIKILINK_RE
        .replace_all(source, |captures: &regex::Captures| {
            let target = captures.get(1).map(|value| value.as_str()).unwrap_or("");
            let label = captures
                .get(2)
                .map(|value| value.as_str())
                .unwrap_or(target);
            let escaped_target = target.replace('\\', "\\\\").replace('"', "\\\"");
            let escaped_label = label.replace('\\', "\\\\").replace('"', "\\\"");
            format!("#link(\"{}.typ\")[{}]", escaped_target, escaped_label)
        })
        .into_owned()
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
pub struct CompileSvgResult {
    pages: Option<Vec<String>>,
    diagnostics: Vec<CompileDiagnostic>,
}

fn format_diagnostic(world: &TypstWorld, diagnostic: &SourceDiagnostic) -> CompileDiagnostic {
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
                    line = Some((line_index + 1) as u32);
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

#[tauri::command]
pub async fn compile_typst_svg(
    source: String,
    vault_path: String,
    main_file: String,
) -> Result<CompileSvgResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let world = TypstWorld::new(expand_wikilinks(&source), vault_path, main_file);
        let warned = typst::compile::<typst_layout::PagedDocument>(&world);
        let mut diagnostics: Vec<CompileDiagnostic> = warned
            .warnings
            .iter()
            .map(|item| format_diagnostic(&world, item))
            .collect();

        match warned.output {
            Ok(document) => {
                let options = typst_svg::SvgOptions::default();
                let pages = document
                    .pages()
                    .iter()
                    .map(|page| typst_svg::svg(page, &options))
                    .collect();
                Ok(CompileSvgResult {
                    pages: Some(pages),
                    diagnostics,
                })
            }
            Err(errors) => {
                diagnostics.extend(errors.iter().map(|item| format_diagnostic(&world, item)));
                Ok(CompileSvgResult {
                    pages: None,
                    diagnostics,
                })
            }
        }
    })
    .await
    .map_err(|error| format!("SVG compile task failed: {error}"))?
}

#[tauri::command]
pub async fn compile_typst_pdf(
    source: String,
    vault_path: String,
    main_file: String,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let world = TypstWorld::new(expand_wikilinks(&source), vault_path, main_file);
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
    })
    .await
    .map_err(|error| format!("PDF compile task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::expand_wikilinks;

    #[test]
    fn expands_wikilinks_with_optional_labels() {
        let source = "See [[method]] and [[atlas|Field atlas]].";
        let expanded = expand_wikilinks(source);
        assert!(expanded.contains("#link(\"method.typ\")[method]"));
        assert!(expanded.contains("#link(\"atlas.typ\")[Field atlas]"));
    }
}
