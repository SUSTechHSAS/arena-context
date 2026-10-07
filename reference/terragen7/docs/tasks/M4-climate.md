# M4 · 气候任务卡

气候链是关键路径与最高风险项。审核者对 T51/T52 做独立数值验证；若两轮后仍不稳定，启用 INDEX 中的降级方案。

**共享测试世界**（T50 创建于 `tg-climate::testworld`，后续任务复用）：`aqua`（全海洋）、`outer_continent`（外赤道附近一块 30% 面积大陆，高原 1 km + 一条 3 km 南北向山脉）、`inner_continent`（大陆位于内侧）。均以 `test`/`mini` 预设的 Body 构造，给出陆海掩码、高程、反照率、土壤持水。

---

### T50 climate：EBM

- 依赖：T21｜模型：Sonnet 5｜难度：中
- 必读：§04.1、§04.2、§04.6 第 1 条、§02.5–02.6、§01.3.3

**交付**（`tg-climate::ebm`）：
1. `EbmSurface { land: Field2<u8>, elev: Field2<f32>, albedo_land: Field2<f32> }`（气候网格）；`testworld` 模块（见上）。
2. `Ebm::new(&Body, GridSpec, EbmParams)`；`run_equilibrium(&EbmSurface, &InsolationTable, &ViewFactors) -> EbmClimate`；`step_year(&mut self, ...)`（冰期模式，保留热容记忆）。
3. `EbmClimate { t_month: [Field2<f32>; 12], precip_proxy: Field2<f32>, snow: Field2<f32>, sea_ice: Field2<f32>, olr_zonal: Vec<f64> }`。
4. 物理严格按 §04.2：柱质量 `p_s/g(σ)`、`K ∝ (Ω_E/Ω)^p_K`、湿静能扩散（ADI）、冰雪反照率、环光 LW/SW（每模型月用自身纬向 OLR 与反射短波更新）。
5. 与 `tg-core::grid` 的行度量完全一致，禁止出现纬度变量。

**验收**：§04.6 第 1 条全部；`aqua` 世界全球平均 T ∈ [240, 320] K 并写报告；关闭环光（测试开关）与开启时内侧温差写入报告（预期开启后内侧更暖）；`step_year` 连续 100 年无漂移（年均全球 T 变化 < 0.05 K，固定轨道）。

**审查图**：`artifacts/T50/zonal_T_hovmoller.png`（σ × 月）、`annual_T_outer_continent.png`、`ring_effect.png`（开/关环光的年均 T 随 σ 对比）。

---

### T51 ★ climate：GCM 动力核

- 依赖：T50｜模型：Sonnet 5｜难度：高
- 必读：§04.1、§04.4.1、§04.6 第 3 条、§01.3、§01.5

**交付**（`tg-climate::gcm::dyn`）：
1. C 网格数据结构（u 在东西面、v 在南北面、标量在中心、涡度在角点），使用 `RowMetric`（面长、面积）与角点面积。
2. `State { pi, u: [_;2], v: [_;2], t: [_;2], q2 }`（f64）；`Dycore::new(&Body, GridSpec, DynParams)`；`tendencies(&State, &Forcing) -> Tend`；`step_rk3(&mut State, dt)`；自动 dt（§04.4.1 公式）。
3. 方程与离散按 §04.4.1：Sadourny 能量守恒涡度项、σ̇/ω 诊断、两层静力关系、`π = p_s/g(σ)` 为预报量、∇⁴ 超扩散、上层 Rayleigh 阻尼。**在报告中写出完整离散方程**（审核重点）。
4. 诊断：总质量、总能量（动能 + 内能 + 位能）、全局最大风速、CFL 数。
5. 环面版 Held–Suarez 驱动：`T_eq(σ, level)` 由年均日照廓线导出（线性映射到 [T_min, T_max] 并按层减去稳定度），牛顿松弛（40 天，近地层 4 天）+ 下层 Rayleigh 摩擦（1 天）；`hs_run(days)`。

**验收**：§04.6 第 3 条全部（静止大气、山地伪风、质量/能量守恒、Held–Suarez 1000 天稳定）；报告急流数目、位置（σ）及最大风速；内侧 β 变号对应的波动传播方向观察（定性描述即可）；性能：mini 网格每模型日耗时与 earth 网格每模型日耗时（release，16 线程）。

