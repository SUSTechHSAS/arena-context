# PR #27 质量审查：以 72d974b / 3fe57cf 为分界

- 审查对象：https://github.com/SUSTechHSAS/arena-context/pull/27 ，head `2edc1f0e1286b795b970ad6f73fa6ed48f6ad892`（`arena/e4cc53a2-arena-context`，Draft）
- 审查轮次：`.context/fingerprints/20261010T144904Z-21140f28/report.json`（`CONTINUE / primary`；仅为统计证据，不是身份认证）
- 审查分支：`arena/5d1da57f-arena-context`（基于 `task/10/main@682ad9d`，PR #19 已合并）
- 性质：模型审查意见。不是 GitHub approval，也不是 owner 验收；由 Kibiandkimi 决定。

## 分段

PR #27 在 PR #19（`9539c29`）之后新增了 69 个提交（`a5e53d4..2edc1f0`）。提交信息的风格可以分成四段：

| 段 | 提交 | 时间 (UTC 10-10) | 信息风格 | 内容 |
|---|---|---|---|---|
| A | `a5e53d4..3d15539` | 05:31–07:31 | `feat(task-10): …` | 单元 1–24 |
| B | `35bfcf9..d38cee8` | 07:41–10:12 | `Task 10: …` | 单元 25–43 |
| C | `72d974b..22dc1eb` | 10:24–10:58 | `task-10 unit NN: …` | 单元 44（上游修复）、45–48 |
| D | `3fe57cf..2edc1f0` | 11:01–12:06 | `Unit NN: …` / `STATE:` / `DEVIATIONS:` | 单元 49–58b |

PR 中只记录了三个指纹：05:29、07:05、10:10，结果都是 `claude-opus-5-5`、`CONTINUE / primary`。C 段和 D 段都只能对应 10:10 这一轮。

## 结论

**C 段和 D 段的工程质量没有出现可测量的下降，与此前提交基本一致。** 下降主要体现在提交信息格式和流程记录，不在代码或测试强度。依据如下。

### 1. 实际复跑

在 PR head `2edc1f0` 运行 `npm ci --ignore-scripts && npm run check`（Node 22.22.3）：8 个参考哈希和 5 个完整性测试通过，严格类型检查通过，**68 个测试文件 / 320 个测试全部通过**，build 成功。日志摘要见 `pr27-mutation-probe/full-check-2edc1f0.txt`。

PR 描述和 STATE 中最后一次完整检查停在 `2a592e7`（66 / 317），之后的 `bd69907`、`d113ae5`、`1258b1a`、`2edc1f0` 之前没有被完整检查覆盖。本次复跑补上了这一缺口。

### 2. 独立变异探针（审查者自己设计，不是复用 PR 的变异记录）

探针脚本和结果见 `pr27-mutation-probe/`。每个变异都是一次精确匹配的文本替换，替换后只运行对应的测试文件，运行结束后还原源码。

| 段 | 变异数 | 被杀 | 存活 |
|---|---|---|---|
| B（基线：victory、equipment-page） | 4 | 3 | 1：equipment-page 去掉内层 `Math.max(0, …)`。这正是 VERIFICATION 单元 39 记录过的等价变异 |
| C（SRC-30/11/03 回退、fusion-check、tutorial-nav、wrench） | 8 | 7 | 1：fusion-check `totalGold > 0` → `>= 0`。在源码固定 4 槽融合区时等价；只有 5 槽（存档恢复时出现的长度）才可观察到差异，而单元 45 的测试只构造了 4 槽 |
| D（单元 49/50/51/53/55/57/58） | 22 | **22** | 0 |

D 段覆盖的内容包括：边界条件（`<`/`<=`）、调用顺序、时间常量（310 ms、2500 ms、6 px、0.05 s）、坐标取整的位置、`cut.shift()`、`!isStairs`、RNG 烧录循环的边界在每次迭代时重新求值，以及 `delete 配方信息`。测试对这些变异全部敏感。

### 3. 结构对比

