# DSH Android Studio 使用文档

[返回项目首页](<../README.md>)

## 安装

先安装并运行 DSH Web，再克隆本仓库：

```sh
git clone https://github.com/kaus-io/dsh-android-studio.git
```

在 DSH 插件管理中选择安装组合包，填写仓库的**实际绝对路径**：

```text
link:/绝对路径/dsh-android-studio
```

仓库已包含运行产物，使用时无需先构建。安装到运行 Web 的 profile 后刷新页面；如宿主提示需要重启，重启原来的 DSH 进程再刷新。本地链接依赖仓库目录，请勿随意移动或删除。

若曾安装旧版 Android 工作台（`@local/android-workbench` 或 `@local/android-studio`），先卸载或停用旧插件，避免重复工具栏。

## 快速使用

1. 在目标 Android 项目目录创建或打开 DSH 会话。发现 Android App 模块后，会话标题栏才会出现工具栏；普通项目不会显示。
2. 在 **App** 菜单选择模块和完整变体，在**设备**菜单选择状态为 `device` 的设备。USB 设备须先授权；ADB Wi-Fi 可填写 IP 与端口连接。
3. 点击**运行**构建、安装并启动 Debug 应用；或在 **Build** 中构建 APK / AAB。进度和结果进入右侧栏的**任务与输出**。
4. 需要签名时，选择生成签名包，填写现有 keystore、alias 与密码；也可对产物卡中的某个包单独签名。
5. 在右侧栏打开源码文件即可使用只读代码阅读器：`Ctrl/Cmd+F` 查找，`Ctrl/Cmd+G` 跳转行，`F3` 切换匹配；还可使用折叠、大纲与面包屑，也可切回宿主内置查看器。

也可让代理调用 `android_workbench`，或主动使用 `/android-workbench` 命令。工具栏操作和轮询不会写入聊天，主动命令与代理工具仍保留正常记录。

## 环境与限制

- Android 操作需要目标项目的 Gradle wrapper、匹配的 JDK、Android SDK / build-tools 和 ADB；仅使用代码阅读器不需要 Android 工具链。SDK 从项目 `local.properties` 的 `sdk.dir` 或 `ANDROID_HOME` / `ANDROID_SDK_ROOT` 发现。
- 默认静态扫描不执行 Gradle，动态生成的模块或变体可能无法推断。可手填完整变体，或确认后执行 **Gradle 同步**；同步运行 `tasks --all`，不构建 App，但仍会执行工程配置代码并写缓存，不改写项目的 Gradle 配置。
- 运行只允许 Debug；不支持开启 Bugly 上传或 Jiagu 加固的变体。「跳过资源任务」仅在对应资源生成任务缺失时手动使用。
- 签名只读取已有密钥，输出到项目内的新路径，不覆盖原包。界面密码一次性提交，不写聊天、日志或持久化设置；代理工具只接受 `ANDROID_*` 环境变量名，不要把密码交给模型。
- 代理发起的原生主机 / 设备操作需要 Full Access 或本次审批。独立安装 APK、停止 App、卸载与无线配对仅提供给代理工具；卸载会删除目标 App 的数据，需明确确认。
- 关闭面板不会取消正在运行的任务，请在任务与输出中显式取消。代码阅读器不提供编辑或完整语言服务，大文件会降级显示。

## 开发与验证

在本仓库目录执行：

```sh
pnpm install
pnpm run build:client
pnpm run typecheck
pnpm test
pnpm run smoke
```

测试使用模拟项目与 runner，不验证真实设备、Gradle 构建或签名环境。报告 Android 问题时，请提供 DSH 版本、系统与工具链环境、复现步骤及已脱敏的错误信息。
