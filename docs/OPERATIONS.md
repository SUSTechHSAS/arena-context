# 使用与维护

## 账户和审核

Arena 使用 `SUSTechHSAS`；人工负责人/审核者是 `Kibiandkimi`，在仓库中具有协作者写权限。仓库保留原地址，不依赖 Arena 发现协作仓库。初始化及权限配置由用户授权，日常任务 agent 不得改变设置。

正式分支要求 PR、至少一项批准、CODEOWNER 批准、解决审核讨论、`arena/protocol` 成功，禁止 force-push 和删除，无 bypass。`work/**`、`arena/**` 和 `meta/**` 禁止 force-push，保留人工清理能力。

这要求普通合并路径先获得人工批准；不移除仓库所有者修改规则的能力，也不单独阻止 agent 在已批准后点击合并。AGENTS.md 明确要求由你执行最终合并。PR 应由 `SUSTechHSAS` 创建，避免人工账户成为无法自批的 PR 作者。

每轮 Arena 任务使用 lm.ikale.io 的 Fingerpoint 检测器，要求同轮三条回答。覆盖至少 95% 库内校准分数的完整 `reference_models` 集合必须全部在 main 的 `.github/fingerprint-policy.json` 的主模型或子模型名单内；95% 是仓库工作规则，不是身份准确率。上游合并的 Astra/6.1 Sol 类别必须同时检查两个 ID。原六个模型为主模型，新增 Haiku 5.5、Opus 5、Fable 5、GPT-5.6 Sol、GPT-6 Luna 为子模型；其余全部拒绝。混合候选按子模型权限处理，存在名单外候选或证据缺失仍拒绝。score 即时给出 END_TURN/退出码 20 时，agent 只输出原因并结束；不重测，也不再运行 checkpoint 工具。名单或门控逻辑修改采用单独维护 PR，合入 main 后自动重检开放任务 PR。`meta/...` 上由用户要求的仓库维护不执行 Arena 任务采样门控；旧 WhatsMyLLM 记录保留原算法复算。详见 [指纹规则](FINGERPRINT.md)。

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

主模型可以预先发布多个有限工作包；每个子模型 PR 只承载一个包，每个分支仍只允许一个活跃写入者。候选包经主模型检查点发布即可领取，无需先由人工合并计划。完成后先由主模型复核当前产物，再由人工审核合并。跨包依赖须已通过主模型复核；独立包可以使用不同工作分支。分支隔离文件与历史，不隔离同仓库访问。详细命令、边界和回接方式见 [协作说明](COLLABORATION.md)。

## 自动检查

`Protocol` 使用 `pull_request_target`，只检出受信任的 base SHA，再从 API 读取候选文件作为数据；不会执行 PR head 的脚本或安装其依赖。检查把 `arena/protocol` 状态明确写到 PR head SHA。

普通任务 PR 要求：同仓库 work 分支任务号匹配 base 的 TASK.md，或使用 Arena 自动生成的 arena 分支并从 TASK.md 绑定任务；三个交接文件存在；候选 TASK.md 不改变任务身份；STATE 写明任务号、真实工作分支、必要交接段落，且本 PR 的 diff 包含其更新。有指纹报告时，检查样本哈希并重新计算关键评分字段。新增的子模型记录还必须绑定主模型发布的不可改写工作包；CI 检查允许修改的路径、依赖和主模型复核的产物摘要。只有最后一份 STATE 写成主模型并不能隐藏本 PR 早前的子模型贡献。未完成或尚未复核的子模型检查点可以推送，但 PR 保持 Draft、协议状态失败。

`AGENTS.md`、`.github/**`、`.templates/**` 的修改必须使用 meta 分支提案。main 接受 `meta/<名称>`，任务分支接受 `meta/<任务号>/<名称>`。维护 PR 由原 base 版本检查，仍需人工审核。新任务继承当时的协议版本，旧任务通过独立 meta PR 更新。

PR base 改动、推送、重新打开等事件触发检查；分支过滤针对 base。超过 GitHub 文件列表 API 3,000 文件限制的 PR 需拆分。Actions 固定完整提交 SHA。检查不证明代码正确或调研事实真实；实际项目测试可另加只读权限的 `pull_request` 工作流，不在这个具备状态写权限的工作流中执行候选代码。

## Arena 自动分支与自动 PR

Arena 可能从你选择的分支创建新的 arena/<opaque-name>。不要重命名它或假定新提交仍属于旧 PR。TASK.md 是任务归属依据，STATE 的 Work branch / PR 必须记录真实 head。新会话如果产生新分支，建立指向同一个正式任务分支的后继 PR。

agent 负责 commit、push；本仓库的服务端自动化只能处理已经推送的文件。`Checkpoint` 是无权限的推送通知工作流；完成后由默认分支上的 `Ensure task PR` 读取工作分支数据，核对受保护任务约定，再创建或复用 Draft PR。它只检出 main，不执行工作分支代码，也不下载工作流 artifact。没有文件差异就不创建 PR。

如果旧分支尚未带上 Checkpoint 工作流，可在 main 手动运行 Ensure task PR 并填分支名。用 GITHUB_TOKEN 创建 PR 不会自动触发普通 PR 事件，因此自动化会显式运行协议检查并把状态写到实际 head SHA。

GitHub 将“允许 Actions 创建和批准 PR”合为一个仓库开关，自动建 PR 需要启用它；此处没有任何自动批准操作，机器人也不是 CODEOWNER，必需的 Kibiandkimi 审核不变。候选代码不运行在有 PR 写权限的自动化环境中。

## 环境和已有资料

环境依赖、浏览器状态和下载缓存不会随 Git 自动恢复。需要时填写 ENVIRONMENT.md 和 RESOURCES.md，重要产物不能只保留临时 sandbox URL 或过期会被清除的 Actions artifact。

`AerraGen-main` 使用同样保护，工作分支仍按 TASK.md 的 Issue 编号命名。用户提供的 TerraGen7 文档保存为该任务的参考快照；快照中的旧模型分工、本地路径和 Git 工作流不覆盖本仓库协议，旧状态也不是当前完成证明。

`Protocol tests` 在独立、只有 contents:read 权限的 `pull_request` 工作流中运行 Node 测试；候选脚本不会进入具有状态写权限的 Protocol 工作流执行。
