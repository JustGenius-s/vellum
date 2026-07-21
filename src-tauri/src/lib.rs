mod compiler;
mod packages;
mod session;
mod workspace;
mod world;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            compiler::compile_typst_pdf,
            compiler::compile_typst_svg,
            world::list_font_families,
            packages::list_packages,
            packages::install_package,
            packages::remove_package,
            packages::clear_package_cache,
            packages::preflight_template_project,
            packages::create_template_project,
            packages::read_template_thumbnail,
            workspace::list_vault_tree,
            workspace::search_vault,
            workspace::read_file,
            workspace::write_file,
            workspace::create_file,
            workspace::rename_path,
            workspace::delete_path,
            workspace::index_backlinks,
            session::load_state,
            session::save_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Vellum");
}
