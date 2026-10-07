# arena-context

用 GitHub 保存 Arena 的文件和跨会话上下文，支持代码、调研、文档等独立任务。

**保存进度不等于接受成果。** Arena 用 `SUSTechHSAS` 提交，你用 `Kibiandkimi` 审核合并。

## 分支

| 对象 | 用途 |
| --- | --- |
| `main` | 通用协议、模板、工作流 |
| `task/<issue>/main` | 一个任务的已接受版本 |
| `work/<issue>/<unit>` | 候选工作和远程检查点；PR 指向对应任务分支 |
| `arena/<自动名称>` | Arena 自动创建的候选分支；从 TASK.md 确定任务，保留原名 |
| `meta/<unit>` → `main` | 通用协议更新 |
| `meta/<issue>/<unit>` → 任务分支 | 已有任务的协议更新 |
| 任务 Issue | 目标、验收要求、你的新指示 |

现有 `AerraGen-main` 保留原名；任务号见其 `.context/TASK.md`。任务成果不互相合并，也不合入仓库 main。一个 PR 对应可审核的工作单元，可以由多个会话接力。

## 新建任务

1. **Issues → New issue → Task**：填写目标和验收条件。
2. 用 `Kibiandkimi` 打开 **Actions → New task → Run workflow**，选择 `main`，填写 Issue 编号。
3. Action 生成 `task/<issue>/main` 和三个交接文件，运行摘要给出链接；已有分支不会被覆盖。
4. 在 Arena 选择任务分支或已有候选分支。若 Arena 自动创建 `arena/...`，直接使用该分支；也可自行创建 `work/<issue>/<unit>`。无论哪种，都核对真正的当前分支，不靠分支名猜任务号。

## 继续任务

```text
继续 SUSTechHSAS/arena-context 的任务 #<编号>，resume PR #<编号>。
读取 AGENTS.md、.context/TASK.md、STATE.md、相关 DECISIONS.md 和未解决的审核意见。
核对远程版本、已接受基线和当前候选进度，再完成下一小步。
同步更新文件与 STATE，commit、push 并确认远程 head。
只更新本 PR 的工作分支，不合并 PR、不写正式分支、不 force-push。
```

`resume` 继续原工作分支；`restart` 从任务正式分支新建工作分支。普通换会话不新建 PR。每个有效步骤同步保存产物和 STATE，确认远程提交后才算保存成功；未完成或失败状态也可保存。首次推送后建立 Draft PR。

Arena 自动创建分支不等于自动保存。agent 必须主动 commit、push 并验证远程 head。推送后，`Checkpoint → Ensure task PR` 自动创建或复用正确 base 的 Draft PR，随后运行检查；无需等 agent 再手动开 PR。若 Arena 换会话又生成一个分支，则为实际新 head 建立后继 PR，保留前驱链接。

## 每轮模型指纹

每个用户工作轮次先执行 `node .github/scripts/fingerprint.mjs prepare`，模型直接回答返回的约 300 数字探针，再保存原样数组并运行 `score <turn_id>`。评分后在同一轮继续任务，报告候选结果。按用户约定，同一轮内假定模型不变；跨轮不复用、不合并样本。

每次 prepare 都检查 WhatsMyLLM 最新 bank 和阈值；数据兼容且校验通过便立即使用，无需等仓库升级。离线时明确标记缓存版本，评分算法变化时提示需要更新检查器，不下载执行新远程代码。原始样本、结果和所用 bank 快照随检查点保存。详细说明见 [docs/FINGERPRINT.md](docs/FINGERPRINT.md)。

**工作门槛：必须是接受列表内模型的 Clear match。** 当前接受 Opus 5.5、Sonnet 5.5、Fable 5.1、GPT-6 Astra、GPT-6.1 Sol、GPT-6 Sol。列表位于 main 的 [.github/fingerprint-policy.json](.github/fingerprint-policy.json)，逐个具体模型 ID 匹配。

score 在本地即时输出 CONTINUE 或 END_TURN，不等待 CI。其他模型、Close call、Weak match、无效样本、评分或政策读取失败，都返回退出码 20，要求 agent 输出原因后直接结束轮次，不重测、不继续任务。拒绝记录已写本地，不再额外 commit/push；通过后才继续原来的检查点流程。

三个交接文件：`TASK.md` 写目标/约束/验收，`STATE.md` 写候选进度/验证/下一步，`DECISIONS.md` 写关键理由和证据。工作分支中的结论仍未经人工审核。

`arena/protocol` 检查分支归属、交接文件和规则变更范围；代码、调研和文档仍需各自的证据与人工审核。`Kibiandkimi` 是唯一必需 CODEOWNER，新增修改撤销旧批准。

仓库保留在 `SUSTechHSAS` 名下。规则没有所有者 bypass；所有者仍有修改设置的管理能力，agent 不得操作这些设置。

见 [操作说明](docs/OPERATIONS.md) 和 [任务模板](.templates/task/.context)。
