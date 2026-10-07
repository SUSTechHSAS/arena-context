# M0 · 基础设施任务卡

通用约定（所有任务卡适用）：
- 审查图测试命名为 `preview_t{xx}_*`，标 `#[ignore]`，写入 `artifacts/T{xx}/`；`scripts/preview.sh Txx` 运行它们。
- 新增配置字段写在对应模块的配置节中，并在预设中给出规格里的默认值（不算 ICR）。
- 验收中的“规格测试”指所引规格章节末尾列出的测试条目，必须全部实现。

---

### T00 工作区骨架、脚本、git 初始化

- 依赖：无｜模型：Haiku 4.5｜难度：低
- 必读：§00、§08.1、§08.9、WORKFLOW §3/§9

**目标**：建立可编译的空工作区与工程约定，使后续任务互不冲突。

**交付**：
1. `git init`，默认分支 `main`；首个提交 `T00: import plan docs` 仅包含现有 `docs/`；随后在分支 `task/T00-scaffold` 上完成其余工作。
2. 根 `Cargo.toml`：workspace（resolver 3），`[workspace.package] edition = "2024"`, `rust-version = "1.96"`；`[workspace.dependencies]` 列出 §08.1 允许的全部依赖（固定到当前最新稳定小版本）；§08.1 的 profile 设置（含 dev 的 `debug = "line-tables-only"`）；`[workspace.lints.rust] unsafe_code = "forbid"`。
3. `crates/` 下 13 个 crate（§08.1 列表），每个 `lib.rs` 只含 crate 级文档注释（用途一句话）与 `#![forbid(unsafe_code)]`；依赖关系按 §08.1 写入各 `Cargo.toml`（用 `workspace = true`）。`tg-cli` 为二进制 `terragen`，支持 `--version`。
4. `rust-toolchain.toml`（channel = "1.96"）、`rustfmt.toml`（max_width = 100）、`.gitignore`（`target/`, `artifacts/`, `worlds/`）、`.cargo/config.toml`（`[build] target-dir` 指向仓库根的 `target/`，供所有 worktree 共享，§08.1）。
5. 脚本（bash，`set -euo pipefail`）：
   - `scripts/check.sh`：`cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`
   - `scripts/slow.sh`：`cargo test --workspace --release -- --ignored --skip preview_`
   - `scripts/preview.sh <Txx>`：`mkdir -p artifacts/<Txx> && cargo test --workspace --release -- --ignored preview_<txx小写> --nocapture`
6. `README.md`（中文）：项目一句话简介、目录结构、如何构建与运行检查、文档入口。

**验收**：`cargo build --workspace` 成功；`scripts/check.sh` 通过；`cargo run -p tg-cli -- --version` 输出版本；`git log` 中 main 上有首个文档提交。

**非目标**：任何实际功能代码。

---

### T01 core：配置、预设、常量、RNG、哈希噪声、岩石与材料表

- 依赖：T00｜模型：Sonnet 5｜难度：中
- 必读：§00.7、§01.1、§08.2、§08.4、§03.2（Rock 列表）、§07.7（Material 列表），并浏览全部 `docs/plan/` 以收集配置参数

**交付**（`tg-core`）：
1. `consts`：G、σ_SB、R_gas（287.04 干空气）、c_p（1004）、L_v（2.5e6）、ρ_w（1000）、ρ_sw（1030）、ρ_ice（917）、ρ_m（3300）、YEAR、Ω_E、`G_EARTH_REF = 9.81`（仅用于规格中“以地球为参考”的缩放公式）等，带单位注释。
2. `config`：
   - 各节配置结构体（serde，`deny_unknown_fields`），**收集规格中所有写明“配置”或给出默认值的参数**，按节归类；默认值取规格值。
   - `Preset { Test, Mini, EarthLite, Medium, Earth, EarthG }` → 完整 `Config`（test/mini 使用 §00.7 的放大开发密度，并在配置中标记 `dev_density = true`）。
   - `Config::load(preset_or_file, overrides: &[(&str, &str)])`：预设 → 用户 TOML 深合并 → `--set a.b=v` 点路径覆盖（在 `toml::Value` 层合并后再反序列化）。
   - `validate() -> Result<(), ConfigError>`，错误信息指出字段路径。
   - `config_hash() -> u64`：规范化（键排序）序列化后哈希，与字段书写顺序无关。
   - `Derived` 结构体占位（网格尺寸、实际分辨率、Ω、年长…），可序列化到 `[derived]`。
