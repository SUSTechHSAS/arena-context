# 02 · 轨道、自转、光照与季节

## 02.1 轨道（`tg-astro::orbit`）

- 开普勒轨道：恒星质量 `M_*`（默认 1.989e30 kg）、光度 `L_*`（3.828e26 W）、半长轴 a（1.496e11 m）、偏心率 e（0.0167）、近日点黄经 ϖ（相对春分点，102.9°）。
- 年长 `T_orb = 2π·sqrt(a³/(G(M_* + M)))`。
- 平近点角 → 偏近点角：牛顿迭代解 `M = E − e sin E`（|残差| < 1e-13），真近点角 ν，距离 `d = a(1 − e cos E)`。
- 真黄经 `λ = ν + ϖ`；太阳常数 `S = L_*/(4πd²)`。

## 02.2 自转与太阳方向（`tg-astro::sun`）

- 自转轴 = 星体对称轴 +z（环面只有绕对称轴自转是稳定的）。黄赤交角 ε（默认 23.4°）。
- 赤纬 `sin δ = sin ε · sin λ`；赤经 `α = atan2(cos ε · sin λ, cos λ)`。
- 星体转角 `θ(t) = Ω t + θ₀`；**直射点环向角** `u_sun(t) = wrap(α(t) − θ(t))`。
- 体坐标系中的太阳方向：`s = (cos δ cos u_sun, cos δ sin u_sun, sin δ)`。
- 点 (u, σ) 的太阳天顶角余弦：`μ = n·s = n_ρ(σ) cos δ cos(u − u_sun) + n_z(σ) sin δ`，其中 `n_ρ = z'`, `n_z = −ρ'`。
- 地方时角 `H = wrap_pm(u − u_sun)`（−π..π，0 为正午）。
- 轨道相位：日历零点 t=0 定义为上半环春分（λ=0），即 ν₀ = −ϖ，由此反求 E₀ 与平近点角 M₀；此后 `M(t) = M₀ + 2πt/T_orb`。
- 日历：恒星日 `T_sid = 2π/Ω`，太阳日 `T_sol = 1/(1/T_sid − 1/T_orb)`；年含 `N_day = T_orb/T_sol` 个太阳日（非整数）。气候态使用“月” = 年/12，“模型日” = 年/`n_day_bins`（默认 360 份）。日历零点 = 上半环春分（λ=0）。
- 时间变量：气候用 `t_sec: f64`（自日历零点的秒数）；地质用 `t_yr: f64`。

## 02.3 轨道要素的长期变化（Milankovitch 类比）

- **轴向进动周期由物理计算**，不套用地球值：
  - 由 SCF 质量分布计算转动惯量：`C = ∫ρ² dm`，`A = ∫(ρ²/2 + z²) dm`。
  - 进动角速度 `ψ̇ = (3/2)·(n²/Ω)·((C − A)/C)·cos ε`（rad/s），n = 2π/T_orb（无卫星）；使用时换算为 rad/yr（× YEAR）。环面的 (C−A)/C ≈ 0.4–0.5，远大于地球的 0.0033，因此进动可能只有数千年——这是环面特有结果，需在报告中输出。
- 近日点绝对进动（行星摄动）：配置 `perihelion_precession_period_yr`（默认 1.0e5，符号同地球）。气候进动 `ϖ(t) = ϖ₀ + 2πt/P_ϖ + ψ̇·t`。
- 黄赤交角与偏心率的摄动振荡：配置 `obliquity_amp_deg`（默认 1.2）、`obliquity_period_yr`（4.1e4）、`ecc_amps`（[0.012, 0.008]）、`ecc_periods_yr`（[1.0e5, 4.0e5]）。形式 `ε(t) = ε₀ + A[sin(2πt/P + φ) − sin φ]`，`e(t) = e₀ + Σ_k A_k[sin(2πt/P_k + φ_k) − sin φ_k]`（保证 t=0 时等于配置值），e 截断于 [0, 0.2]。相位 φ 由 seed 派生。
- **快进动处理**：若气候进动周期 < 10 kyr（环面上很可能如此），而冰期模拟的气候更新间隔为 kyr 级，则 EBM 使用对 ϖ 取平均的日照（8 个等分相位的平均，借助 §02.5 的 q 表开销可忽略），避免混叠；冰盖响应时间远长于该周期，物理上等价。
- `fn elements_at(t_yr) -> OrbitalElements`。

