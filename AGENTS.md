# Android Studio（Android 工作台 + 代码阅读器）

这是安装到当前 Harness profile 的持久化插件，不是 Android App 模块；不会改动业务 App 的 Gradle 配置。

**只读观察必须走静默端点**（`POST /android-workbench/observe`；签名密码走独立的 `POST /android-workbench/sign`，只放行 `package`/`sign` 并要求两个密码字段，Host 用 `agents.get(sessionId)` 解析 owner）。slash command 的 `command/run`、`command/done` 生命周期会写进聊天，轮询绝不能用它，否则会污染无关会话。工具栏与任务侧栏的所有 UI 操作（包括构建、运行、同步、连接、取消）都不能走命令入口；显式操作使用独立 `POST /android-workbench/action`，只放行 `sync/connect/disconnect/run/build/cancel`，要求 `x-awb-action` 头、JSON 与同源 Origin，仍调用同一 Host service。`observe` 在 Host 白名单只放行 `project/devices/jobs/status/artifacts/logcat`，并要求 `x-awb-observe` 头与同源 Origin，不能扩展成变更接口。用户主动输入 slash command 和模型工具保留原来的日志语义；不要通过删改既有聊天记录来隐藏操作。

所有 UI HTTP 入口（observe/action/sign）都必须经 `connection.admit(req)` 验证，并仅接受 `connection.browserPeer` 的身份；未认证请求、独立 API/模型 Peer 不得被当作人类操作。`webServer.register` 本身没有全局鉴权，不能只依赖客户端可伪造的头或 `source` 字段。新增依赖必须声明 `connection`；不可用时端点失败关闭。

## 使用入口

