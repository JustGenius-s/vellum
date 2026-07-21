use regex::Regex;
use std::path::Path;
use std::sync::LazyLock;
use typst::diag::{Severity, SourceDiagnostic};
use typst::{World, WorldExt};

use crate::world::TypstWorld;

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

fn apply_font_preferences(source: String, latin_font: &str, cjk_font: &str) -> (String, u32) {
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

fn markdown_to_typst(source: &str) -> String {
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
            let target = normalize_document_target(&escaped_target);
            format!("#link(\"{}\")[{}]", target, escaped_label)
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

#[tauri::command]
pub async fn compile_typst_svg(
    source: String,
    vault_path: String,
    main_file: String,
    latin_font: String,
    cjk_font: String,
    package_cache_path: Option<String>,
    package_data_path: Option<String>,
) -> Result<CompileSvgResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let prepared = if main_file.to_ascii_lowercase().ends_with(".md") {
            markdown_to_typst(&source)
        } else {
            expand_wikilinks(&source)
        };
        let (prepared, main_line_offset) =
            apply_font_preferences(prepared, &latin_font, &cjk_font);
        let world = TypstWorld::new(
            prepared,
            vault_path,
            main_file,
            package_cache_path,
            package_data_path,
        );
        let warned = typst::compile::<typst_layout::PagedDocument>(&world);
        let mut diagnostics: Vec<CompileDiagnostic> = warned
            .warnings
            .iter()
            .map(|item| format_diagnostic(&world, item, main_line_offset))
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
                diagnostics.extend(
                    errors
                        .iter()
                        .map(|item| format_diagnostic(&world, item, main_line_offset)),
                );
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
    latin_font: String,
    cjk_font: String,
    package_cache_path: Option<String>,
    package_data_path: Option<String>,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let prepared = if main_file.to_ascii_lowercase().ends_with(".md") {
            markdown_to_typst(&source)
        } else {
            expand_wikilinks(&source)
        };
        let (prepared, _) = apply_font_preferences(prepared, &latin_font, &cjk_font);
        let world = TypstWorld::new(
            prepared,
            vault_path,
            main_file,
            package_cache_path,
            package_data_path,
        );
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
