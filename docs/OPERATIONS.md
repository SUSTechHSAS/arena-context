# 使用与维护

## 账户和审核

Arena 使用 `SUSTechHSAS`；人工负责人/审核者是 `Kibiandkimi`，在仓库中具有协作者写权限。仓库保留原地址，不依赖 Arena 发现协作仓库。初始化及权限配置由用户授权，日常任务 agent 不得改变设置。

正式分支要求 PR、至少一项批准、CODEOWNER 批准、解决审核讨论、`arena/protocol` 成功，禁止 force-push 和删除，无 bypass。`work/**` 禁止 force-push，保留人工清理能力。

这要求普通合并路径先获得人工批准；不移除仓库所有者修改规则的能力，也不单独阻止 agent 在已批准后点击合并。AGENTS.md 明确要求由你执行最终合并。PR 应由 `SUSTechHSAS` 创建，避免人工账户成为无法自批的 PR 作者。

## 新任务

创建任务 Issue 后，以 `Kibiandkimi` 在 main 运行 `New task`。它把 Issue 正文保存为任务约定，从触发时 main 的 SHA 初始化一个新任务分支，不修改已有任务，不自动发 Issue 评论。Issue 须由两个指定账户之一创建。

任务完成后，你在 Issue 记录最终产物和正式提交，并关闭 Issue。不要依赖 `Closes #N`：PR 通常不是合入默认分支，且完成一个 PR 未必代表完成整个任务。

## 检查点和恢复

完成一小步 → 更新文件和 STATE → commit → push → 核对远程 head。正常一轮结束前和长操作开始前也要保存。需要 UI 点击 push 时必须如实说明。Actions 无法找回死亡沙箱中未推送的内容。

STATE 保持简短，详细证据另存文件。当前 checkpoint SHA 从远程 ref 读取，避免把文件所在提交的 SHA 写进自身。验证记录真实命令、结果、时间及之后是否又改动受测文件。

| 场景 | 处理 |
| --- | --- |
| 会话失效 | 继续同一个分支/PR 的最后远程检查点 |
| 已推送但没有 PR | 从已存在的工作分支补建 PR |
| 多个候选 PR | 指定一个，不自动混合 |
| 原会话可能仍在写 | 先交接，不能确认则另建后继分支 |
| 远程 head 前进 | fetch 后检查，禁止 force-push |
| PR 已合并 | 从最新正式分支创建新工作分支 |
| 审核要求修改 | 原工作分支继续修订 |
| 方案被拒 | 从正式分支重做，有价值证据另行提案 |
| base 前进 | 更新工作分支，重新验证受影响内容 |

同任务默认一个活跃工作单元，不同任务可并行。分支隔离文件与历史，不隔离同仓库访问。

## 自动检查

`Protocol` 使用 `pull_request_target`，只检出受信任的 base SHA，再从 API 读取候选文件作为数据；不会执行 PR head 的脚本或安装其依赖。检查把 `arena/protocol` 状态明确写到 PR head SHA。

普通任务 PR 要求：同仓库 work 分支的任务号匹配 base 的 TASK.md；三个交接文件存在；候选 TASK.md 不改变任务身份；STATE 写明任务号、工作分支、必要交接段落，且本 PR 的 diff 包含其更新。

`AGENTS.md`、`.github/**`、`.templates/**` 的修改必须使用 meta 分支提案。main 接受 `meta/<名称>`，任务分支接受 `meta/<任务号>/<名称>`。维护 PR 由原 base 版本检查，仍需人工审核。新任务继承当时的协议版本，旧任务通过独立 meta PR 更新。

PR base 改动、推送、重新打开等事件触发检查；分支过滤针对 base。超过 GitHub 文件列表 API 3,000 文件限制的 PR 需拆分。Actions 固定完整提交 SHA。检查不证明代码正确或调研事实真实；实际项目测试可另加只读权限的 `pull_request` 工作流，不在这个具备状态写权限的工作流中执行候选代码。

## 环境和已有资料

环境依赖、浏览器状态和下载缓存不会随 Git 自动恢复。需要时填写 ENVIRONMENT.md 和 RESOURCES.md，重要产物不能只保留临时 sandbox URL 或过期会被清除的 Actions artifact。

`AerraGen-main` 使用同样保护，工作分支仍按 TASK.md 的 Issue 编号命名。用户提供的 TerraGen7 文档保存为该任务的参考快照；快照中的旧模型分工、本地路径和 Git 工作流不覆盖本仓库协议，旧状态也不是当前完成证明。
