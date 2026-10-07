# M3 · 地表过程核任务卡

M3 可与 M2 并行（只依赖 T10）。所有核必须同时支持 `Periodic` 与 `Window` 两种网格（§05.1），后者将在 M7 使用，现在就要有测试。

---

### T40 ★ surface：流向、Priority-Flood、湖泊、栈序、累积

- 依赖：T10｜模型：Sonnet 5｜难度：中高
- 必读：§05.1、§05.2、§05.10 第 1–2 条、§01.3.2、§08.4

**交付**（`tg-surface`）：
1. `grid::SurfaceGrid`：`Periodic { metric: RowMetric }` 与 `Window { metric_rows: RowMetric(窗口行), halo: usize }`（窗口不周期；halo 环为基准面/Dirichlet）；统一的邻居迭代（Window 越界即无邻居）、单元面积、D8 距离。
2. `flow::route(grid, h, sea_level, runoff, pet, opts) -> FlowResult`：
   - `FlowResult { receiver: Vec<u32>, rdist: Vec<f32>, stack: Vec<u32>, donors (CSR), basin: Vec<u32>, filled: Vec<f32>, lake_id: Vec<u32>, lakes: Vec<Lake>, area: Vec<f64>, discharge: Vec<f64> }`
   - `Lake { id, outlet: Option<u32>, level, area, volume, inflow, evap, endorheic: bool }`
   - 步骤严格按 §05.2 的 1–7。
3. 性能要求：使用 Barnes 改进版 Priority-Flood（平台/洼地用普通队列，只有必要时入堆）；海洋内部单元（四周全海）不入队；受水点计算并行。

**验收**：
- §05.10 第 1、2 条。
- 周期边界：跨 i=0/nu−1 与 j=0/ns−1 的流向与累积正确（构造一个跨缝的倾斜面）。
- 嵌套洼地：两级洼地的填洼面与外流判断正确。
- Window 模式：halo 为汇；从 halo 注入的入流面积（调用方给的 `inflow_area` 字段）正确累加到下游。
- 确定性（`assert_deterministic`）。
- 性能（release，16 线程）：mini L0（约 1.6 M 格）≤ 0.3 s；30 M 格合成地形 ≤ 5 s（报告实测）。

**审查图**：`artifacts/T40/synthetic_drainage.png`（合成地形晕渲 + 按 log(Q) 着色的河网 + 湖泊）、`artifacts/T40/basins.png`（流域分类色图）。

---

### T41 ★ surface：河流 ξ–q、坡面、海洋沉积、均衡、海平面、沉积层、LEM 单步

- 依赖：T40｜模型：Sonnet 5｜难度：高
- 必读：§05.3、§05.4、§05.6、§05.7、§05.10 第 3–5、7 条、§03.8（海平面求解）、§03.2（`Facies`）

**交付**：
1. `fluvial::erode_deposit(grid, flow, h, k_field, uplift, dt, params) -> FluvialOut { dh_erosion, dh_deposition, qs_to_ocean: Vec<(cell, vol)>, qs_to_sinks }`：§05.3 隐式 n=1 + Gauss–Seidel 外迭代 + 湖泊处理 + 逆坡截断。
2. `hillslope::diffuse_linear` / `diffuse_nonlinear`（§05.4，调用 `tg-core::solve` 的 ADI；非线性用 Picard，超过 0.99·S_c 的守恒截断）。
3. `marine::deposit(grid, h, sea_level, sources, sst, dt, params)`（§05.7：深度相关扩散、碳酸盐、远洋）。
4. `isostasy::flexural_response(grid, load_change, g_rows, params) -> Field2<f32>`（§05.6 可分离高斯近似，α 随行变化）；冰载松弛状态结构。
5. `sealevel::solve(grid, h, water_volume, ice_volume) -> f64`（二分，0.1 m）。
6. `strat`：`trait StratColumn { fn erode(&mut self, cell, depth) -> ErodedMix; fn deposit(&mut self, cell, thickness, facies: Facies, age: f64) }`；L0 实现 `SedStack4`（每格 4 层 `SedLayer { facies: Facies, thick: f32, age: f32 }`，超出合并最底两层）；相别选择函数（§05.3、§05.7 的 `Facies` 规则：河流/湖相/海相按水深、碳酸盐、蒸发岩、冰碛）。
7. `lem::LemState` + `lem::step(state, grid, forcing, dt, params) -> StepDiag`：按 §05.8 第 5 步的子步顺序（不含构造平流）；`forcing = { uplift, runoff, precip, veg_cover, k_rock, sst, pet }`；`StepDiag { eroded_vol, deposited_vol, exported_vol, sea_level, max_dh }`。另导出 `lem::erosion_rates(...) -> (E, D)` 供 Phase A 构造耦合（§03.9）。

**验收**：
- §05.10 第 3、4、5、7 条。
- 合成“块体抬升岛屿”在 mini L0 网格上以 U = 1 mm/yr 演化 20 Myr：接近稳态（最后 1 Myr 平均 |dh/dt| < 0.05·U），最高峰 1–6 km（写报告），无 NaN、无逆坡残留；坡度–面积凹度 θ ∈ [0.35, 0.6]。
- 沉积层：合成情景中河口形成三角洲/陆架（海底沉积厚度 > 0 且随离岸距离衰减）。
- Window 模式跑通（halo Dirichlet，内部河道约束单元保持不变）。
- 确定性；性能：mini L0 单步 ≤ 1 s，30 M 格单步 ≤ 12 s（报告实测）。

**审查图**：`artifacts/T41/island_frames/`（每 2 Myr 一帧晕渲 + 河网）、`island_final.png`、`slope_area.png`（log–log 散点与拟合线）、`sediment_thickness.png`。

---

### T42 surface：SIA 冰川、物质平衡、冰川侵蚀

- 依赖：T41｜模型：Sonnet 5｜难度：中高
- 必读：§05.5、§05.6（冰载）、§05.10 第 6 条、§04.1（直减率 Γ）

**交付**（`tg-surface::glacier`）：
1. `GlacierModel { ice_grid (粗化 ×2), H, active_mask, w_ice }`；`new(grid, coarsen)`。
2. 物质平衡：`smb(bed+H, monthly_T_sl, monthly_P, gamma_rows)`（积累 + 正度日消融，§05.5）。
3. `step(&mut self, bed, climate, dt) -> GlacierDiag { volume, area, max_h, eroded_vol }`：活动集上的 Picard 迭代线性化 ADI（每步内迭代至收敛，§05.5），滑动与冰底融点代理（可配置关闭，Halfar 测试需关闭），冰川侵蚀 `K_g·u_b`，冰缘冰碛沉积（通过 `StratColumn`，相别 `Till`），冰载均衡状态更新。
4. 冰厚/侵蚀/冰碛字段上采样回原网格的函数。

**验收**：
- §05.10 第 6 条（Halfar）。
- 零物质平衡下冰体积守恒（< 1e-6 相对/千年）。
- 暖气候（全年 > 0 °C）冰在有限时间内完全消失；冷气候下平衡线高度与 `T_sl − Γ·z = 0 °C` 附近一致（误差 < 200 m，在报告中解释差异）。
- 确定性；性能：mini 冰网格 1 kyr 积分 ≤ 0.3 s（§05.5）。

**审查图**：`artifacts/T42/halfar_profile.png`（数值与解析剖面）、`synthetic_glaciation.png`（合成山脉在冷气候下的冰厚）、`glacial_erosion.png`。
