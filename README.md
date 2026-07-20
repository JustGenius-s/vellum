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
