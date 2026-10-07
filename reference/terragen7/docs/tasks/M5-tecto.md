# M5 · 板块构造任务卡

T30–T32 只依赖 M1，可与 M3/M4 并行；T33 需要 T41（侵蚀核）与 T50（EBM）。

---

### T30 tecto：状态、初始化、速度基与力平衡、地幔流

- 依赖：T12｜模型：Sonnet 5｜难度：中高
- 必读：§03.1–03.3、§03.10、§03.2（岩石表）、§01.3、§08.4

**交付**（`tg-tecto`）：
1. `TectoState`（§03.2 全部字段，SoA；`strat` 用定长数组 `[Layer; 8]`）与 `Plate` 表；`TectoGrid`（构造网格 `GridSpec` + `RowMetric`）。
2. 初始化 `init(&Body, &Config, seed) -> TectoState`（§03.10：板块数公式、度量 Poisson-disk 种子、带随机边权的多源 Dijkstra、克拉通生长、洋壳年龄按距离）。
3. 速度基：`plate_velocity(&Plate, u, σ, &Body) -> (v_u, v_s)`；解析散度 `plate_divergence(...)`；速度梯度（数值）。
4. 力：`compute_forces(&TectoState, &Boundaries(占位：T31 提供), &MantleFlow) -> Vec<[f64; 3]>`；Galerkin 3×3 求解与平滑、速度上限（§03.3）。在 T31 之前，边界相关的力（板片拉力、碰撞阻力）通过接口桩测试。
5. `MantleFlow`：低波数模态（ψ, χ）、相位漂移、`tm` 平滑后的发散项；`velocity(u, σ, t)`。
6. `tm` 演化（陆下增温、洋下衰减）。

**验收**：
- 初始化：板块数符合公式；每个单元有板块；各板块连通；陆壳占比 12% ± 1%；两种线程数下完全一致。
- 速度基：φ₁ 散度数值 < 1e-12；φ₂ 散度与 `ρ'/ρ` 一致、φ₃ 散度与 §03.3 解析式一致（< 1e-6 相对）；力平衡在 SI 中求解、存储为 m/yr（单位换算测试）。
- 纯地幔拖曳（无其他力）时，板块速度等于地幔流在基函数上的最小二乘投影（与独立计算比对）。
- 地幔流 rms 速度在 1–2 cm/yr。

**审查图**：`artifacts/T30/initial_plates.png`（板块色块 + 克拉通轮廓）、`mantle_flow.png`（流线/矢量）、`initial_velocity.png`（板块速度矢量）。

---

### T31 ★ tecto：归属判定平流、新洋壳、形变、边界分类

- 依赖：T30｜模型：Sonnet 5｜难度：高
- 必读：§03.4、§03.12 第 1、2、4、5 条、§03.1（环面应变物理）、§03.2（`bnd_type/bnd_time`）

**交付**：
1. `advect(&TectoState, dt, &Body) -> TectoState`（写新缓冲）：候选板块、RK2 回溯（度量正确的 du/dt = v_u/ρ）、有效性判定、0/1/≥2 候选的处理（≥2 时调用 `ConvergenceResolver` trait，T31 内提供“年龄大者俯冲、陆壳胜出”的简单实现，T32 替换为完整版）、同板块插值（保单调 Catmull-Rom → 双线性 → 最近邻退化链）、新洋壳。
2. 形变：`J = exp(−div·dt)` 作用于 `thick` 与各层；应变张量累加；年龄增长。
3. `Boundaries::classify(&TectoState) -> Boundaries`（单元对列表：类型、速率、法向、两侧板块；另给每单元“最近边界类型/距离”栅格）。
4. 守恒记账 `tecto/budget.csv` 的数据结构与写出（来源项先填平流与形变）。
5. 子步：仅当 `v_max·dt > 4Δ` 时自动子步（候选搜索半径随位移扩大）。
6. 边界历史字段 `bnd_type/bnd_time` 的更新与随地壳平流（最近邻）。

**验收**：§03.12 第 1、2、4、5 条（第 3 条随 T32 完整汇聚处理一并验收）；另测：没有“孤岛”单元（每个板块在平流后仍基本连通，允许单元级碎片 < 0.1% 面积并报告）；性能：earth 构造网格每步平流 ≤ 0.4 s。

