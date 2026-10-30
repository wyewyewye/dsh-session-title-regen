# dsh-session-title-regen

DeepSeek Harness（DSH）插件：在左侧工作区侧边栏每个会话行右侧的 **“…”扩展菜单** 中新增 **“AI 重新生成标题”**（与置顶/重命名/分叉/归档同列，位于“复制会话 ID”之后）。

## 功能

- 读取该会话持久化事件日志中**用户最近的 10 轮 prompt**（`user/message` 事件，`source.kind === "user"`，跳过工具结果与空白消息）。
- 调用**该会话最近一次实际使用的模型**（从日志中最后一条 `request/header` 折叠出 provider/model，不改动全局标题服务配置）。
- 生成走 `ctx.llm.prepareCall`，取模型最低档 reasoning（若有），`maxTokens=64`，30 秒超时，输入上限 16 KB（超限自动丢弃最旧的 prompt）。
- 弹出可编辑预览对话框（显示所用模型），确认后通过内置 rename 路径（`sessions.using(...).binding.session.rename`）写回，侧边栏行即时更新。

## 形态

- **node 半**（`lib/index.js`）：注册 loopback-only 桥接路由 `POST /api/dsh-session-title-regen/generate`，body `{sessionId, currentTitle?}`，返回 `{ok, title, model:{provider,model}}` 或 `{ok:false, code, message}`。
- **client 半**（`lib/client.js`，手写 ModuleLoader factory，仅依赖 react）：向 `sidebar.workspaces.session.menu.item` 注入 order 500 的菜单行（位于“复制会话 ID”之后），向 `shell.overlay` 注入预览对话框；样式自带（`dshstr-` 前缀，支持深浅色）。

## 安装

> ⚠️ 必须以**真实文件目录**形式存在于 profile 的 `node_modules` 里，不能用 junction/symlink：
> 运行时 client-modules 扫描器经 loader 内部解析器解析 bundle 目录，指向 profile 树外的链接会
> 被静默 catch 跳过（`dsh-client-modules/lib/index.js:788`），bundle 便不会进入浏览器 bundle 图。
> （pnpm `link:` 跨盘安装恰好产生这种 junction——这就是当初“装好了但菜单不出现”的原因。）

```powershell
# 推荐：从 GitHub 安装（pnpm 原生，装出来是真实目录）
cd ~/.dsh/profiles/desktop        # 桌面版；网页版为 ~/.dsh/profiles/web
pnpm add github:wyewyewye/dsh-session-title-regen
# 然后在 profile 的 package.json 里把 "dsh-session-title-regen" 追加进
# dsh.profile.bundles 数组，重启 DSH 即可。
```

> 注意：`link:`/`file:<目录>` 本地依赖会被 pnpm 建成 junction 而被扫描器跳过（见上方警告）；
> `github:`、registry 或 tarball（`file:xxx.tgz`）依赖都会装成真实目录，不受影响。

## 说明

- 无需任何配置：模型路由永远跟随会话自身（`cordis.patch.yml` 仅挂载 bundle）。
- 会话从未发起过模型调用（无 `request/header`）时返回 `no-model-route` 错误并在对话框中提示。
- 提示词与标题归一化（`normalizeSessionTitle`、去整行 `**` 强调、UTF-8 字节截断）对齐官方 `dsh-session-title-all-prompts-llm`，但语义为“重新生成”：始终产出新标题，旧标题仅作上下文。
