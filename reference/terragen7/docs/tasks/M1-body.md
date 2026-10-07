# M1 · 星体几何与重力任务卡

---

### T10 geom：子午线、标架、度量、LevelSpec、坐标映射、离散算子

- 依赖：T03｜模型：Sonnet 5｜难度：中
- 必读：§01.1–01.3、§01.7、§00.3（D2–D4）

**交付**：
1. `tg-geom::meridian`：`Meridian`（M 点等弧长，数组 rho/z/drho/dz/kappa，L_m，R_ref，截面积，体积，形心）；`Meridian::circle(R, r, M)`；`Meridian::from_contour(points)`（闭合折线 → 等弧长重采样，周期三次样条，起点置于 ρ 最大且 z=0 处，逆时针，强制镜像对称）；`eval(σ) -> (ρ, z, ρ', z', κ)`（周期三次 Hermite）。
2. `tg-geom::frame`：`position(u, σ, h)`、`frame(u, σ) -> Frame { e_u, e_s, n }`、`inverse(p) -> (u, σ, h)`（u = atan2；σ 为子午面内最近点：先在 M 点上粗搜，再牛顿迭代）。
3. `tg-geom::metric`：`row_metric(&Meridian, nu, ns) -> RowMetric`（§01.3.2，面积用 Simpson 5 点积分），`x_scale(σ)`。
4. `tg-geom::level`：由配置与子午线计算 N⁰（16 的倍数）、`LevelSpec`（§01.7）；构造网格与气候网格的 `GridSpec`（由各自格距配置，ns 取偶数以保持镜像对称）；把派生量写入 `Derived`。
5. `tg-core::ops`（新文件）：基于 `RowMetric` 的梯度、散度（面通量形式）、变系数扩散算子 `div(D grad f)`、Laplacian。

**验收**：§01.8 第 1–3 条全部；另测：`from_contour(circle 采样点)` 与 `circle` 的差 < 1e-6·r；`LevelSpec::center/cell_of` 互逆；earth 与 mini 预设的 N⁰、最终分辨率打印并落在 [0.98, 1.02] m（mini 若超出请报告）。

**审查图**：`artifacts/T10/metric_rows.png`（ρ_j、面积 A_j 随 j 的折线图）。

---

### T11 ★ geom：SCF 平衡形状

- 依赖：T10｜模型：Sonnet 5｜难度：高
- 必读：§01.4（全部）、§01.5 第一条、§02.3（需要转动惯量）

**交付**（`tg-geom::scf`）：
1. `agm_k(k2: f64) -> f64`（第一类完全椭圆积分，AGM）；`ring_potential(a, z0, rho, z, dm) -> f64`（§01.4.1，含镜像源的版本另起函数）。
2. `ScfParams { rho_a, rho_b, density, grid: (n_rho, n_z), max_iter, tol }`；`ScfResult { meridian, omega, mass, volume, inertia_c, inertia_a, density_grid: Grid2D, potential_grid, iterations, residual }`。
3. `solve(&ScfParams) -> Result<ScfResult, ScfError>`：§01.4.3 全部步骤（初值、Φ_g 计算含近场 8×8 子采样、Ω² 与 C、洪泛连通、分数占据、欠松弛、收敛判据、粗→细两级）。`ScfError::{NoEquilibrium, NotConverged { residual }}`。
4. 等值线提取（marching squares，Ψ=0，z≥0）→ 镜像 → `Meridian::from_contour`。
5. `rigid(R, r, density, rotation_period)`：圆截面 + 均匀密度，返回同样结构（omega 取给定值），并计算表面 Ψ 起伏与“等效大地水准面偏差”。
6. 转动惯量 `C = ∫ρ² dm`、`A = ∫(ρ²/2 + z²) dm`（对密度网格积分）。

**实现提示**：Φ_g 计算是热点：按目标点并行，源单元只遍历 D>0 的单元（预先收集列表），每对源-目标同时处理镜像源；AGM 迭代 5–6 次即收敛到双精度。

**验收**：§01.8 第 4 条全部；另测：AGM 与已知值 K(k²=0.5) = 1.854074677301372 比对（< 1e-14）；远场（距离 ≫ 环尺寸）环势 → −G·dm/d；earth 与 mini 预设给出 Ω、日长、质量、表面积、R/r 形状偏差（写入报告）；耗时 256×128 终算 < 3 min（16 线程）。

**审查图**：`artifacts/T11/meridian_vs_circle.png`（平衡截面与初始圆的对比折线）、`artifacts/T11/convergence.png`（Ω² 与 max|ΔD| 随迭代）、`artifacts/T11/psi_field.png`（Ψ 场色图，边界等值线叠加）。

---

### T12 geom：重力表、科里奥利、SDF、Body、figure 阶段、三维渲染

- 依赖：T11、T04｜模型：Sonnet 5｜难度：中
- 必读：§01.5–01.8、§08.3、§08.6（环面三维渲染）

**交付**：
1. `tg-geom::gravity`：`GravityTable::build(&ScfResult, &Meridian)`（§01.5：1024 σ × 17 高度，有效位势含离心项，中心差分梯度，切向残差比）；查询 `g(σ, h)`；`coriolis(σ)`、`beta(σ)`、`f_tilde(σ)`。
2. `tg-geom::sdf`：`Sdf2::build(&Meridian, res)`（2048×1024；最近线段距离用分桶加速，符号由射线交叉判定内外；近表面查询按 §01.6 精确细化）；`distance(p: DVec3)`；`ray_hits_body(origin, dir, t_max) -> Option<f64>`（§01.6 球追踪）。
3. `tg-geom::body::Body`（§01.7 全部方法）；`Body::save(dir)`/`Body::load(dir)`（`figure/meridian.bin`、`figure/gravity.bin`、`figure/sdf.tgf`、`figure/scf.bin`（含密度网格与转动惯量））。
4. `tg-pipeline`：S0 `init`（配置校验、派生参数）与 S1 `figure` 阶段（SCF 或 rigid → Body → 写 `[derived]`：Ω、T_rot、质量、L_m、R_ref、N⁰、各层分辨率 → `figure/report.json`）；`tg-cli`：`terragen run <dir> --until figure`。
5. `tg-viz::globe`：CPU 光线追踪渲染（相机位置/朝向/视场、方向光、阴影射线、`texture: Fn(u, σ) -> [u8;3]`、可选位移 `Fn(u, σ) -> h` 与夸张倍数、背景星空纯黑）；`terragen render <dir> globe`（此阶段纹理为经纬棋盘 + 外/内赤道着色）。

**验收**：§01.8 第 2、5、6 条；另测：SDF——1000 个随机点中近表面（|d| < 4Δ）者与暴力精确距离一致（< 1e-6·r），其余误差 ≤ 1Δ；从赤道面外部指向原点的射线必命中、沿 z 轴穿过中心孔的射线不命中、沿外赤道切向外射的射线不命中、从内赤道指向对侧的射线命中；`Body::load(save(x))` 与原对象一致；rigid 模式下切向残差与“大地水准面偏差”被正确报告。

**审查图**：`artifacts/T12/g_vs_sigma.png`、`coriolis.png`、`globe_checker_oblique.png`（30° 俯视可见中心孔）、`globe_checker_edge.png`（侧视）、`figure_report.json`（拷贝）。