## 02.4 自遮挡可见性（`tg-astro::shadow`）

环面的内侧会被环体另一侧遮挡。直射可见性 V 只依赖 `(σ, H, δ)`（轴对称），且 `V(σ,−H,δ) = V(σ,H,δ)`、`V(L_m−σ, H, −δ) = V(σ, H, δ)`。

- **紧凑表示**：对每个 `(σ_k, δ_m)`，在 H∈[0, π] 上存储“被遮挡区间”列表（通常 0–2 个）`[H_a, H_b]`，只在 μ>0 的区间内有意义。
  - σ：1024 个采样；δ：[−δ_max, δ_max] 每 0.25°，`δ_max = ε₀ + 2·obliquity_amp + 1°`。
  - 求法：在 H 上以 0.25° 步长采样射线可见性（`Body::ray_hits_body`，射线起点为 P + 1e-3·r·n），在可见性翻转处二分到 1e-6 rad。
  - 太阳圆盘半影：忽略（角直径 0.53°，对 100 km 级网格无意义）。
- 查询 `fn visibility(σ, H, δ) -> f32`：在最近的 4 个 (σ_k, δ_m) 样本上分别判定布尔可见性，再按双线性权重加权，得到 [0,1] 的软可见度（避免相邻样本区间数不同时的插值歧义）。
- 预期现象（测试项）：外赤道与环顶永不被遮挡；δ=0 时内赤道全天无直射；内侧只在 |δ| 足够大（太阳越过环顶）时才受照，形成极强季节性。

## 02.5 日照表（`tg-astro::insolation`）

- 瞬时直射：`I(σ, H, t) = S(t)·max(0, μ)·V(σ, H, δ(t))`。
- **基础二维表** `q(σ, δ) = (1/2π) ∫_{−π}^{π} max(0, μ) V dH`（与轨道无关，只依赖几何），σ 1024 × δ 每 0.25°，只算一次。积分用 H 上 2048 点梯形 + 区间端点修正。
- **日均日照** `Q̄(σ, d) = S_d · q(σ, δ_d)`（d=0..n_day_bins−1，取该日中点的 δ、S）；因此任意轨道要素下的日照表只需毫秒级查表。
- 同时输出：`daylight_frac(σ,d)`、日照加权平均 `μ̄(σ,d)`（供反照率/大气路径长度）、年均 `Q̄_ann(σ)`。
- 对任意网格行插值到行中心 σ_j。
- 地质时间尺度（EBM 用）：`fn daily_mean_table(elements) -> InsolationTable`，由 q 表即时构建（< 50 ms）；另提供 `precession_averaged(elements)`（§02.3）。

## 02.6 环间辐射交换（`tg-astro::viewfactor`）

内侧表面看到的“天空”有一部分是环体的另一侧：它接收对面的长波（OLR）和反射短波，同时向太空的净辐射冷却减小。这是环面独有的重要项。

