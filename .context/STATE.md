# Current handoff

- Task: #1
- Unit: plan-review
- Work branch / PR: work/1/plan-review
- Accepted base at unit start: dbff749aa10312629a68be9be66bb17af530e265
- Updated: 2026-10-07T08:35:00.000Z
- Latest session: 2nd Arena relay session (checkpoint on branch `arena/acd9bfef-arena-context`)
- Candidate stage: working

This card does not establish approval; check the actual task branch and PR.

## Current objective

完成首个工作单元 plan-review：审查参考计划、细化实现细节与可验证验收指标，形成可供 Kibiandkimi 审核的完整计划包（仍不写任何 Rust 实现）。

## Candidate progress

- 第 1 轮（前一会话）：`docs/plan/00-audit.md`（F1–F12、V1–V15）、`01-implementation-plan.md`、`02-acceptance-matrix.md`、`03-open-decisions.md`（D1–D7）。
- 第 2 轮（本会话）：独立复核并细化——新增 `docs/plan/04-refinement-log.md` 与可复现脚本 `docs/plan/analysis/verify_plan_numbers.py`（+ `verify_output.txt`）。
  - 复核：参考快照 24/24 SHA256 通过；V1–V15 中 13 项确认、**V13 更正（Q 少算一半，E = 1.02 mm/yr）**、**V2 更正（2πGρr 只是圆柱近似，R/r=4 真实外赤道 g ≈ 3.36 m/s²，−19%）**。
  - 新证据：earth T_rot = 4.334 h、Ω² = 1.622e-7 s⁻²、(C−A)/C = 0.4851、进动 ≈ 3.0 kyr；earth-g 真实 g ≈ 7.95（非 9.8，D2 已列二选一）；薄环 R/r=20 圆柱偏差 −2.2%（NX-06b 阈值 15% 安全）。
  - 验收矩阵修订：AC-1 改写 + 新增 AC-1b（导出重采样 C′：V 精确 1 m³、相位对齐、max_offset ≤ 0.63 m）；AC-2 重力判据改写；NX-06 → a/b/c；NX-18 具体化；NX-20 → a–e；新增 NX-29/30、RS-17（过程 vs 噪声对照，直接对应“地形较噪声更接近真实”）、PF-09/10、QE-07/08/09、§02.G 证据留存政策。
  - 计划细化：`01 §1.4.0` 派生网格表与 `Δσ = x/round(x)` 证明（严格 1 m 在规则嵌套网格上不可达）；G1 扩为 6 条（含质量记账守恒）；§5 存储预算实数（α ≈ 1.927 GB；β ≈ 1.499 GB，余量 +0.001 GB）。
  - **新增 D8（阻塞级）**：本沙箱无 Rust 工具链（cargo/rustc 不存在），且 static.rust-lang.org / crates.io / index.crates.io 不可达（仅 github.com 可达）⇒ M0 起的 cargo 类验收无法在此环境产生证据，建议户主先提供环境。

## Verification

- 本会话实际运行：`python3 docs/plan/analysis/verify_plan_numbers.py`（stdout 保存为 `verify_output.txt`）；参考快照 SHA256 24/24 校验；`git ls-remote` 核对远程 head；协议校验器 `.github/scripts/protocol.cjs` 由 CI 在 PR 事件上运行（不在沙箱内伪造结论）。
- 未运行（诚实标注）：任何 `cargo` 命令（无工具链，D8）、SCF 实际解、GCM、性能实测、真实性统计——均属实现阶段，D8 解决前不得声称已通过。

## Blockers and unresolved owner feedback

- **D8（阻塞 M0）**：实现环境缺 Rust 工具链与 crates.io 访问。
- D1（推荐 C′：内部名义 1 m + 导出双向重采样到严格 1 m³）、D2（earth 默认；earth-g 需选 (i) r≈5.24e6 m 或 (ii) ρ≈6777 kg/m³）、D3–D7 待 Kibiandkimi 决策。
- 分支接力限制：本会话按规则只能推送 `arena/acd9bfef-arena-context`；PR #2 的 head `work/1/plan-review` 需快进同步后才能显示 `docs/plan/` 内容（无需 force-push）。
- 待办：`docs/plan/03` 的决策若获批准，需在 M0 前把 D8 解决方式写入 ENVIRONMENT.md。

## Next action

请 Kibiandkimi 审核 `docs/plan/00–04` + `analysis/verify_output.txt`，优先决策 **D1 / D2 / D8**；计划获批后第一小步是：把参考快照校验、派生网格公式（NX-30）与工作区骨架作为 M0 的第一批测试，并且在环境（D8）就绪后再跑 `cargo`。不得在最终验收前解码 `.context/DEFERRED_TASK.txt`。