- 每个单元仍然是“精确 AST 源码 VM + 重写在另一个 realm，种子场景，graph snapshot / 有序端口调用对比，非空覆盖计数（每个分支 >5 次）”的形式。D 段的种子数（400–800，路径叠加 3000）不低于 A/B 段（120–800）。
- 源码模块的风格一致：`type Loose = any` 单点逃逸，端口接口逐个标注所属 packet 或 audit，没有 `@ts-ignore`，也没有新增 `as unknown`。
- VERIFICATION 和 DEVIATIONS 的条目格式与密度一致：D 段每个单元都写明了场景范围、变异数和对等价存活的解释；SRC-36…44 的字段与早期条目相同。
- D 段每个单元约 6–15 分钟，与 A 段节奏相近，看不出赶工时提交体量突然变小的迹象。

## 需要 owner 关注的问题（按重要性排序）

1. **`72d974b` 改变了一致性测试的基准。** 从这个提交起，`declaration()` 返回的是“源码 + `source-patches.ts` 中记录的补丁”，不再是纯源码；`originalDeclaration()` 保留未修改的原文。实现本身很严谨：每个补丁必须恰好匹配一次，可逆还原到原文，能被解析，有对应的 DEVIATIONS 行，套件还要求未打补丁的源码在超过 5 个种子上产生差异。但它依据的“owner 规则 2026-10-10”只由 agent 自己写在 DECISIONS 里，记作“本轮”，Issue 和 PR 上没有可核对的 owner 记录。TASK 的验收条件要求行为差异“须提出并进行审核”。**请 Kibiandkimi 确认是否真的授权了这条规则。** 另外：
   - SRC-20 和 SRC-22（房间改为按 id 查找，查不到时回退到下标）以及 SRC-01（重排 reset 设置的形状，并新增 `禁用大地图`）超出了“局部、显然”的修复，接近于推断意图，应当逐条审核。
   - 套件内的“未打补丁版本会不同”守卫是按套件汇总统计的。SRC-24a/b 和 SRC-31a/b 共用一个守卫，逐补丁的覆盖只有 VERIFICATION 中手工回退变异的记录可证，CI 无法复现。
2. **提交信息约定在同一个指纹轮次内连续漂移。** 风格从 `feat(task-10):` 依次变为 `Task 10:`、`task-10 unit NN:`、`Unit NN:`，失去了 conventional type 和 task scope，D 段的提交信息里还完全没有任务编号。这只是外观问题，但会降低历史的可检索性。如果 07:41 或 11:01 实际是新的用户轮次，那么按 AGENTS 规则就缺少当轮指纹。仓库内无法判定，需要对照 Arena 会话记录确认。
3. **STATE / PR 元数据已过期。** “Accepted base at unit start: 45f8811”已不成立：`task/10/main` 已经因 PR #19 合并前进到 `682ad9d`。验证行仍停在单元 56。下一个写 #27 的 primary 应当更新这两处。
4. **D 段中最薄弱的单元是 58（死亡粒子和结算粒子）。** 测试用正则从 `cssText` 中解析数字再比较，没有比较完整字符串；重写只生成规格对象，没有实现 `innerHTML = ''` 和 DOM 挂载；`generateSummaryParticles(prng, hasContainer: unknown)` 的接口有些别扭；结算粒子的测试被放在 `death screen particles` 这个 describe 里。好在 RNG 消耗次数做了精确比较，这才是关键行为，而且探针的 2 个变异都被杀死。属于小问题。另有 `bd69907` 写坏的 DEVIATIONS 表格行，由 `d113ae5` 立即修好。
5. **范围说明（不算质量下降）。** 单元 43/45/46（B/C 段）实现的正是 audit-only packet `t10-fusion-engine-audit` 要审计的函数，单元 47/54/55 依赖 `t10-editor-tools-audit` 的端口。规则允许这样做（audit 不输出 `app/src`），但该 audit 落地后需要与 `fusion-check.ts` / `fusion-exec.ts` 做对账。

## 建议

- owner 先确认第 1 条（上游修复授权），然后逐条审核 SRC-01/20/22 是否保留为 Fixed。
- 后续提交恢复 `feat(task-10): …` 约定。
- 在 #27 上更新 STATE 的 base 和最新验证行。如有需要，为单元 45 的测试补一个 5 槽融合区场景，或在 VERIFICATION 中把 `totalGold > 0` 记为“在 4 槽不变量下等价”。