- 取 `N_vf = 256` 个 σ 分箱。对每个箱中心（u=0）在上半球做余弦加权采样 8192 条射线，追踪到环体；命中则记录命中点 σ' 所属箱（u' 无关，因场量取环向平均）。
- `VF[k][k']` = 命中箱 k' 的射线比例；`F_sky[k] = 1 − Σ_k' VF[k][k']`。
- 对称化以满足互易关系 `A_k VF[k][k'] = A_k' VF[k'][k]`：令 `G = (A_k VF[k][k'] + A_k' VF[k'][k])/2`，`VF[k][k'] = G/A_k`；**不再重新归一**，而是令 `F_sky[k] = 1 − Σ_k' VF[k][k']`（若出现负值，说明采样不足，报错）。射线用确定性 RNG（§08.4）。
- 使用方式（气候模块）：
  - 入射长波（到达大气顶）`LW_ring(k) = Σ_k' VF[k][k'] · OLR̄(k')`（OLR̄ 为环向平均）。
  - 入射反射短波 `SW_ring(k) = Σ_k' VF[k][k'] · SWup̄(k')`（日均反射短波的环向平均；对面通常处于相反地方时，因此近似为“夜间环光”）。
  - 能量守恒：所有模块把 `LW_ring`、`SW_ring` 作为额外入射，同时 OLR 不作修改（发出的辐射有 (1−F_sky) 被对面吸收，恰由对方的入射项体现）。测试见 §02.9。

## 02.7 细尺度光照接口（供 §04.5、§07 使用）

```rust
/// 某 σ 处、某时段内的代表性太阳方向（局地 ENU 坐标）及权重（W/m²·占比），已含全局自遮挡
fn sun_samples(&self, s: f64, day_range: Range<f64>, n: usize) -> Vec<SunSample>;
pub struct SunSample { pub dir_enu: DVec3, pub irradiance: f64, pub weight: f64 }
```

局地方向 `(s·e_u, s·e_σ, s·n)`。细尺度模块再叠加地形地平线遮挡与坡向。

## 02.8 API 汇总

```rust
pub struct OrbitalElements { pub a: f64, pub e: f64, pub lon_peri: f64, pub obliquity: f64 }
pub struct Astro { /* orbit config, spin (omega, theta0), precession, body ref */ }
impl Astro {
    pub fn elements_at(&self, t_yr: f64) -> OrbitalElements;
    pub fn sun_state(&self, el: &OrbitalElements, t_sec: f64) -> SunState; // S, d, δ, u_sun, s_body
    pub fn precession_period_yr(&self) -> f64;
}
pub struct ShadowTable { /* ... */ }         impl ShadowTable { pub fn visibility(&self, s: f64, h: f64, decl: f64) -> f32; }
pub struct QTable { /* q(σ,δ) */ }           impl QTable { pub fn q(&self, s: f64, decl: f64) -> f64; }
pub struct InsolationTable { /* n_s × n_day */ } impl InsolationTable { pub fn daily_mean(&self, s: f64, day: f64) -> f64; }
pub struct ViewFactors { pub n: usize, pub vf: Vec<f32>, pub sky: Vec<f32> }
```

世界目录产物：`astro/shadow.bin`、`astro/insolation_present.bin`、`astro/viewfactor.bin`、`astro/report.json`（年长、日长、进动周期、各代表 σ 的年均日照、最大季节振幅）。

## 02.9 验收测试（T20–T21）

1. 开普勒：残差 < 1e-13；e=0 时 d 恒定；λ=90° 时 δ=ε。
2. 外赤道日均 = `S cos δ/π`（无遮挡），相对误差 < 1e-4；环顶 (n=ẑ)，δ>0 时 = `S sin δ`。
3. δ=0 时内赤道（σ=L_m/2）所有 μ>0 的时角均不可见。
4. 对称性：`V(σ,H,δ)` 的两条镜像关系在 10⁴ 随机样本上一致。
5. **截面积守恒**：对随机太阳方向，Σ_cells S·A·max(0,μ)·V（L0 的 1/16 分辨率网格，瞬时）= S·A_proj，其中 A_proj 用垂直于太阳方向平面上 2000×2000 点阵的射线命中数独立估计；相对误差 < 0.5%。
6. 视角因子：外赤道 VF 行和 < 1e-3；每行和 ≤ 1；对称化后互易关系精确成立（< 1e-12）；对称化前的互易残差 < 5%（衡量采样充分性）。
7. 预览图：`previews/astro/insolation_hovmoller.png`（σ × 日 的日均日照）、`annual_mean.png`、`daylight.png`、`sky_view.png`，以及一张二至日与二分日的星球三维光照渲染（§08.6）。
