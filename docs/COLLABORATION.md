# 主模型与子模型跨会话协作

目标是让随机到子模型的 Arena session 完成有限、可验证的工作，把稀缺主模型轮次用于拆分、关键决策、整合和复核。分工由每轮指纹结果决定，保存在 Git 中；本仓库不控制 Arena 的随机模型分配，也不假设存在自动切换模型或启动其他 session 的接口。

## 模型与权限

中央策略在受保护 main 的 `.github/fingerprint-policy.json`，schema 2 分为两张互不重叠的精确名单：

| 角色 | 中央 ID |
| --- | --- |
| 主模型 | `claude-opus-5-5`、`claude-sonnet-5-5`、`claude-fable-5-1`、`gpt-6-astra`、`gpt-6.1-sol`、`gpt-6-sol` |
| 子模型 | `claude-haiku-5-5`、`claude-opus-5`、`claude-fable-5`、`gpt-5.6-sol`、`gpt-6-luna` |

仍使用同轮三条原样回答和完整 95% 库内候选集合。全部是主模型时，返回 `CONTINUE / primary`；集合包含子模型、且每个成员都在上述两张名单内时，返回 `CONTINUE_SUBTASK / secondary`。**只要出现任何名单外成员就返回 END_TURN，退出码 20**。名称相近、同属一个家族、排在第一名或被其他模型委派，都不能让名单外模型工作。详见 [指纹规则](FINGERPRINT.md)。

子模型权限包括领取已发布工作包、在其范围内实现或收集证据、运行适当验证、保存候选检查点。目标变更、架构取舍、工作包发布、扩大范围、整合决策和结果复核由主模型处理。主模型复核也不等于人的 GitHub approval；`Kibiandkimi` 仍审核并决定最终合并。

## 一轮主模型拆分，多轮子模型执行

先按 AGENTS.md 核对任务、真实工作分支和已接受版本，再执行本轮指纹。通过后把 Fingerprint 和 Model role 写入 STATE。以下命令都在实际 `work/...` 或 `arena/...` 分支执行。

主模型把 [工作包模板](../.templates/collaboration/packet.json) 复制到仓库外，例如 `/tmp/packet.json`，填写：

- `id`：本任务中未用过的标识；小写字母、数字、连字符，最多 64 字符。
- `title`、`objective`：一个可审核的结果，以及对应的任务验收项。
- `allowed_paths`：精确文件名或以 `/` 结尾的目录前缀。没有通配符、绝对路径或 `..`。目录前缀也不会放开其中的协议文件。
- `acceptance`、`verification`：可观察的完成标准，以及必要的测试、来源核对或人工检查要求。命令只是待判断的验证说明，脚本不会自动执行它。
- `depends_on`：必须先经主模型复核的其他包 ID；独立包写 `[]`。尽量提前拆成独立的小包。

```sh
node .github/scripts/collaboration.mjs create /tmp/packet.json
```

脚本自动绑定任务号、正式分支和当前主模型指纹，写入 `.context/collaboration/packets/<id>.json`。主模型可重复此步骤准备多个包，再同步 STATE、commit、push 并确认远程 head。**已推送的主模型候选检查点即可作为派发来源，不要求先合并计划 PR。** 工作包一经提交不再修改；需要改变目标或范围时，发布新 ID 的包并在交接中说明替代关系。

为子模型 session 选择包含该检查点的分支。Arena 自动生成 `arena/...` 时保留真实分支名，PR 仍指向 TASK 中的正式分支。不同包各用一个工作分支和 PR；同一个包的后续 session 继续原分支，或按既有规则建立保留前驱关系的后继分支。每条分支只允许一个活跃写入者。

子模型通过本轮指纹后执行：

```sh
node .github/scripts/collaboration.mjs status
node .github/scripts/collaboration.mjs claim <packet-id>
```

`claim` 核对已提交的包、原始发布提交、主模型指纹和依赖，建立本轮不可改写的 `runs/<turn_id>/run.json`，并创建 `result.md`。首次领取时冻结起始工作区；接力轮次复用同一工作包和起点。起点须是主模型检查点或已接受的任务版本。不要把另一个未完成工作包的候选历史混入此 PR。

STATE 写明 Work packet。子模型只能修改包允许的任务文件、本轮 result、指纹及 STATE；不能修改 TASK、DECISIONS、AGENTS、`.github`、`.templates`、协议说明、工作包或他人的记录。在 result 中填写实际改动、验证、证据与未解决问题。遇到范围外问题时记录给主模型，不自行扩大任务。

