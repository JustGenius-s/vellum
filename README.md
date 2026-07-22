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
- Vercel AI SDK + OpenAI-compatible provider
- 统一数据适配器：CSV、TSV、JSON、JSONL、XLSX、Parquet、HDF5、MAT 与 NetCDF

## 数据工作流

数据文件保留在原始 Vault 中。表格型数据提供分页预览与列统计；HDF5、MAT、NetCDF
通过变量目录、统计和一至二维切片检查。生成图表时，AI 直接根据数据摘要与用户要求编写
Typst；Vellum 导出通用 JSON 投影，编译并将诊断返回 AI 自动修复，最后把可编辑的 figure
bundle 写入 `figures/<slug>/`，并可在光标处或文档末尾插入引用。

OpenAI-compatible endpoint 与模型保存在会话设置中，API key 只保留于当前应用内存。

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
