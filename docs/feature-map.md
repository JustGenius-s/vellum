# 功能迁移目标

旧实现被视为行为规格，而不是可复用的前端基础。

| 能力   | 旧实现行为                                    | 新实现目标                                                                            |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| 侧边栏 | 文件、搜索、大纲分别切换                      | 保留三类信息，但改为左侧纵向 shadcn Sidebar；桌面可收起为图标栏，移动端自动变为 Sheet |
| Vault  | 打开本地目录、文件树、创建/重命名/删除        | 通过 `WorkspaceGateway` 暴露，UI 不直接调用 Tauri                                     |
| 编辑器 | CodeMirror 6、Typst 高亮、wikilink 补全、诊断 | React 封装 CodeMirror 官方状态/事务模型；保持每个标签的编辑状态与滚动位置             |
| 编译   | Rust Typst 编译 SVG/PDF                       | 拆为独立 `compiler` 与 `world` 模块；保留诊断行列、警告、PDF 导出                     |
| 渲染   | SVG 实时预览                                  | 使用隔离的 SVG object URL 渲染，错误时保留最后一次成功页面                            |
| 命令   | 注册表、条件、快捷键、多段 chord              | 独立 command registry 与 keybinding manager；所有主要 UI 操作通过命令注册             |
| 搜索   | Rust 逐行全文搜索                             | 保留 200 条上限和精确行列跳转，后续可在端口后替换为 Tantivy                           |
| 双链   | 扫描 `[[wikilink]]`                           | 保留 Rust 索引，在结构侧栏展示 linked mentions                                        |
| 会话   | 恢复 Vault、标签和活动文档                    | 独立 session 模块，使用 camelCase 稳定序列化                                          |
| 数据   | 无统一数据文件体验                            | 统一适配九类常用格式，提供分页、统计、多维切片与可扩展 projection                     |
| AI 图表 | 固定二维图表模板                              | AI SDK 直接生成 Typst，编译诊断自动修复，并插入现有 Typst/Markdown 文档                |

## 本轮主动收缩

图谱、主题编辑器与装饰性动效仍不属于核心范围。架构继续通过 feature package、应用端口和独立
figure bundle 避免把数据解析、AI provider、编辑器状态重新耦合到工作区壳层。