**审查图**：`artifacts/T51/hs_zonal_u.png`（上下层纬向平均 u 随 σ）、`hs_vorticity.png`（第 1000 天上层涡度图）、`hs_ke_series.png`（动能时间序列）、`mountain_spurious_wind.png`。

---

### T52 ★ climate：GCM 物理、平板海洋、海冰、陆面、气候态、climate 阶段

- 依赖：T51｜模型：Sonnet 5｜难度：高
- 必读：§04.4.2、§04.4.3、§04.6 第 4–6 条、§02.5–02.7、§06.3.4（反馈接口）

**交付**（`tg-climate::gcm::phys`, `gcm::run`）：
1. 物理过程 1–10（§04.4.2），每个过程一个函数，输入输出为倾向量；调用频率 `phys_every`。
2. `GcmSurface`（陆海、包络地形、地表反照率、粗糙度、土壤持水、初始 SST/T）从任意 L0 类场块平均构造的函数。
3. 运行器：`run_climate(&Body, &Astro, &ShadowTable, &ViewFactors, &GcmSurface, years, grid) -> Climatology`（首年丢弃，月均累积）；`run_snapshot(..., years=2, coarsen=2) -> Snapshot { wind_season: [(u,v);4], zonal_p, evap_season }`。
4. `Climatology` 的 `.tgclim` 读写（§04.4.3 字段表）；`climate/diag.json`；模式状态的保存/重启（`save_state`/`load_state`，供 §06.3.4 反馈迭代从终态续算）。
5. `tg-pipeline` S5 `climate` 阶段函数（输入取自 L0 世界数据；在 M6 集成前用 `testworld` 做集成测试）。

**验收**：§04.6 第 4 条全部；`outer_continent` 世界：山脉迎风坡 P 高于背风坡；上下半环季节相反（1 月与 7 月温度场关于 z=0 近似镜像，量化给出相关系数）；水量闭合；性能：mini 每模型年、earth 每模型年耗时写入报告（earth 可只跑 30 天外推）。

**审查图**：`artifacts/T52/zonal_means.png`（T、P、u 随 σ）、`p_jan.png`、`p_jul.png`、`t_jan.png`、`t_jul.png`、`wind_850.png`（低层风矢量）、`sea_ice.png`。

---

### T53 climate：快速降水模拟器、L0 降尺度

- 依赖：T52｜模型：Sonnet 5｜难度：中
- 必读：§04.3、§04.5（L0 部分）、§04.6 第 2 条、§06.3.2（PET 公式）

**交付**：
1. `tg-climate::precip::Emulator`：§04.3 的稳态水汽收支（迎风 Gauss–Seidel 扫描、隐式扩散、`P_up` 抬升凝结、`W_s(h)` 随 g 修正的水汽标高）、Budyko ET、Priestley–Taylor PET、外层 ET 迭代；`calibrate_tau_bg(&Snapshot, flat_surface)`。
2. `precip::run(grid, h, land, t_sl_seasonal, snapshot, tau_bg) -> PrecipOut { p_season: [_;4], p_annual, et, runoff, snow_frac }`。
3. `tg-climate::downscale::L0Climate`（§04.5 L0：月 T、月 P、月径流、月净辐射、月下行短波、年 PET/ET、降雪、4 季风、4 季 N_m、生长季长度）：**存储于 P 网格分辨率**（f16），提供 `sample(i0, j0) / region(...)` 按需双线性 + 高程直减到 L0 或任意网格；读写。

**验收**：§04.6 第 2 条（无风时 P=E；山脊雨影；关闭地形项时差异消失）；在 `outer_continent` 上与 GCM 陆地格点年降水的空间相关系数 > 0.6（不是纬向平均——后者已被 τ_bg 校准，检验无意义），写报告；分辨率 16 km 的 mini P 网格单次运行 ≤ 10 s；earth 32 km P 网格单次运行耗时写报告（Phase B 中需调用约 100 次）。

**审查图**：`artifacts/T53/ridge_rain_shadow.png`（剖面：地形 + P）、`emulator_vs_gcm.png`、`l0_precip_annual.png`、`l0_temp_jan.png`。
