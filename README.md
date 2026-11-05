# Android Studio（dsh-android-studio）

DeepSeek Harness 的 Android Studio 插件，不是 Android Studio IDE 本身，也不是 Android App 模块。版本统一为 **1.0.0**。

一个插件、一个 `client.js` 提供两套能力：

- **Android 工作台**：在会话标题栏提供 App / 变体选择、ADB 设备管理、运行、APK / AAB 构建、Gradle 同步与签名；任务输出显示在右侧栏。
- **代码阅读器**：把右侧栏文件预览升级成 Xcode 风格紧凑阅读面（语法高亮、折叠、面包屑、结构大纲、文件内查找、跳转行、用法高亮、大文件虚拟滚动）。

目录、包名和插件 ID 统一为 `dsh-android-studio` / `@local/dsh-android-studio`；插件管理页显示名为 **Android Studio**。内部的 HTTP 端点、slash command、模型工具名与浏览器选择键保留历史 `android-workbench` 名称，避免破坏已有工作流与设置。

## 代码阅读器（Xcode 风格）

阅读器作为 document preview 实现注册（`@local/dsh-android-studio/code-reader`，`priority: extension`），默认接管 106 种源码/配置/日志后缀；内置「代码」预览仍可在文件头的查看器下拉里切回。

| 能力 | 说明 |
| --- | --- |
| 视觉 | Xcode Light / Dark 语法配色；顶部紧凑跳转栏（文件名 + 面包屑）；无文件 tab、minimap、底部状态栏和缩进竖线；右上角查找/大纲控件 |
| 语法高亮 | 自包含词法器，50+ 种语言有专用词法；JS/TS 模板字符串、正则字面量、嵌套块注释可跨行 |
| 代码折叠 | 花括号/方括号块、多行注释、`region`、`editor-fold`、`pragma region`、连续 import、Python/YAML 缩进块；折叠状态按文件记忆 |
| 面包屑 / 结构 | `文件名 › 类 › 方法` 随光标更新；结构面板可筛选、方向键 + Enter 跳转 |
| 查找 / 跳转 | `Ctrl/Cmd+F` 查找（大小写、全字、正则），`Ctrl/Cmd+G` 跳转行，`F3` 循环匹配 |
| 阅读辅助 | 用法高亮（双击标识符）、括号匹配、当前行高亮 |
| 性能 | 可视窗口虚拟滚动；14k 行文件分析约 50 ms；超过约 1.6 MB 自动降级为纯文本 + 行号 |

编辑器保持紧凑：没有 minimap、状态栏、文件 tab 和缩进竖线；查找、大纲、跳转行仍可通过右上角按钮或快捷键打开。

## 任务与输出 / Gradle 同步

- 新建 build / run / package / sign / Gradle sync 任务后，自动打开右侧栏 **「任务与输出」** 标签；任务输出只在该标签里，卡片内不再显示 Build/Run 输出面板。
- 卡片工具窗只保留 **Logcat** 与 **Artifacts**（入口在 Build 菜单底部）；这两类结果仍按原设计留在卡片浮层。
- 「任务与输出」标签支持手动刷新、作业历史列表、运行中自动选中、取消运行；没有任务时不会占用聊天正文。
- Gradle 刷新按钮现在会先弹出确认说明（`tasks --all` 会配置工程并可能写缓存），确认后作为一个 Host job 运行；进度与输出进入右侧栏，工具栏同时显示「正在同步 Gradle… / 同步完成 · N 个变体」。
- 按钮禁用期间 title 会说明原因（正在同步 / 忙碌），点击不再出现「无反应」。

快捷键：`Ctrl/Cmd+F` 查找，`Enter` / `Shift+Enter` / `F3` 切换匹配，`Ctrl/Cmd+G` 跳转行，`Home` / `End` / `PageUp` / `PageDown` / `Ctrl+Home` / `Ctrl+End` 移动，`Esc` 关闭浮层或清除用法高亮，双击标识符高亮所有使用处。

源码在 `src/reader/`，合并入口是 `src/client.tsx`；阅读器保留独立的实现 ID、样式标签和 `androidStudioCodeReader` 词典命名空间。

## 开发与验证

需要支持 `AbortSignal.any()` 的现代 Node.js（建议使用 DSH 所需的 Node.js 版本）。客户端源码由 esbuild 打包，构建与类型检查需要先安装开发依赖：

```sh
pnpm install
npm run build:client    # esbuild -> client.js
npm run typecheck       # tsc --strict
npm test                # 构建一致性 + Host/Android/阅读器测试
npm run smoke           # 模块注册 + 阅读器单次渲染冒烟
```

