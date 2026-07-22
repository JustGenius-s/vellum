# 架构

```text
src/
├── domain/             纯类型与文档解析规则
├── application/
│   ├── commands/       命令注册、条件与快捷键解析
│   ├── ai/             AI SDK 的 Typst 生成、校验与修复
│   ├── ports/          文件系统/编译/会话端口
│   └── workspace-controller.ts
├── infrastructure/
│   ├── tauri/          真实桌面适配器
│   └── demo/           浏览器验收适配器
├── features/           editor、preview、commands、workspace
├── components/ui/      shadcn/ui 生成并按产品视觉定制的组件
└── app/                React providers

src-tauri/src/
├── compiler.rs         Typst SVG/PDF 与诊断
├── world.rs            受 Vault 边界约束的 Typst World
├── workspace.rs        文件、搜索、双链索引
├── session.rs          会话持久化
└── lib.rs              Tauri 组合根
```

关键约束：

1. Feature 不直接调用 `invoke`；所有外部能力经过 `WorkspaceGateway`。
2. 命令 ID 是稳定扩展点，快捷键只是命令的一个输入通道。
3. React 只订阅控制器快照，业务异步和防抖不散落在 UI 组件。
4. Rust 文件路径在 canonicalize 后必须仍位于 Vault 内。
5. 浏览器演示和桌面运行共用同一套 UI 与 application 层。

## 数据适配器

数据功能沿用应用端口边界：React 只通过 `WorkspaceGateway` 请求 catalog、preview 和 figure
bundle，Tauri 端由格式注册表分派解析器。表格格式统一输出列与分页记录；多维格式统一输出
dataset、shape、dimension、统计与一至二维的交互切片。通用 `projection.json` 保留列、行、统计
或 tensor 坐标，不感知 CSV、Parquet、HDF5 等源格式。

图表没有 ChartSpec 或另一层 DSL。AI SDK 通过可配置的 OpenAI-compatible provider 直接生成
`chart.typ`；Tauri HTTP plugin 提供不受 WebView CORS 约束的 fetch。应用使用真实 Typst 编译器
校验结果，最多把两轮 diagnostics 返回模型修复。正文只由确定性的引用插入器修改，figure bundle
固定为 `chart.typ`、`projection.json` 和 `metadata.toml`。

转换产物只使用 JSON、TOML 和 Typst，不依赖私有数据库。MAT v7.3 复用 HDF5 适配器；
NetCDF-4 与 HDF5 使用纯 Rust 解码器，避免桌面安装包依赖系统 HDF5/NetCDF 动态库。

## 预览交互

预览仍是只读的编译产物，不承担 WYSIWYG 编辑。`preview-interactions.ts` 在每个 SVG 的
Shadow Root 内统一识别交互，并把动作交回 `WorkspaceController`：

- 相对链接只会解析到当前 Vault 文件树中的文档；同名目标有歧义时不猜测。
- `http`、`https`、`mailto` 与 `tel` 链接通过 `WorkspaceGateway` 交给系统打开。
- Typst 内嵌图片通过右键菜单提供复制、保留原格式下载和 Dialog 预览，不修改文档状态。
- 自定义 Typst 元素可使用 `vellum:open:` label 声明文档跳转，例如
  `#box[Open method] <vellum:open:method>`；包含路径时可使用
  `#label("vellum:open:reading/systems.typ")`。

预览文档不能通过 label 执行任意应用命令。新增动作必须在交互联合类型、控制器方法与测试中
显式注册。
