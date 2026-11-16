# DeepSeek 记录导入 · DeepSeek import

把 DeepSeek 网页版导出的聊天记录变成 Forsion 里的一个 Agent:每段旧对话都是它名下的一个会话,点开就能接着聊。

2026-11-15 起 DeepSeek 网页版 / App 限额,一段时间没动的长对话不能再接着聊。导出记录交给这个插件,旧对话在 Forsion 里继续。

## 怎么用

1. DeepSeek 网页版 → 左下角头像 → 设置 → 数据管理 → 导出所有历史对话,下载 zip。
2. Forsion → 设置 → 插件 → DeepSeek 记录导入(或命令面板「DeepSeek 记录导入:打开」),选这个 zip(或解压后的 `conversations.json`)。
3. 选放进哪个 Agent(缺省新建「DeepSeek」)、用哪个模型接着聊、要不要带上深度思考内容,点「导入」。

## 说明

- 文件只在本机读,不上传到别处。
- 导进来的会话只在这台设备上:桌面进本机引擎,手机 / 网页进云端。手机上要用就在手机上再导一次。
- 同一段对话再导一次不会重复,也不会盖掉你接着聊过的内容;原来的标题和时间都保留,不会冒到会话列表最上面。
- 重新生成过的回答只留你最后看到的那一版;联网搜索的结果和上传的文件本身不导入(只留一行说明)。
- 需要 Forsion 2.14.3 及以上(插件接口 `ctx.tangu.createAgent` / `importSessions`,manifest 声明 `agentImport`)。

## English

Turn the chats you export from DeepSeek on the web into an agent in Forsion: each old chat becomes a session under it that you can open and continue.

1. DeepSeek on the web → your avatar at the bottom left → Settings → Data → Export all chats, and download the zip.
2. Forsion → Settings → Plugins → DeepSeek import (or "DeepSeek import: Open" in the command palette), and pick the zip (or `conversations.json` from it).
3. Choose the agent (a new "DeepSeek" agent by default), the model to continue with and whether to include DeepThink reasoning, then press Import.

The file is read on your device only. Imported sessions stay on this device (the local engine on desktop, the cloud on phone and web). Importing the same chat again neither duplicates it nor overwrites what you added by continuing it. For regenerated replies only the version you last saw is kept; web search results and uploaded files are not imported (a one-line note marks where they were). Requires Forsion 2.14.3 or later.

## 开发

`node check.mjs` 跑自检(夹具是自造的导出,不含真实聊天记录)。`sh install.sh [dev|prod]` 拷进 Forsion 家目录。

Apache-2.0
