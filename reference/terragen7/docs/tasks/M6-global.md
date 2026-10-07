# M6 · 全局成品任务卡

完成 M6 后，`terragen run` 能在 mini 预设上跑完 S0–S7，得到完整的全局世界（地形、气候、土壤、植被、河网）。执行顺序：T43 → T61 → T62 → T60 → T63（阶段顺序 S4 coupled → S5 climate → S6 eco → S7 hydro）。

---

### T43 ★ pipeline：Phase B 耦合驱动

- 依赖：T33、T42、T53｜模型：Sonnet 5｜难度：高
- 必读：§05.8（全部）、§03.11、§04.2（冰期模式）、§04.3、§05.5、§05.6、§06.1（Phase B 植被覆盖公式）、§02.3（快进动处理）

**交付**（`tg-pipeline::phase_b`，S4 `coupled` 阶段）：
1. 分辨率日程与切换时的双三次上采样（h、沉积层、冰厚）。
2. 每构造步：构造推进 → `U_tecto`（严格按 §05.8 第 2 步，拉格朗日差分除以 dt，避免与均衡重复）→ L0 平流（按 `TectoForcing.plate_id` 同板块回溯；新洋壳/消减处取 `e_tecto`）→ 气候日程（EBM 每 1 Myr、降水模拟器每 1 Myr、GCM 快照每 10 Myr）→ 计算 `veg_cover` → LEM 子步（先 `h += U·dt`，再调用 LEM 且传 U = 0）→ 侵蚀/沉积回写构造网格。
3. 海平面以 L0 网格求解为准（§05.8 参考系约定）。
4. 冰期窗口（最后 1 Myr）：EBM 每 1 kyr 按轨道要素更新（快进动时使用 ϖ 平均日照）；冰川模型与气候每 1 kyr 交换；冰量进入海平面；冰载均衡。
5. 为下游记录的字段（写入 `l0/`）：最终高程（相对参考面，另存海平面）、`sed` 4 层（含 age）、最后 1 Myr 平均侵蚀率 `erosion_rate`、冰期窗口累计冰川侵蚀 `glacial_erosion`、现代冰厚、河道高程快照 `h_snap_{120,60,20}ka`（供阶地）、海平面历史；`tecto/final.bin`（含 `bnd_type/bnd_time`、应变、地层，供断层与 strat_at）。
6. 检查点每 5 Myr（只保留最近 2 个；续跑结果与一次跑完一致）；进度日志；`terragen render <dir> frames --stage coupled`（帧只存 PNG）。

**验收**：
- mini 完整 Phase B 跑通，无 NaN；质量收支（侵蚀 = 沉积 + 入海 + 内流汇 + clamp 记账，逐构造步）误差 < 1e-4。
- 续跑一致性；确定性（`test` 预设 1 与 16 线程）。
- §05.10 第 8 条的指标在 mini 结果上计算并写入报告（未达标需分析原因，不得随意调参）。
- 性能：mini Phase B ≤ 20 min；earth 按分辨率阶段抽样实测外推 ≤ 8 h（写报告）；世界目录磁盘占用写报告。

**审查图**：`artifacts/T43/coupled_frames/`（每 5 Myr 晕渲 + 河网 + 冰）、`final_l0_hillshade.png`、`glacial_erosion.png`、`sea_level_history.png`、`globe_final.png`。

---

### T61 eco：土壤物理部分

- 依赖：T43｜模型：Sonnet 5｜难度：中
- 必读：§06.1、§06.2.1、§06.2.3、§06.5 第 3 条、§04.5（L0 气候）

**交付**（`tg-eco::soil`）：风化层厚度、风化程度（沉积区用 `SedLayer.age`）、质地、层位厚度、持水能力 W_cap、活动层（§06.2.1、§06.2.3）；可选黄土模块（单独函数，配置开关默认开）；输出 `eco/soil.tgf`（多字段）。**土纲判定不在本任务**（需要植被，见 T62），但提供决策树所需的全部输入字段。输入以普通数组传入（沉积层、岩性、侵蚀率、气候场），不直接依赖其他 crate 的内部类型以外的结构。

**验收**：§06.5 第 3 条中关于 H_r 的部分；持水能力范围 [0, 400] mm；水力参数随质地单调合理（砂土 W_cap 低于壤土）。

**审查图**：`artifacts/T61/regolith_thickness.png`、`w_cap.png`、`texture_clay.png`、`loess.png`（如启用）。

---

### T62 eco：植被、生物群系、土纲、GCM 反馈，S6 阶段

- 依赖：T61｜模型：Sonnet 5｜难度：中
- 必读：§06.1、§06.2.2、§06.3、§06.5 第 1–3 条、§04.4.3（重启接口）

