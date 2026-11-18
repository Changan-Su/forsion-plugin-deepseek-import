# Changelog

## 0.1.1 — 2026-11-18

- 保存的「上次用的 Agent」存过却读不出来时(文件读出错、是空的、写到一半或被手改坏),不再按没存过接着用:不预选 Agent、提示一次,这次导入后也不保存,原来的设置原样留着;「放进哪个 Agent」那一行写明这次的选择不会记住。导入本身照常。以前在这种情况下导入一次,保存的设置就被整个换成只有这一项的新设置。没存过时照旧;需要 2.14.2 之后的 Forsion(更早的版本读不出来时仍当没存过)。
- When the saved "last agent you used" was saved but can't be read (a read error, an empty file, a write cut off halfway, or a hand edit that broke it), the plugin no longer treats it as never saved: no agent is pre-selected, you're told once, and nothing is saved after the import, so the original settings are left as they were; the "Agent" row says this choice won't be remembered. Importing itself works as usual. Before, one import in that state replaced the saved settings with new ones holding only that entry. With nothing saved yet it works as before. Needs Forsion newer than 2.14.2 (earlier versions still treat unreadable data as never saved).

## 0.1.0 — 2026-11-16

- 首个版本:选 DeepSeek 导出的 zip / conversations.json,新建「DeepSeek」Agent(或放进已有的 Agent),每段旧对话写成能接着聊的会话;保留标题、时间与深度思考内容,再导不重复。
- First release: pick the DeepSeek export zip or conversations.json, create a "DeepSeek" agent (or use an existing one) and write each old chat as a session you can continue, keeping titles, dates and DeepThink reasoning; importing again does not duplicate.