**审查图**：`artifacts/T31/rotation_test.png`（纯转动一圈前后叠加）、`meridional_thickness.png`（纯经向运动的 thick·ρ 守恒曲线）、`boundaries.png`（边界类型着色）。

---

### T32 ★ tecto：俯冲、弧、碰撞、垮塌、合并、变质、地层

- 依赖：T31｜模型：Sonnet 5｜难度：高
- 必读：§03.5、§03.2、§03.12 第 3 条、§01.5（g 用于 T_crit）

**交付**：
1. 完整 `ConvergenceResolver`（§03.5 胜负规则、败者物质处理：俯冲消减、增生楔、陆陆叠加）。
2. 距离场：`d_tr`（上覆板块内）与 `d_sub`（俯冲板块内），用 `tg-core::solve` 的 Dijkstra，半径上限。
3. 弧岩浆（俯冲角/弧距随板片年龄、增厚速率、岩性分配、洋壳上覆转 ctype 2）、安第斯型挤压、弧后伸展、俯冲侵蚀。
4. 碰撞：厚度叠加、`orogeny` 计时、重力垮塌变系数扩散（ADI，跨板块面系数 0，`T_crit` 随 g(σ)）、缝合与合并（20 Myr 窗口统计）。
5. 变质扫描（每 10 Myr）与地层维护（同类合并、超 8 层合并最底两层）。
6. 预算记账补全（弧增生、俯冲侵蚀、碰撞）。

**验收**：§03.12 第 3 条；另设合成情景：
- 洋–陆汇聚 50 Myr：弧位于距海沟 `d_arc` ± 1 格带内，陆壳增厚形成 > 2 km 高程带；海沟深度 ≈ 预期。
- 陆–陆碰撞 50 Myr：厚度不超过 `T_crit` 太多（最大值 < 1.15·T_crit）、造山带宽度随时间扩展；两板块最终合并。
- 变质：深埋页岩转为片岩/片麻岩。
- 确定性；earth 每步（含距离场）≤ 0.8 s。

**审查图**：`artifacts/T32/subduction_scenario.png`（剖面：厚度、高程、弧位置）、`collision_frames/`、`strat_column_samples.png`（若干单元地层柱示意）。

---

### T33 tecto：裂谷、热点、均衡高程、海平面、Phase A 驱动

- 依赖：T32、T41、T50｜模型：Sonnet 5｜难度：高
- 必读：§03.6–03.9、§03.11、§03.12 第 6–8 条、§04.2（EBM 接口）、§05.3（侵蚀率核）

**交付**：
1. 裂谷事件（§03.6：触发概率、Dijkstra 路径、分裂、初始相背速度、带状减薄、被动陆缘转化）。
2. 热点与 LIP（§03.7）。
3. `elevation(&TectoState, &Body) -> Field2<f32>`（§03.8 全部项）与海平面求解（复用 `tg-surface::sealevel`）。
4. Phase A 地表耦合（§03.9）：`tg-tecto` 提供 `apply_surface(state: &mut TectoState, precip_proxy: &Field2<f32>, dt)`，内部调用 `tg-surface::lem::erosion_rates` 并把侵蚀/沉积写入厚度与地层；EBM 由 `tg-pipeline` 的 Phase A 驱动每 10 Myr 调用一次，结果插值到构造网格后传入（`tg-tecto` 不依赖 `tg-climate`）。
5. `tg-pipeline` S3 `tecto-deep` 阶段：t0 → −100 Ma，每 25 Myr 快照（f16 高程 + u16 板块）、每 50 Myr 检查点（只保留最近 2 个，可续跑）、`tecto/metrics.csv`、`TectoForcing` 输出接口（§03.11，含 `plate_id`，Phase B 使用）。
6. `terragen render <dir> frames --stage tecto`。

**验收**：§03.12 第 6–8 条（mini 1 Gyr 长程：板块数、陆壳占比、高程范围、双峰、超大陆旋回）；续跑一致性（中途中断后续跑与一次跑完结果相同）；性能：earth Phase A ≤ 1.5 h（可用 200 Myr 实测外推）。

**审查图**：`artifacts/T33/tecto_frames/`（每 50 Myr：板块边界 + 高程）、`tecto.gif`、`hypsometry.png`、`metrics_timeseries.png`（板块数、陆壳占比、超大陆指数随时间）、`globe_final.png`（终态三维渲染）。