- **主入口必须常驻每个会话卡片的标题操作区**（`conversation.session.header.actions`）：直接显示 App、设备、运行、Build 和任务入口，而不是显示一个导航到独立页面的 Android 按钮。不得再注册独立 `main` 或侧栏工作台来承载正常功能。
- 每个工具栏严格绑定插槽传入的 `props.sessionId` 及该会话的工作目录；不得通过主视图、最近会话、侧栏选择等推断另一个 owner。设备管理、签名与日志在当前卡片的浮层中打开；不设独立的「运行配置」面板，聊天保持原位，不调用 `layout.selectPanel`。操作前重新检查项目，`projectRoot` 仅作为预期根目录校验，不允许用它切换或扩大工作区。
- 项目扫描为静态候选发现，不执行 Gradle；`modules` 为空的普通项目、检测中或未知会话**不渲染任何工具栏**（`showSessionToolbar`），也不启动设备/任务观察。约定插件动态生成的变体无法完整推断，可在构建变体的高级项填写精确变体。
- 卡片工具栏注册在 `conversation.session.header.utilities`（宿主保证右对齐的座位），不要放 `actions`；CSS 仍保留 `margin-left:auto` 兜底，顺序为「App → 设备 → 运行 → Build → Gradle 同步 → 任务」。任务输出不再用浮层，改为右侧栏标签页，变体放在 App 菜单与 Build 面板内，「跳过资源任务」复选框也在 Build 面板。
- Gradle 同步对齐 Android Studio：点 ↻ 先弹出说明，确认后以 Host job 运行 `gradlew <module>:tasks --all -q --console=plain`（未选模块时用 `tasks`），只请求 Gradle 内建 `tasks` 任务，不执行 assemble/bundle；解析 `[project:]assemble|bundle<Variant>` 得到真实变体，过滤 `bugly_on`/`jiagu_on` 到 `refused`，完成后并入该模块只读变体候选。配置阶段仍会运行工程插件代码并写 Gradle 缓存，因此必须由用户确认，超时 240s，可取消；静态 `project` 扫描仍是默认路径。同步期间工具栏显示「正在同步 Gradle…」并禁用 App/设备/运行/Build/同步，结束后显示「同步完成 · N 个变体」6 秒或失败提示，任务输出可在任务面板查看。
- 项目结构变化后仍需重新同步；同步只影响当前会话的候选变体，不改写 Gradle 文件。`skipResource` 只有在资源生成任务缺失时手动选用，不会自动排除任务。菜单**只在点击（或键盘 Enter/方向键）时打开**，再次点击、点空白或 Esc 关闭；指针悬停不得打开、延迟打开或关闭菜单，`.awb2-popup-option:hover` 只允许作为高亮样式。键盘打开后焦点进入第一项并支持方向键、Home/End；触屏与鼠标行为一致。挂载工具栏时发现设备，可见时定期更新，也可手动刷新；不自动连接、安装或启动应用。设备曾被明确选择后，失联时不得静默改成另一台。浮层按视口定位，不得被卡片工具栏的行高裁成几十像素。
- 设备管理面板只保留设备列表、选择设备、ADB Wi-Fi 与刷新；安装 APK、停止应用、卸载不再出现在界面，仅保留给 agent 工具（`install`/`stop`/`uninstall`），其显式 package 校验与卸载确认约束不变。
- Build 提供构建 APK/AAB 与「生成签名 APK / App Bundle」入口。签名向导依次确认目标、签名配置、摘要；只有最后点击生成才执行。Host 的 `package` 操作在同一个后台任务内完成构建和签名，客户端不得用 effect 在构建成功后自动另发签名请求。
- 构建完成显示真实 APK/AAB 产物卡，可直接「签名此产物」，不要求从 JSON 里抄路径。构建多产物时不猜测签名对象，保留产物卡让用户明确选择。
- 任务入口调用 `ctx.sidebarRight.openTab('androidTasks')`，在右侧栏（与终端、工作区文件同一条 dock）显示该会话的 job 历史、实时输出与取消；标签类型经 `ctx.sidebarRightTabs.register({id,kind:'androidTasks',priority:'extension',title,guide})` 注册，正文注册在 `sidebar.right.pane.tab` 且 `inject: sessionId => ({sessionId, cancelJob})`，日志走静默 `observe`。Logcat 与产物仍在卡片内的浮层，入口移到 Build 面板底部。无任务或关闭时不占聊天正文空间。新建构建/运行任务可展开输出，恢复历史已完成任务不得自动弹大面板。关闭浮层只停止显示，不取消原生任务；通过当前会话的 `jobs` 恢复观察。查看历史任务不应解除当前运行任务的互斥。
- 普通 App/变体/设备选择与签名目标（keystore 路径、alias、最近列表）按「sessionId + 项目根目录」隔离记忆，并持久化到浏览器 `localStorage` 的专用键 `android-workbench.selection.v1`；读取与写入都必须经过 `sanitizeSelection` 白名单（字段、长度、条数、去重），最多保留 32 个会话键。密码、配对码与任何 `*Password*` 字段禁止进入该存储，存储不可用（隐私模式/配额）时静默退回内存。存储条目损坏时按空缓存处理，不能把异常带到界面。
- 本仓库默认使用 `Bugly_off_Jiagu_off_Debug`。禁止 on 上传/加固变体；不修改加固策略。正式上传/加固需要另行实现专门授权流程。
- `skipResource` 只有在资源生成任务缺失时手动选用，不会自动排除任务。
- 卸载会删除目标设备上该 applicationId 对应 App 的数据。Hanna 和 Voice 可能使用相同 applicationId，不能按模块名假定二者可并存。

## 签名与无线配对

- 本机需有 Android SDK/build-tools、JDK（`jarsigner`）和项目 Gradle wrapper。ADB 从 SDK 或 PATH 发现。
- 签名使用现有 keystore 与 alias，密钥文件只读，不生成或导出密钥。构建面板提供可复用的签名配置（keystore 路径带本会话下拉记忆、alias、两个密码框），「构建并签名」在同一个 Host `package` 任务里完成构建与签名，输出路径自动带时间戳避免覆盖；签名向导与面板共用同一份配置。keystore/alias 与最近列表作为非敏感选择状态持久化（见上文 `localStorage` 规则），密码不进入 `selectionCache`、浏览器存储或任何配置文件，提交后立即清空。
- 密码由界面输入（`type=password`，`autocomplete=new-password`），随签名请求一次性 POST 到同源的 `/android-workbench/sign`；Host 只把它注入本次子进程的环境变量（`AWB_STORE_*` / `AWB_KEY_*`），`apksigner`/`jarsigner` 的 argv 里只有变量名。密码不写聊天、不写 job 结果、不落盘，请求结束即丢弃，错误信息也会把密码值替换为 `[REDACTED]`。模型工具没有这条通道，只能引用 `ANDROID_*` 环境变量名。
- ADB Wi-Fi 面板不再重复列设备：设备列表本身已含无线设备，无线行右侧直接给「断开」；ADB Wi-Fi 区域只保留标题、＋ 连接弹窗和「之前连接过的设备」历史（可重连、可移除）。连接目标由 IP + 端口（默认 5555，可留空）组合成 `ip:port`，回车或点「连接」执行；断开必须带该设备的精确地址。成功连接写入历史，该历史属于非敏感选择状态，走上面的持久化白名单。
- 界面不再提供「无线调试配对」入口；配对仍然只存在于 Host 的 `pair` 动作（配对码只接受 `ANDROID_*` 环境变量名，值不进入界面）。USB/无线连接与断开都需要明确设备或地址，不提供全局断开/清空日志/任意 shell。
- 签名写到项目内一个**不存在的新路径**，不覆盖原包，APK 对齐签名后验证，AAB 签名后验证。
- 不把密码保存在浏览器存储、插件配置、Gradle 属性或临时文件中，也不写入仓库；`localStorage` 只允许上述非敏感选择状态。

