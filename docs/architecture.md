# 架构

```text
src/
├── domain/             纯类型与文档解析规则
├── application/
│   ├── commands/       命令注册、条件与快捷键解析
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
