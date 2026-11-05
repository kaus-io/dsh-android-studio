# 更新日志

## 1.0.0-alpha01

- 首个发布到 npm 的版本（`@kaus-io/dsh-android-studio`）；此前只按本地 `link:` 安装。
- 会话卡片标题栏的常驻 Android 工作台：App / 变体 / 设备选择，运行 Debug、构建 APK / AAB、签名、Gradle 同步与任务输出。
- 右侧栏「任务与输出」标签页：job 历史、实时输出、取消，日志走静默 observe 端点，不写入聊天。
- 合并只读代码阅读器：Xcode 风格紧凑编辑器，支持语法高亮、折叠、大纲、查找与面包屑。
- 设备与签名边界保持原样：ADB Wi-Fi、一次性密码通道、不覆盖原包的签名输出，以及代理工具的设备/路径白名单。
- 自有源码全部迁移到 TypeScript：Host 的 `index.js` / `runner.js` / `android.js` 由 `index.ts` / `runner.ts` / `android.ts` 构建，客户端由 `client.view.ts` / `ui-model.ts` 构建，测试为 `*.test.ts`；生成物仍提交并由 `--check` 校验。
- 修复任务面板与侧栏标题引用未定义标识符（`TOOLS_CSS`、`translate`、`button`、`setUninstallTarget`）导致的运行时 `ReferenceError`；侧栏标题改用插件自己的 locale 命名空间。
