# Task contract

- Task Issue: https://github.com/SUSTechHSAS/arena-context/issues/1
- Title: [Task] AerraGen — 三维环面星球的过程地形生成（Rust）
- Kind: mixed
- Accepted branch: AerraGen-main
- Human task owner and reviewer: Kibiandkimi
- Arena submission account: SUSTechHSAS
- Protocol version: 7a9cf6793f8f2dcd6da11d07e7b274e01a6dcd40

## Goal, scope, acceptance, and inputs

Brief copied from the Issue at initialization. Read subsequent explicit owner instructions. Missing requirements do not authorize inventing a goal.

## 用户目标（原文）

我希望通过模拟真实的地理过程生成地形。我希望尽量真实地模拟以达到地形较噪声更接近真实的效果，但同时保持较为可接受的计算量（可以非实时计算）。我希望模拟地形产生的全过程。气候、生态等模拟也请一并考虑。考虑二维环面世界而非球面以便转化为平面并减少拉伸，同时模拟环面的自转、公转产生的光照及季节等变化极其带来的影响。模拟使用三维环面物理而不应直接套用球体物理。以1m^3为最后地形生成的最小单位。环形星球大小类似真实星球大小并可配置相关参数。可以按需生成世界以避免过大的计算和存储需求。使用rust。请先生成计划再按计划执行，此计划应明确实现细节并给出明确具体且有效可验证的验收指标。

## 首个工作单元

先审查并完善可执行计划，形成具有明确实现细节、测量方法和具体阈值的验收清单，再按经人工审核的计划实施。当前尚未完成计划审查或 Rust 实现。

## 输入资料与优先级

用户指定的 TerraGen7 文档将原样保存在 AerraGen-main 的 reference/terragen7/docs/；这是参考快照，不代表其中的默认值、旧任务状态或推导已获验证。其旧模型分工、本地 Git 工作流不覆盖 arena-context 的 AGENTS.md 和人工审核规则。

特别需要审查：严格 1 m³ 最小单元与参考计划中横向拉伸体素之间的差异；三维环面的物理可行性与近似；参考机器预算是否适用于实际环境；可验证的真实性与性能指标。不要默默放宽用户要求。

## 延后任务

用户另给了 Base64 内容，原样保存为 .context/DEFERRED_TASK.txt。当前任务完成并由 Kibiandkimi 最终验收收尾之前，严禁解码或执行。原始完整要求保存为 .context/OWNER_REQUEST.md。本次配置未解码。

## 工作入口

- Accepted branch: AerraGen-main
- 任务约定：.context/TASK.md
- 最新候选工作：查询 base 为 AerraGen-main 的开放 PR。
- 人工审核者：Kibiandkimi；Arena 提交者：SUSTechHSAS。


## Contract changes

Propose changes for human review. Task Issue and accepted branch identities remain fixed.

## Source precedence and first deliverable

The explicit owner request in .context/OWNER_REQUEST.md has priority over reference defaults. Reference documents live under reference/terragen7/docs/. Their historical workflow, model assignments, machine measurements, and READY/PENDING statuses do not establish current permissions or completion. Use this repository's AGENTS.md and GitHub review rules.

First deliverable: a reviewable implementation plan with concrete algorithms, data structures, physical assumptions, computation/storage estimates, dependency order, measurement procedures, and quantitative acceptance thresholds. Audit the supplied plan before implementation. Surface required relaxations for human decision; do not silently accept stretched voxel volume as exactly 1 m³.

Do not decode or execute .context/DEFERRED_TASK.txt until this whole terrain-generation task is finished and Kibiandkimi has accepted final closure. Preserving the opaque payload is not authorization to decode it.