3. `rng`：`mix64`、`fnv1a64`、`hash(seed, tag, a, b, c)`、`Xoshiro256ss`（`next_u64`, `f64` [0,1)、`normal`、`range`）、`Rng::from_hash(...)`。
4. `noise`：二维/三维整数格点梯度噪声（哈希取梯度，五次平滑插值）与 `fbm`；**周期版本**（§08.4）：`PeriodicNoise2::new(period_x, period_y, wavelength, tag)`，格点数取整、索引取模，保证在周期缝处连续；输入为全局平面坐标 f64（m）。
5. `rock`：`Rock` 枚举（§03.2），`RockProps { density, k_erod, weathering, color, class: Igneous|Sedimentary|Metamorphic|Unconsolidated }` 静态表。
6. `material`：`Material` 枚举（u8，§07.7），`MaterialProps { name, color, solid: bool, liquid: bool }`，`From<Rock>`。
7. `facies`：`Facies` 枚举（§03.2）及 `Facies → Rock`、`Facies → Material` 映射。

**验收**：
- 每个预设 `load + validate` 成功；非法值（R < r、levels = 9 等）得到指向字段的错误。
- 覆盖优先级测试（预设 < 文件 < `--set`）；`config_hash` 对键顺序不敏感、对任一值变化敏感。
- RNG 金标准测试：固定输入的 `hash`/`Xoshiro` 输出写成常量断言（首次生成后固定，防止无意改动）；`f64` 均值/方差统计检验。
- 噪声：均值≈0（|μ| < 0.02）、值域有界、连续性（相邻 1e-6 步长差 < 1e-4）、同坐标重复求值相同；周期性：`f(x + period_x, y) == f(x, y)` 且在 x = period_x⁻ 与 0⁺ 处连续。

**审查图**：`artifacts/T01/noise_fbm.png`（fbm 灰度图，需借用 T04 前可直接用 `image` crate 写灰度 PNG）。

---

### T02 core：周期网格与场、插值、IO、世界目录、CLI new/status

- 依赖：T01｜模型：Sonnet 5｜难度：中
- 必读：§01.3（全部）、§07.2（窗口矩形概念）、§08.3、§08.5、§08.8（new/status）

**交付**：
1. `tg-core::grid`：
   - `GridSpec { nu: usize, ns: usize }`，`wrap(i: i64, n) -> usize`（负数正确）。
   - `RowMetric { du, ds, rho_c: Vec<f64>, rho_face: Vec<f64>, area: Vec<f64> }`（按 §01.3.2 的定义；由 tg-geom 构造，这里另提供 `RowMetric::flat(nu, ns, dx, dy)` 供测试），方法 `dx(j)`、`d8_dist(j, k)`、`face_len_u()`、`face_len_s(j)`。
   - `Field2<T> { spec, data }`：`get/set(i: i64, j: i64)`（wrap）、`row(j)`、`par_rows_mut`、`map`、`zip_map`。
   - D8 邻居偏移常量（顺序 E, NE, N, NW, W, SW, S, SE，与 §05.2 一致）。
   - `IRect { i0, j0, w, h }`（允许跨周期边界），`extract_rect(&Field2, IRect) -> Field2`（非周期副本）、`insert_rect`。
2. `tg-core::sample`：周期双线性、Catmull-Rom 双三次、保单调三次（限制器）；`upsample4_bicubic`（父→子，符合 §01.3.1 单元中心约定）、`downsample4_mean`（面积加权）。
3. `tg-core::io`：`.tgf` 读写（§08.5，五种 dtype，瓦片 256，zstd 3，按矩形随机读取含 wrap）、`.tgw` 多字段容器、`postcard` 封装（magic + version）。
4. `tg-core::world`：世界目录布局创建、`Manifest`（serde_json，§08.3 字段）、`Stage` 枚举 S0–S8（init, figure, astro, tecto-deep, coupled, climate, eco, hydro, assets，§08.3）、`StageRunner` trait（`fn name()`, `fn run(&mut WorldCtx) -> Result<()>`）与按序执行/跳过已完成阶段的运行器骨架、`peak_rss_mb()`、`tracing` 日志初始化（同时写 `logs/run.log`）。
5. `tg-cli`：`terragen new <dir> --preset --seed --set ...`（写 `world.toml` 与 manifest）、`terragen status <dir>`（打印阶段表）。

