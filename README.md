# Vellum

基于 Typst 排版引擎的本地优先知识管理工具。犊皮纸（vellum）是最高级的书写载体——这个名字象征美丽的排版与知识的保存。

## 定位

不是 Obsidian 复刻，是「排版优先的知识管理工具」。

- 目标用户：学术笔记、长文写作者、技术文档作者
- 核心壁垒：Typst 的段落级优化排版 + TeX 级数学公式
- 杀手特性：Zotero 远程引用体系（不是插件，是出厂自带）

## 技术栈

### 桌面壳层
| 组件 | 选择 | 理由 |
|---|---|---|
| 桌面框架 | Tauri 2 | Rust 同栈 Typst，包体小，原生文件系统访问 |
| 前端框架 | Svelte 5 | 编译后无运行时，体积最小 |
| 编辑器组件 | CodeMirror 6 | Obsidian 同款，插件架构完善 |

### 排版引擎
| 组件 | 选择 | 理由 |
|---|---|---|
| Typst 编译器 | `typst` Rust crate | 直接链进 Tauri Rust 侧 |
| 增量编译 | `comemo`（Typst 内置） | 透明使用 |
| 实时预览 | `typst-svg` | 输出 SVG 前端直接渲染 |

### 数据层
| 组件 | 选择 |
|---|---|
| 本地文件 | 文件系统（`.typ` 文件） |
| 全文搜索 | Rust 侧字符串匹配（Tantivy 待接入） |
| 双链索引 | Rust 侧正则扫描 `[[wikilink]]` |
| 引用管理 | Zotero Better BibTeX 本地 HTTP API |

## 功能

- [x] Typst 编译 → PDF / SVG 实时预览
- [x] 文件树 + vault 打开
- [x] `[[wikilink]]` 语法 + 反向链接面板
- [x] Zotero 引用搜索（需装 Better BibTeX 插件）
- [x] 全文搜索
- [ ] LSP 集成（Tinymist）
- [ ] 知识图谱
- [ ] 插件系统

## 开发

```bash
pnpm install
pnpm tauri dev
```

## 许可证

MIT