完成一小步就按既有规则 commit、push、确认远程 head。可跨多轮接力；每轮重新采样并重新 `claim`，每轮有自己的 result。完成时 STATE 设 `awaiting-primary-review`，PR 保持 Draft。缺少主模型复核时 `arena/protocol` 失败是预期的待复核状态，不影响保存检查点。

如果没有可领取的包，或依赖尚未复核，子模型只保存本轮指纹和说明阻塞的 STATE，使用 `awaiting-primary-assignment`。不要临时发明子任务。名单外模型的 END_TURN 则仍须立即结束，不能运行这些额外命令或推送拒绝记录。

## 主模型复核当前产物

后续主模型轮次先重新通过指纹，再读取包、各轮 result、真实 diff 和未解决的人类审核意见。检查范围与验收，运行必要验证；不得只转述子模型的“已通过”。有问题可以在原范围内修正，或要求新的工作包。

先提交所有产物和 result 改动；当前指纹与 STATE 可暂未提交。把 [复核模板](../.templates/collaboration/review.json) 放到仓库外，填写真实 `summary`、`verification`，并将 `verdict` 明确设为 `approved` 或 `changes_requested`，然后运行：

```sh
node .github/scripts/collaboration.mjs review <packet-id> /tmp/review.json
```

脚本生成 `reviews/<turn_id>-<packet-id>.json`，记录实际检查的 HEAD、原始工作包提交、当前主模型指纹，以及允许路径和各轮 result/run 的 Git 内容摘要。更新 STATE 的 Primary review 和 Candidate stage，再 commit、push。每轮每个包只发布一份复核；不要抢先发布批准后再修改产物。

只有批准当前产物的主模型复核和协议检查通过后，主模型才能把 PR 标为待人工审核。新代码、删除、文件模式变化、后续子模型轮次或 result 改动都使旧复核失效。新指纹和 STATE 等交接元数据本身不会令产物复核失效。更新的复核必须检查包含前一复核的提交；不能用旧批准盖过新的修改要求。已复核完成的包不由子模型重开，后续工作用新包。

最终由 `Kibiandkimi` 审核合并到任务正式分支。存在依赖的后续包通常从包含已接受前序产物的任务版本开始；独立包可以分别推进。

## 检查做了什么

`arena/protocol` 从受信任的代码版本读取候选文件作为数据，并检查：

- 以 main 当前名单重新评分，按 manifest 中的原始名单重算角色；历史拒绝不能变为允许，历史子模型不能借后续名单升级成为发布者或复核者。
- 新指纹、工作包、运行记录和复核只追加；检查本 PR 的所有新子模型轮次，不只相信最后 STATE 中的角色。
- 工作包来自不可改写的原始主模型提交，任务归属正确，起点可追溯，依赖已复核；每个子模型 PR 一个包。
- 从工作包起点到当前候选的改动在允许范围内，包括重命名的旧路径。已与当前正式版本一致的上游变化不当作新候选工作。
- 复核来自主模型、绑定真实可达提交，并与当前产物和运行证据的 Git 摘要相符。缺失、过期、并发未统一或要求修改的复核均不通过。

GitHub 比较接口最多返回 300 个文件，本流程遇到该上限会要求拆小工作单元；树响应截断也拒绝。只读测试工作流单独验证实现，具有状态写权限的工作流不执行 PR 里的候选代码。

这些是仓库的工作规则与可复核证据，不是进程隔离或后端身份认证。它们不能保证模型从未在未提交的工作区越界，也不能替代对原始证据、代码质量和任务成果的人类审核。

## 更新已有任务

通用变更用 `meta/model-collaboration` → `main`；已有任务分别用 `meta/<任务号>/model-collaboration` → 各自正式分支，不合并任务历史。现有任务上下文、成果和既有指纹不重写。

建议先合并已有任务的兼容代码更新，再合并 main 的双层名单。新代码可读取旧 schema 1 名单，过渡期间仍仅放行原主模型；先启用 schema 2 名单而不更新旧脚本，会让旧脚本因无法解析政策而安全拒绝。

main 更新后，新任务自动继承本机制。已有候选工作分支也须先继承已接受的任务协议更新，后续 session 才能使用新命令；不要在一次被 END_TURN 拒绝的轮次里自行修改脚本绕过门控。已有历史豁免只保护原检查点，不能授权新子模型工作。
