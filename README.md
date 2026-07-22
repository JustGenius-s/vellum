# Vellum

基于 React、Vite+、shadcn/ui、Tauri 2 与 Typst 的本地优先写作工作台。

## 技术栈

- React 19 + TypeScript
- Vite+：开发、格式化、检查、测试与构建的统一入口
- shadcn/ui（Radix Nova 基础，Phosphor 图标）
- Tailwind CSS 4（官方 Vite 插件）
- CodeMirror 6
- Tauri 2 + Rust
- Typst 0.15，输出 SVG 实时预览与 PDF
- 统一数据适配器：CSV、TSV、JSON、JSONL、XLSX、Parquet、HDF5、MAT 与 NetCDF

## 数据工作流

数据文件保留在原始 Vault 中。表格型数据提供分页预览与列统计；HDF5、MAT、NetCDF
通过变量目录、统计和一至二维切片检查。生成图表时，Vellum 会在源文件旁写入普通 JSON
投影、TOML 配方和可编辑的 Typst 图表源文件，并使用 CeTZ/cetz-plot 渲染。

## 命令

```bash
pnpm run dev
pnpm run check
pnpm run test
pnpm run build
pnpm run tauri dev
```

浏览器运行时会自动启用演示适配器，便于检查响应式 UI；Tauri 运行时使用真实本地文件系统和 Typst 编译器。

## 文档

- [功能迁移目标](./docs/feature-map.md)
- [架构说明](./docs/architecture.md)