**交付**：
1. `tg-eco::vegetation`：PFT 参数表（`pft_table.rs`）、月步长水分平衡（用 L0 气候的月净辐射/月短波）、潜在 NPP、竞争与火、覆盖度、生物群系、Whittaker 表（`whittaker.rs`）。
2. `tg-eco::soil::classify_order`（§06.2.2 决策树，使用优势 PFT）。
3. 反馈：反照率/粗糙度/W_cap 块平均到 `GcmSurface`，`eco.feedback_iterations` 次（从 GCM 终态重启 2 年 → 重建 L0 气候 → 重算植被与土纲）。
4. `tg-pipeline` S6 `eco` 阶段（顺序见 §06.1）；输出 `eco/veg.tgf`、`eco/soil.tgf` 中的土纲字段、更新后的 `climate/` 与 L0 气候。

**验收**：§06.5 第 1、2 条及第 3 条中关于 Gelisol 的部分；反馈前后全球平均 T 与陆地平均 P 的变化写入报告；PFT 参数表与 Whittaker 表完整列出于报告；土纲面积占比表与气候分布一致性说明。

**审查图**：`artifacts/T62/biome.png`、`tree_cover.png`、`lai.png`、`soil_order.png`、`whittaker_scatter.png`（按生物群系着色的年均温–年降水散点，叠加 Whittaker 边界）、`globe_biome.png`。

---

### T60 hydro：最终水文、河网矢量化、湖泊、L0 流量场、波浪风区，S7 阶段

- 依赖：T62｜模型：Sonnet 5｜难度：中
- 必读：§05.9、§05.2、§07.4（了解下游如何使用河网）

**交付**：
1. `tg-surface::hydro::extract_network(flow, h, runoff_monthly: &[Field2<f32>; 12], rock: &Field2<u8>) -> RiverNetwork`（参数为普通场，`tg-surface` 不依赖 `tg-climate`）：
   `RiverNetwork { segments: Vec<Segment> }`，`Segment { id: u32, down: Option<u32>, ups: Vec<u32>, mouth_kind: Ocean|Lake(u32)|Endorheic, nodes: Vec<RiverNode> }`，`RiverNode { cell: (i64,i64), u, s, z_surf, q_mean, q_bf, width, depth, slope, order: u8, rock: u8, qs }`。
   段 id 确定性：按河口单元索引排序，再自河口向上游 DFS（上游支流按汇入点单元索引排序）。
2. `z_surf` 沿程单调不增；宽深公式（§05.9）；Strahler 分级；月流量由月径流分别累积，`Q_bf = max 月 Q`。
3. 湖泊表 `l0/lakes.bin`；冰厚插值到 L0 `l0/ice.tgf`；L0 流量场 `l0/flow.tgf`；波浪指数 `l0/wave.tgf`（§05.9）。
4. `tg-pipeline` S7 `hydro` 阶段。

**验收**：拓扑为森林（无环、每段的 down 存在或为终点）；所有段最终到达海洋/湖/内流汇；`z_surf` 单调；合成树的 Strahler 与手算一致；段 id 在两次运行中相同；波浪指数在开阔大洋迎风岸高、封闭海湾低（合成测试）；mini 上河段数、最长河流长度、最大流量写入报告。

**审查图**：`artifacts/T60/rivers_by_order.png`、`lakes.png`、`longest_river_profile.png`、`discharge_map.png`、`wave_index.png`。

---

### T63 metrics + 全流程 CLI + 全局图集

- 依赖：T60｜模型：Sonnet 5｜难度：中
- 必读：§08.7、§08.8、§08.10、§00.6、§06.5

**交付**：
1. `tg-metrics`（只接受普通场/数组输入）：§08.7 表中全部指标的计算（高程直方图与双峰、海洋占比、行剖面功率谱斜率、坡度–面积凹度、Hack 指数、Horton 比、坡度分布（接口供 M7 使用）、Whittaker 符合率、气候合理性），输出 `previews/metrics.json/md`。
2. `terragen run <dir>`（S0–S7 全流程；S8 在 M7 加入）、`terragen metrics <dir>`、`terragen render <dir> atlas`（标准图集：晕渲+河网、终态板块、1/7 月温度、年降水、生物群系、土纲、冰川湖泊、三维渲染（高程纹理、生物群系纹理、二分日/二至日光照））、`terragen bench <dir>`（阶段耗时/内存/磁盘汇总）。
3. 全流程确定性测试（`test` 预设：两次运行、1 与 16 线程，所有输出文件哈希一致；慢速测试）。

**验收**：mini 全流程 ≤ 1 h（报告实测，含各阶段耗时、峰值内存、磁盘占用）；指标报告生成，护栏外的项有分析；确定性测试通过；（若磁盘允许）earth-lite 全流程跑通并给出指标，用于校准确认。

**审查图**：`artifacts/T63/atlas/`（全部标准图）、`metrics.md`。
