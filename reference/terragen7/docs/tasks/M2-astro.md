# M2 · 天文与日照任务卡

---

### T20 astro：轨道、太阳方向、日历、轨道要素变化、进动

- 依赖：T12｜模型：Sonnet 5｜难度：中
- 必读：§02.1–02.3、§02.8、§01.1（标架与法向分量）

**交付**（`tg-astro`）：
1. `orbit`：`OrbitalElements`、开普勒求解（牛顿，|残差| < 1e-13）、`true_longitude`、`distance`、年长。
2. `sun`：`SunState { s_const, dist, decl, ra, u_sun, s_body: DVec3 }`；`Astro::sun_state(&el, t_sec)`；`cos_zenith(σ, u, &SunState, &Body)`；日历工具（恒星日、太阳日、年日数、月/模型日换算）。
3. `secular`：`Astro::elements_at(t_yr)`（§02.3：轴向进动由 `ScfResult` 的 C、A 计算，近日点进动、黄赤交角与偏心率振荡，相位由 seed 派生）；`precession_period_yr()`。
4. `astro/report.json` 字段中与本卡相关部分（年长、恒星日、太阳日、进动周期、(C−A)/C）。

**验收**：§02.9 第 1 条；`elements_at` 在 t=0 返回配置值；进动周期对 earth 与 mini 打印并写入报告（审核者会独立验算）；太阳方向向量单位长度；一年内 δ 的极值 = ±ε（e=0 时）。

**审查图**：`artifacts/T20/declination_year.png`（δ 与 S 随年内日期）、`artifacts/T20/elements_1myr.png`（ε、e、ϖ 在 1 Myr 内的演化）。

---

### T21 ★ astro：自遮挡、日照表、视角因子、astro 阶段

- 依赖：T20｜模型：Sonnet 5｜难度：中高
- 必读：§02.4–02.9、§01.6

**交付**：
1. `shadow::ShadowTable`（§02.4 紧凑区间表示、构建、`visibility` 软可见度查询、两条镜像对称的利用与测试）。
2. `insolation::QTable`（§02.5 基础二维表 q(σ,δ)，只算一次）与 `InsolationTable`（由 q 表按轨道要素即时构建：日均、日照时长比例、日照加权 μ̄、年均；`precession_averaged`）。
3. `viewfactor::ViewFactors`（§02.6：256 箱、8192 余弦加权射线/箱、确定性 RNG、互易对称化）；辅助 `ring_lw(olr_zonal: &[f64]) -> Vec<f64>`、`ring_sw(...)`。
4. `sun_samples`（§02.7）。
5. `tg-pipeline` S2 `astro` 阶段：构建上述表并保存到 `astro/`，完成 `astro/report.json`（代表 σ 的年均日照、季节振幅、内赤道年日照时长）。
6. `terragen render <dir> globe --day D --hour H`：以瞬时日照着色（含阴影）。

**验收**：§02.9 第 2–7 条全部；性能：earth 预设 S2 < 3 min（16 线程）。

**审查图**：`artifacts/T21/insolation_hovmoller.png`、`annual_mean.png`（年均日照随 σ）、`daylight.png`、`sky_view.png`（F_sky 随 σ）、`vf_matrix.png`、`globe_equinox.png`、`globe_solstice.png`（二分日与二至日同一时刻的光照渲染，内侧阴影应清晰可见）。