**验收**：
- `.tgf` 各 dtype 往返；f16 误差符合半精度；跨周期边界的矩形读取与直接取值一致；损坏/版本不符文件报错。
- 插值：双线性与双三次对线性函数精确；周期边界处连续；`downsample4_mean(upsample4_bicubic(x))` 与 x 的相对 L2 误差 < 5%（平滑场）。
- 平坦度量上 `RowMetric` 面积和 = nu·ns·dx·dy。
- `terragen new` 后 `status` 显示全部阶段 pending；重复 new 到非空目录报错。

**审查图**：无（可选 `artifacts/T02/upsample_demo.png`）。

---

### T03 core：求解器

- 依赖：T02｜模型：Sonnet 5｜难度：中
- 必读：§01.3.3、§05.4、§05.6、§08.4

**交付**（`tg-core::solve`）：
1. 三对角：Thomas（非周期）与周期（Sherman–Morrison）；按行/列批量并行求解。
2. **度量 ADI 扩散**：求解 `∂f/∂t = (1/A_j)·[u 向面通量差·Δs + σ 向面通量差·ρ_face·Δu]`，面系数 `D_u`（每个 u 面）、`D_s`（每个 σ 面）由调用方给出（可为 0 以切断通量，如跨板块）；模式：全周期 / 带 Dirichlet 掩码（固定单元，用于窗口 halo 与河道约束）。采用 Douglas 或 Peaceman–Rachford 分裂（无条件稳定）。
3. PCG（Jacobi 预条件）求解同一算子的隐式步 `(I − dt·L) f = rhs`，作为 ADI 的参照与后备。
4. 确定性归约：`det_sum(&[f64])`（固定块大小 4096 部分和再顺序求和）、`det_sum_rows(field, |row| -> f64)`。
5. 网格 Dijkstra：多源、度量边长（`RowMetric::d8_dist`）、半径上限、可通行掩码、可选边权乘子（用于 §03.10 随机边权）；堆键 `(dist, index)` 用 `total_cmp` 保证确定性；返回距离场与最近源 id。

**验收**：
- 平坦度量：高斯脉冲扩散与解析解相对 L2 误差 < 1%，时间与空间二阶收敛。
- 环面度量（用 `RowMetric` 手工构造圆截面 ρ(σ)）：周期模式下 Σ f·A 守恒（相对 1e-12）；稳态解与 PCG 一致（< 1e-8）。
- Dirichlet 掩码单元值不变；面系数为 0 的两侧无通量交换。
- Dijkstra：小网格与暴力全对最短路一致；半径上限生效；确定性（1 与 16 线程/多次运行一致）。

**审查图**：`artifacts/T03/adi_torus.png`（环面度量下扩散前后对比，可在 T04 合并后补）。

---

### T04 viz 基础

- 依赖：T02｜模型：Haiku 4.5｜难度：低
- 必读：§08.6（平面地图、帧序列部分）、§01.3.2

**交付**（`tg-viz`）：
1. 色表：地形+海深分层设色（海平面处有明显断点）、感知均匀顺序色表（自定 9 个控制点插值）、发散色表、16 色分类色表；`Colormap::map(v, lo, hi) -> [u8; 3]`，NaN 映射为品红色（便于发现问题）。
2. `render_field(&Field2<f32>, cmap, lo, hi) -> RgbImage`；按 §08.6 把外赤道行放在图像垂直中央（σ 平移 L_m/2 行…按行号平移 ns/2 即可）；宽度超过 2048 时最近邻缩小。
3. 晕渲：`hillshade(&Field2<f32>, &RowMetric, azimuth, altitude) -> Field2<f32>`（坡度用真实 dx_j、Δσ），与色图相乘混合。
4. 叠加：折线（带宽度，Bresenham + 圆刷）、点、掩码着色。
5. 无文字渲染；每张图旁写 `<name>.json`（色表、范围、单位、σ 平移说明）。
6. 帧序列写出与 GIF 合成（`image` 的 gif 功能）。
7. 简单图表：`plot::line_chart(series, w, h)` 与 `plot::scatter`（坐标轴 + 网格线，无文字；数据范围与图例写入同名 JSON），供后续任务画剖面、收敛曲线、Hovmöller 以外的一维诊断。

**验收**：图像尺寸正确；平面的晕渲为常数；色表端点与 NaN 颜色正确；GIF 帧数正确；折线图在给定数据范围内正确落点（抽查像素）。

**审查图**：`artifacts/T04/cmaps.png`（所有色表色带）、`artifacts/T04/hillshade_demo.png`（解析函数 `sin·cos` 地形的晕渲）。
