# Vellum 编译架构与前端性能重构

## 目标与基线

本次重构同时解决两类问题：编译链路需要稳定利用 Typst/comemo 的增量能力，前端架构需要让新功能可以按能力接入，并避免编辑、编译进度和预览更新触发无关界面重渲染。

使用 `/Users/morisi/Downloads/typestest/main.typ`、release 构建和真实 CeTZ/CeTZ-Plot 包测得：

| 场景 | 耗时 / 负载 |
| --- | ---: |
| 冷编译 | 约 815ms |
| 相同内容热编译 | 平均约 20.7ms |
| 局部修改编译 | 约 24.4ms |
| 全量 SVG 渲染 | 约 14.3ms |
| 单变化页 SVG 渲染 | 约 4.0ms |
| 全量 SVG 传输 | 2.37MB |
| 单变化页 SVG 传输 | 0.56MB |

Typst/comemo 已复用约 97.5% 的热编译计算。因此 Vellum 不维护持久 `World`、`Document` 或自研 Typst 计算缓存。优化集中在稳定输入、文件快照、页面 SVG 补丁、任务调度和前端渲染隔离。

## 数据流

```text
CodeMirror transaction
  → DocumentBufferStore
  → PreviewCompileCoordinator
  → CompilePort
  → Tauri CompileRuntime
  → Typst/comemo
  → hash128(Page) SVG patch
  → PreviewPageCache
  → visible pages + 2-page overscan
```

CodeMirror `Text` 是编辑期权威文本。`WorkspaceState.tabs` 只保存路径、名称、dirty 和 revision；完整字符串只在编译、保存、AI 读取和外部写入协调时生成。

## 能力端口与功能贡献

原 `WorkspaceGateway` 已拆成以下能力接口，同时保留交集类型供运行时组合：

- `FilePort`
- `CompilePort`
- `DataPort`
- `PackagePort`
- `SessionPort`
- `PreviewPort`
- `AiPort`
- `RuntimePort`

内容、文件和包服务只声明自身需要的端口。Tauri 和 Demo 仍提供一个组合实现，避免运行时装配复杂化。

`WorkspaceFeatureContribution` 统一描述功能 ID、导航标签、图标、面板或页面位置、懒加载组件、命令工厂和依赖能力。Files、Search、Outline、Tasks、Packages、Settings 都通过同一注册表进入侧栏、主页面和命令注册流程。Session 字段和既有命令 ID 未改变。

## 编译协议

`CompileRequest` 包含：

- `requestId`
- `intent: preview | validate | export`
- Vault、主文件、字体和包目录
- `cachedPageIds`，即前端当前实际持有 SVG 的页面哈希
- `overlays: { path, revision, content }[]`

主文件始终作为 overlay 发送；其他 dirty 文本标签一并发送。后端规范化路径并拒绝 Vault 外 overlay，overlay 始终优先于磁盘。

`CompileSvgResult` 包含：

- `requestId`
- 完整 diagnostics
- `pageOrder: { id, width, height }[]`
- `changedPages: { id, svg }[]`
- queue、prepare、compile、render、total 耗时
- 文件缓存命中/未命中、渲染/复用页数和 SVG 字节数

页面 ID 为 Typst `hash128(Page)` 的 32 位十六进制字符串。SVG 缓存键额外包含渲染 options 版本。编译错误只更新 diagnostics，不覆盖最后一次成功页面。

## Tauri CompileRuntime

`CompileRuntime` 使用一个常驻工作线程串行执行编译：

- 优先级为 `preview > export > validate`。
- 队列最多 16 个后台任务。
- 新 preview 会取消尚未执行的旧 preview。
- 已运行任务不中断；前端通过 request version 丢弃过期结果。
- PDF 和 SVG/validate 共用同一运行时，避免并发 Typst 任务争抢 CPU 和文件系统。

文件快照缓存全局上限 64MiB，以规范化路径、修改时间和长度失效，使用最近访问顺序淘汰。它只缓存磁盘字节，不缓存 `World` 或 Typst 编译结果。

SVG 页面缓存上限 64MiB，以 `SVG options + 页面哈希` 为键。后端只省略请求中 `cachedPageIds` 明确声明前端已有的页面；前端未声明的页面即使命中后端 LRU，也必须从 LRU 取出并进入 `changedPages`。这样 WebView 刷新、缓存重建或过期结果被丢弃后不会形成缺失补丁。Markdown、wikilink 和字体注入由统一 source preprocessor 处理，主文件、include、AI validate 和 PDF 使用相同规则。

Demo 使用相同请求、进度、优先队列、metrics 和页面补丁语义，便于在非 Tauri 环境验证前端调度。

## 前端调度和状态隔离

`PreviewCompileCoordinator` 实现：

- 自动编译 250ms trailing debounce。
- 手动编译立即入队。
- 任意时刻一个 active 和一个 latest pending。
- 新修改覆盖 pending。
- request version 或 `requestId` 不匹配的结果不提交。

`CompileProgressStore` 独立于 `WorkspaceState`。中间进度每动画帧最多发布一次，开始、完成和失败立即发布。编辑器、侧栏和其他 workspace selector 不会因为进度事件更新。

所有功能组件改用 `useWorkspaceSelector`。selector 具有结果缓存和相等比较；WorkspaceController 虽然仍广播状态版本，但未选中变化字段的组件不会重渲染。

## 页面补丁与虚拟预览

`PreviewPageCache` 先合并 `changedPages`，再按 `pageOrder` 生成页面。重复页面哈希可共享同一个 SVG 字符串，页面顺序变化不要求重新渲染。

预览继续组合项目已有 shadcn/ui `ScrollArea`。shadcn/ui 没有提供页面虚拟列表，因此功能层使用原生 `IntersectionObserver`：所有页面只保留准确宽高比占位，实际挂载范围为可视页前后各两页。页面 key 由哈希和重复序号组成；编译补丁未改变的已挂载页面不会重建 Shadow Root。

Packages、Settings、Tasks 以及 Files/Search/Outline 面板都通过 feature contribution 懒加载，静态入口只保留轻量元数据与图标。

页面型功能以覆盖层显示，编辑器、可调整分栏和预览树在页面切换期间保持挂载。返回 Files 时复用既有 Shadow Root、SVG DOM、滚动位置和虚拟页窗口，不重新解析当前页面 SVG。

## 验收

自动测试覆盖：

- trailing debounce、单飞、pending 覆盖和过期结果
- CodeMirror Text 缓冲与 revision
- 页面补丁合并、顺序变化、重复哈希和缺失补丁
- 前端缓存 ID 握手，以及后端命中但前端缺页时仍返回 SVG
- 可视窗口与两页 overscan
- 既有命令、AI、workspace、preview interaction 测试

持续性能目标：

- 热编译中位耗时不高于同进程冷编译的 10%。
- 局部修改至少复用 3/4 页面。
- 局部修改 SVG 负载不高于全量负载的 30%。
- 最多一个活动预览任务和一个 pending。
- 实际挂载页不超过可视页数加四页。
- 初始入口 JS 相比重构前下降至少 10%。

项目验证只运行 `pnpm run build` 和 `pnpm exec vp test`，不启动开发服务器或浏览器自动化。