## 任务输出与 Gradle 同步

- 新任务（build/run/package/sign/sync）通过 `chooseJob` 只更新选择并调用 `openTasksTab()`，**不得**再打开卡片内的 Build/Run 工具窗；卡片 `toolsBody` 只保留 Logcat/Artifacts。
- `openTasksTab` 必须在 `sidebarRightTabs.register` **之前**赋值，避免旧 client 模块仍占用 `androidTasks` kind 时按钮变成空函数；注册失败只告警，不能阻断工具栏。
- `TasksBody` 负责作业列表/输出/取消；新增 `reloadToken` 手动刷新，并在新 running job 出现时自动选中一次，用户手动选历史任务后不得被轮询抢回。
- Gradle 刷新按钮必须渲染 `SyncDialog`（确认说明 → `action:'sync'`）；同步 job 打开右侧栏，工具栏保留 running/成功/失败状态。按钮 disabled 时 title 要说明原因。
- 右侧栏 `androidTasks` 仍使用原 kind，便于恢复已有布局；不要改成按 tab id 推断模块已更新。

## 权限与扩展边界

UI 按钮通过显式操作端点（签名走专用密码端点）执行明确的原生主机操作，可能访问设备、SDK、keystore 和工作区外 Gradle 缓存。它们不是可由模型伪造的授权选项。代理工具 `android_workbench` 使用同一 Host 方法；非 Full Access 会话的原生操作需要本次审批，未授权一律拒绝。只读项目/产物发现不提升权限。

模型工具以及命令参数禁止新增原始 shell、任意 Gradle 参数；明文密码只允许存在签名专用的一次性通道里，禁止进入 argv、日志、job 结果、缓存或模型工具参数。必须维持显式设备序列号、参数白名单、路径/符号链接边界、输出不覆盖和后台任务所有者检查。所有进程通过 Harness subprocess 管理，卸载插件要中断并等待退出。

## 本地验证

前端维护 `client.view.js`、纯交互规则 `ui-model.js` 和合并进来的代码阅读器 `src/reader/`，中英词典来自 `locale/*.json`。合并入口是 `src/client.tsx`；执行 `node build-client.mjs` 生成实际加载的 `client.js`，不要直接修改生成文件。构建只打包同一插件的 JS，不生成 mock 页面、独立应用或 DOM 模拟器。

代码阅读器注册为 document preview 实现 `@local/dsh-android-studio/code-reader`，使用 `androidStudioCodeReader` 词典命名空间和独立样式标签；不要把阅读器拆回独立插件包，也不要把阅读器拆成第二个客户端模块。阅读器视觉是 Xcode Light/Dark 的紧凑编辑器（顶部文件名 + 面包屑），不要改回 VS Code 的文件 tab、minimap、状态栏、缩进竖线或 IDEA 配色。插件页显示名是 **Android Studio**。

在本目录执行 `pnpm install && node build-client.mjs --check && npm test`；`npm test` 覆盖 Android 纯状态转换、Host 串行构建签名流程、权限/设备边界、资源取消，以及 `tests/` 下的阅读器词法/折叠/大纲/查找/布局测试。测试使用独占临时目录和注入 runner，不操作真实设备、签名密钥或真实 Gradle。安装使用 Harness `plugin_manager install_bundle`，不要手工修改 profile 文件。

本地安装链接本目录；移动或删除目录会影响插件。修改已安装运行时代码后，以安装结果为准决定是否需要重启，不从 slot id 推断模块已更新。
