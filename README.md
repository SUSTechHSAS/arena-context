# arena-context

用 GitHub 保存 Arena 的文件和跨会话上下文，支持代码、调研、文档等独立任务。

**保存进度不等于接受成果。** Arena 用 `SUSTechHSAS` 提交，你用 `Kibiandkimi` 审核合并。

## 分支

| 对象 | 用途 |
| --- | --- |
| `main` | 通用协议、模板、工作流 |
| `task/<issue>/main` | 一个任务的已接受版本 |
| `work/<issue>/<unit>` | 候选工作和远程检查点；PR 指向对应任务分支 |
| `meta/<unit>` → `main` | 通用协议更新 |
| `meta/<issue>/<unit>` → 任务分支 | 已有任务的协议更新 |
| 任务 Issue | 目标、验收要求、你的新指示 |

现有 `AerraGen-main` 保留原名；任务号见其 `.context/TASK.md`。任务成果不互相合并，也不合入仓库 main。一个 PR 对应可审核的工作单元，可以由多个会话接力。

## 新建任务

1. **Issues → New issue → Task**：填写目标和验收条件。
2. 用 `Kibiandkimi` 打开 **Actions → New task → Run workflow**，选择 `main`，填写 Issue 编号。
3. Action 生成 `task/<issue>/main` 和三个交接文件，运行摘要给出链接；已有分支不会被覆盖。
4. 从任务分支创建 `work/<issue>/<unit>`，在 Arena 中选择它。也可先选任务分支，明确要求 agent 在修改前创建工作分支。

## 继续任务

```text
继续 SUSTechHSAS/arena-context 的任务 #<编号>，resume PR #<编号>。
读取 AGENTS.md、.context/TASK.md、STATE.md、相关 DECISIONS.md 和未解决的审核意见。
核对远程版本、已接受基线和当前候选进度，再完成下一小步。
同步更新文件与 STATE，commit、push 并确认远程 head。
只更新本 PR 的工作分支，不合并 PR、不写正式分支、不 force-push。
```

`resume` 继续原工作分支；`restart` 从任务正式分支新建工作分支。普通换会话不新建 PR。每个有效步骤同步保存产物和 STATE，确认远程提交后才算保存成功；未完成或失败状态也可保存。首次推送后建立 Draft PR。

三个交接文件：`TASK.md` 写目标/约束/验收，`STATE.md` 写候选进度/验证/下一步，`DECISIONS.md` 写关键理由和证据。工作分支中的结论仍未经人工审核。

`arena/protocol` 检查分支归属、交接文件和规则变更范围；代码、调研和文档仍需各自的证据与人工审核。`Kibiandkimi` 是唯一必需 CODEOWNER，新增修改撤销旧批准。

仓库保留在 `SUSTechHSAS` 名下。规则没有所有者 bypass；所有者仍有修改设置的管理能力，agent 不得操作这些设置。

见 [操作说明](docs/OPERATIONS.md) 和 [任务模板](.templates/task/.context)。
