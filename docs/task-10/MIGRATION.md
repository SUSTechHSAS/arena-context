# PR #19 协作机制迁移与接续入口

2026-10-09，按任务所有者要求迁移 [PR #19](https://github.com/SUSTechHSAS/arena-context/pull/19) 的部分成果。正式任务仍是 [#10](https://github.com/SUSTechHSAS/arena-context/issues/10) 的完整现代框架重写与行为一致性验证。

后续同日扩充已将包池从 4 个增加到 **114 个**，实际核验为 73 个可领取、41 个等待前置复核；当前接续入口与完整目录见 [packet-pool/README.md](packet-pool/README.md)。下文保留初次迁移和原有四包的历史证据。扩充轮另补了 ItemCore 继承接口的类型兼容声明，当前验证以包池记录为准。

## 迁移来源和边界

| 项目 | 已核对版本 |
| --- | --- |
| 本次正式基线 | `task/10/main@45f8811ce9c7ec910ff6346d7c6b489fb1cf8f5e` |
| 继承的 PR #19 候选成果 | `ee84f0e05f38df931f769511cc99c54d9dbde6c0` |
| 协议接入检查点 | `a66127756132e0e9852bc6021519a0bbd828e075` |
| 工作包发布检查点 | `04c2f6dcfd2e4b7436f3bfdd82e5df1ae8938377`，已推送并核对远程 |
| 实际工作分支 | `arena/db5ddb58-arena-context` |
| PR 目标分支 | `task/10/main` |
| 原始程序快照 | `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`，8 个根目录文件 |

旧候选使用单层准入协议，无法承接 main 的 schema-2 主/子模型策略。将已经合并的任务协议（包括 #22 和 #25）合入原工作分支，保留 PR、历史提交和成果。唯一的文本冲突在 STATE，现已恢复实际任务进度及新角色字段；DECISIONS 同时保留候选设计和已接受的机制决策。

已按 Git 内容核对：AGENTS、`.github/`、`.templates/`、共享说明和 TASK 与上述正式基线逐字节一致；`app/`、`reference/`、原有 `scripts/`、`tests/` 与继承的候选逐字节一致。旧指纹原样保留。#14/#15 的独立实现，以及 #26 的等待交接，均未成为本 PR 的祖先。

本轮 [指纹报告](../../.context/fingerprints/20261009T045933Z-88646267/report.json) 为 `reference_ambiguity`，完整参考集合包含 `gpt-6-astra`、`gpt-6.1-sol`，门控返回 `CONTINUE / primary`。原始三数组、manifest、report 和 bank/detector 快照均已保存。这是本轮统计证据；后续轮次重新指纹，角色不继承。

## 本次实际验证

验证运行于协议接入提交 `a661277`；后续迁移修改限于任务文档、交接、工作包及验证记录。原应用及协议代码保持该已测试版本。

| 命令 / 检查 | 实际结果 |
| --- | --- |
| 根目录 `node --test .github/scripts/*.test.*` | 72 通过，0 失败、跳过或取消 |
| app 内 `npm ci --ignore-scripts` | 成功，使用现有锁文件 |
| app 内 `npm run check` | 8 个原始文件哈希、5 项完整性测试、严格类型检查、110 项领域测试和生产构建通过 |
| app 内 `npm run test:e2e` | 4 项真实 Chromium 测试通过，包括 16 张画布图像与原 viewer 完全一致 |
| 共享协议 / 原成果内容比较 | 通过；应用、原始源码和已有测试无改动 |
| 接入提交的远程 `arena/protocol` | [通过](https://github.com/SUSTechHSAS/arena-context/actions/runs/37887020986) |
| 工作包来源与可用状态 | `collaboration.mjs status` 核验 4 个包均来自普通提交 `04c2f6d`，全部 `available` |
| 工作包发布提交的远程 `arena/protocol` | [通过](https://github.com/SUSTechHSAS/arena-context/actions/runs/37888625642) |

环境为 Linux x64、Node `v24.16.0`、npm `12.0.2`，浏览器由现有 npm 依赖及 Playwright 配置提供。命令原始输出和 SHA-256 清单位于 [migration-2026-10-09/verification.json](migration-2026-10-09/verification.json)。这些结果支持已继承的 viewer 和隔离领域契约；完整游戏、真实实体集成、存档互载及服务集成仍未完成。

## 四个独立工作包

以下包均通过 `collaboration.mjs create` 生成，绑定本轮主模型指纹，`depends_on` 均为 `[]`。它们共享已验证的 PR #19 基础，允许写入的任务路径两两不重叠；STATE 和每轮证据按协议处理。在发布提交 `04c2f6d` 上，`collaboration.mjs status` 已核对来源及依赖，四个包均为 `available`；[原始输出](migration-2026-10-09/packet-status.json)与校验值一并保存。后续 session 领取前仍需检查当时的状态。

| 包 | 有界交付 | 定义 |
| --- | --- | --- |
| `t10-source-ast-inventory` | 三个原页面的可复现 AST 清单及检查脚本，补齐 U00 的词法清单缺口 | [packet](../../.context/collaboration/packets/t10-source-ast-inventory.json) |
| `t10-accessory-contracts` | 饰品基类与 7 个直接子类的隔离移植、原版差分测试 | [packet](../../.context/collaboration/packets/t10-accessory-contracts.json) |
| `t10-potion-base-contracts` | 药水基类全部生命周期、显式外部依赖和差分测试 | [packet](../../.context/collaboration/packets/t10-potion-base-contracts.json) |
| `t10-weapon-contract-audit` | 武器类全部 11 个成员的源码审计、原版契约测试及依赖交接 | [packet](../../.context/collaboration/packets/t10-weapon-contract-audit.json) |

饰品与药水沿用已有 ItemCore/ArmorItem 的显式依赖方式；实际宠物、怪物和状态集成留给后续工作。武器包先产出完整契约和测试证据，由后续主模型决定复杂攻击、附魔、连锁和实体接口的实现边界。AST 包只解析原始程序，补足覆盖依据。这四个包是下一批工作，不代表剩余完整任务已全部拆完。

## 启动后续 Arena session

1. 选择包含这些工作包的最新 `arena/db5ddb58-arena-context` 主模型检查点作为来源。PR #26 是较早的等待检查点，不含 PR #19 的基础代码和本次工作包；接续入口使用本 PR 的新检查点。
2. 让每个包使用独立工作分支/PR；Arena 生成 `arena/<opaque-name>` 时保留真实名称，并在 STATE 填写该分支。PR base 始终来自 TASK：`task/10/main`。同一分支只保留一个写入者。
3. 按 AGENTS 执行本轮 `fingerprint.mjs prepare`、亲自回答并保存三条探针，再 `score <turn-id>`。`END_TURN` 立即结束；`CONTINUE_SUBTASK / secondary` 才进入领取流程。主模型可规划、直接工作和复核。
4. 子模型把当前 Fingerprint 和 Model role 写入 STATE，然后先运行 `node .github/scripts/collaboration.mjs status`，再运行 `node .github/scripts/collaboration.mjs claim <packet-id>`。优先按明确指派领取；未指定时可选同任务的一个可用独立包。
5. 仅修改该包的 `allowed_paths`、本轮证据和 STATE，按定义运行验证。每个小检查点更新 `runs/<turn-id>/result.md`，commit、push 并核对远程。完成后标记 `awaiting-primary-review`，保留 Draft。

工作包的主模型候选检查点即可作为委派来源，后续子模型无需等待本 PR 合并。其全部继承成果仍是候选，最终由 Kibiandkimi 审核。PR #19 用作基础与派发入口；不同子包的候选输出在各自 PR 中保存。

## 主模型与人工接续

后续主模型重新指纹，检查具体子包的实际输出、每轮 result 和 owner 意见，重跑有意义的验证。先提交产物，再使用 `collaboration.mjs review <packet-id> <review.json>` 记录绑定当前产物的复核。当前 PR 没有子模型运行结果，故无此类复核记录。

通过主模型复核且协议检查成功的子包，才可交付人工审核。Kibiandkimi 决定最终合并。新的输出或运行证据使旧复核失效，后续包从合适的正式版本或主模型检查点接续。命令格式及约束以 [COLLABORATION.md](../COLLABORATION.md) 为准。

完整任务及待审行为差异继续以 [PLAN.md](PLAN.md)、[FEATURE-MATRIX.md](FEATURE-MATRIX.md)、[DEVIATIONS.md](DEVIATIONS.md) 为准。PR #19 保持 Draft，便于继续保存部分成果。