- `client.view.js`、`ui-model.js`、`locale/*.json` 是 Android 客户端源文件；`src/reader/` 是代码阅读器；`src/client.tsx` 是合并入口；`client.js` 是生成文件，保留在 Git 中用于直接安装，**不要手改**。
- `index.js`、`android.js`、`runner.js` 是 Host 源码，未变化。
- 测试使用临时项目与模拟 runner，不调用真实 Gradle、ADB 设备或签名密钥；阅读器测试见 `tests/`。
- 维护约束见 [AGENTS.md](<AGENTS.md>)。

## 安装与改名迁移

> 工作区项目统一放在 `projects/` 下，本插件位于 `projects/dsh-android-studio`；profile 里旧的 `dsh/...` link 需要按下面的新路径重新安装。

插件已从 `dsh-android-workbench` 改名为 **`dsh-android-studio`**，包名/插件 ID 同步改为 `@local/dsh-android-studio` / `dsh-android-studio`。旧 profile 里的 `@local/android-workbench` 与 `@local/android-studio` 链接都会失效，需要重装：

1. 在插件页卸载旧的 **Android 工作台 / Android Studio**（`@local/android-workbench` 或更早的 `@local/android-studio`；目录已移走，可能显示文件缺失）。暂时无法卸载时至少先关闭它，避免新旧行同时注册工具栏。
2. 添加/安装组合包，spec 填：

   ```text
   link:/home/zxhhyj/AndroidStudioProjects/kaus-workspace/projects/dsh-android-studio
   ```

3. 安装后刷新页面；如果阅读器没有出现，重启原来的 `dsh web` 进程，或把 **Android Studio** 关闭再启用。本次合并改动了 `dsh.client.inject`（新增 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview`），客户端模块元数据会按 Loader specifier 缓存到重启。

**内部兼容名保持不变**：HTTP 端点仍为 `/android-workbench/observe|action|sign`，slash command 仍为 `/android-workbench`，模型工具仍为 `android_workbench`，浏览器选择状态键仍为 `android-workbench.selection.v1`，产物输出目录仍为 `build/android-workbench/`。改名只涉及插件目录、包名、插件行 ID、客户端模块 ID 与阅读器实现 ID。

由 agent 重新安装时使用 `plugin_manager`（会更新 profile 目录链接，不要手改 profile）：

```json
{
  "action": "install_bundle",
  "target": "/home/zxhhyj/AndroidStudioProjects/kaus-workspace/projects/dsh-android-studio"
}
```

替换已安装的插件若返回 `restart-required`，需重启原来的 `dsh web` 进程后再刷新页面；仅刷新页面不会重载 Host 代码。

## 工具栏不写入聊天

工具栏和任务侧栏不再通过 slash command 发请求，包括手动运行、构建、同步、连接及取消任务。结果和错误只显示在对应面板 / 任务输出中：

| UI 请求 | 入口 | 限制 |
| --- | --- | --- |
| 项目、设备、任务、产物与日志观察 | `POST /android-workbench/observe` | 保持只读白名单 |
| 用户点击的运行 / 构建 / 同步 / 连接 / 断开 / 取消 | `POST /android-workbench/action` | 独立操作白名单、JSON、`x-awb-action` 与 Origin 校验 |
| 含一次性密码的构建签名 / 产物签名 | `POST /android-workbench/sign` | 专用密码通道，不经过命令或聊天 |

三个入口都通过 DSH Connection 验证浏览器身份，并且只接受当前认证浏览器 Peer；未认证请求、独立 API / 模型 Peer 不能冒充人类 UI。请求不能提供 `source` 等授权元数据；Host 在验证后解析精确的会话 owner，再调用与 agent 工具相同的业务方法。取消任务仍检查 job owner，关闭短操作请求会中止并等待其清理。

用户主动输入 `/android-workbench` 和 agent 调用 `android_workbench` 仍保留正常命令 / 工具记录；模型原生操作仍要求 Full Access 或本次审批。修复不会删除或改写已有聊天记录。已运行的旧模块需要按安装结果重载，旧页面也需要刷新才能停止使用原来的命令路径。

## 实际使用

真实构建需要 Android SDK、JDK 与目标项目的 Gradle wrapper；设备操作需要 ADB。插件按每个会话的工作目录发现项目，不依赖本插件在磁盘上的位置，也不修改业务 App 的 Gradle 配置。

- 静态发现不运行 Gradle；手动同步会执行 Gradle 配置阶段。
- 上传 / 加固开启的变体不受支持。
- 签名使用现有 keystore，不覆盖已有产物；密码不写入聊天、日志或持久化设置。
- 卸载 App 会删除目标设备上的该 App 数据，需明确确认。
