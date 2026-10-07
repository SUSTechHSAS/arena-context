# 08 · 基础设施：工程结构、数据格式、确定性、CLI、可视化、指标

## 08.1 Cargo 工作区

```
TerraGen7/
  Cargo.toml            (workspace, edition 2024, resolver 3)
  crates/
    tg-core/            配置、常量、RNG/哈希噪声、网格与场、求解器、IO、岩石/材料表
    tg-geom/            子午线、度量、SCF、重力、SDF、坐标映射          (依赖 core)
    tg-astro/           轨道、太阳、自遮挡、日照表、视角因子             (core, geom)
    tg-surface/         流向、河流、坡面、冰川、均衡、海洋、LEM 驱动      (core, geom)
    tg-climate/         EBM、降水模拟器、GCM、降尺度                      (core, geom, astro)
    tg-tecto/           板块构造                                          (core, geom, surface)
    tg-eco/             土壤、植被、个体植物                              (core, geom, climate, surface, tecto)
    tg-pipeline/        阶段编排 S0–S8、Phase A/B 驱动、检查点            (以上全部 + viz, metrics)
    tg-refine/          窗口、缓存、河流细化、各层配方、地层几何 strat、World API (core, geom, astro, surface, climate, eco, tecto)
    tg-voxel/           材料柱、体素块、导出                              (core, geom, refine)
    tg-viz/             色表、晕渲、地图、环面三维光线追踪渲染、帧序列      (core, geom, astro)
    tg-metrics/         真实性指标与报告（只接受普通场/数组输入）          (core, geom)
    tg-cli/             二进制 `terragen`                                 (全部)
  docs/  scripts/  tests/(跨 crate 集成测试放 tg-pipeline/tests)
```

Phase B 的耦合逻辑放在 `tg-pipeline`，避免 `tg-tecto` 与 `tg-surface` 循环依赖（`tg-tecto` 只调用 `tg-surface` 的侵蚀核）。

**允许的外部依赖**（其余需在报告中申请）：`rayon`, `serde`(derive), `serde_json`, `toml`, `postcard`, `zstd`, `bytemuck`, `half`, `glam`(f64 类型), `image`(png, gif), `clap`(derive), `tracing`, `tracing-subscriber`, `thiserror`, `anyhow`, `rustfft`, `smallvec`；dev：`approx`, `criterion`。
**禁止**：任何噪声/地形生成 crate、GPU crate、`unsafe` 代码（全工作区 `#![forbid(unsafe_code)]`）。

发布配置：`[profile.release] lto = "thin", codegen-units = 1`；`[profile.dev] opt-level = 1, debug = "line-tables-only"`；`[profile.test] opt-level = 2`（数值测试需要速度）。

**磁盘**：所有 worktree 通过环境变量 `CARGO_TARGET_DIR=/home/kibi/Work/TerraGen7/target` 共享构建目录（写入 `.cargo/config.toml` 的 `[build] target-dir`）；并发 worktree ≤ 2。

## 08.2 配置（`tg-core::config`）

- TOML，顶层节：`[world] seed, preset, name, levels`、`[figure]`、`[orbit]`、`[atmosphere]`（p_s、CO2、RH_0…）、`[ocean]`（`ocean_depth_equiv_m`、混合层）、`[tectonics]`、`[surface]`、`[climate]`、`[eco]`、`[refine]`、`[output]`、`[budget]`（线程数、内存/缓存上限）。
- 预设（§00.7）先填充全部字段，用户 TOML 覆盖，CLI `--set a.b=v` 再覆盖。
- `validate()`：范围检查（R > r > 0、R/r ≥ 1.5、0 ≤ e < 0.3、levels ∈ [4, 7] …）并给出可读错误。
- 派生参数（网格尺寸、实际分辨率、Ω、年长等）在 S0/S1 后写入 `world.toml` 的 `[derived]` 节。
- `config_hash()`：对规范化 TOML（排序键）做 64 位哈希，进入缓存键与 manifest。

## 08.3 世界目录与阶段

```
<world>/
  world.toml  manifest.json
  figure/  astro/  tecto/  l0/  climate/  rivers/  eco/
  cache/L1..L6/  cache/rivers/  cache/dunes/
  previews/<stage>/   logs/
```

- 阶段：S0 init、S1 figure、S2 astro、S3 tecto-deep、S4 coupled、S5 climate、S6 eco、S7 hydro、S8 assets（§00.4）。
- `manifest.json`：每阶段 `{status: pending|running|done, started, finished, elapsed_s, peak_rss_mb, code_version, config_hash, outputs: [..]}`。
- 阶段运行器：`run(until)` 依次执行未完成阶段；阶段内部长任务（Phase A/B）有自己的检查点，可从最近检查点续跑。配置或代码版本变化时拒绝续跑并提示。
- 峰值内存从 `/proc/self/status` 的 `VmHWM` 读取并记录。

## 08.4 确定性与随机数（`tg-core::rng`）

- `fn mix64(x: u64) -> u64`：SplitMix64 终结函数。
- `fn hash(seed: u64, tag: &'static str, a: i64, b: i64, c: i64) -> u64`：`tag` 先经 FNV-1a 得 64 位常量，依次 `h = mix64(h ^ v)` 折叠。
- `Rng`：xoshiro256**，由 `hash(...)` 播种；每个独立用途一个流，禁止跨用途共享流。
- 哈希噪声（仅用于初始条件/材料扰动）：整数格点梯度噪声 + 分形叠加，自实现，在**全局平面坐标**求值，且**必须周期**：给定期望波长 λ，x 向格点数 `n_x = max(1, round(2πR_ref/λ))`、y 向 `n_y = max(1, round(L_m/λ))`，格点索引对 n_x、n_y 取模（实际波长略作调整），保证跨 u=0 与 σ=0 的周期缝连续。坐标用 f64，格点索引用 i64。
- 规则（审查必查）：
  1. 不依赖 `HashMap/HashSet` 迭代顺序（用 `BTreeMap` 或排序后迭代）。
  2. 浮点归约顺序固定：按固定大小块（如每行）部分和，再按块序顺序求和；禁止 `par_iter().sum()` 直接用于浮点。
  3. 并行写只写互不重叠的输出区域。
  4. 不使用时间、线程 id、地址作为随机源。
- 通用测试工具 `tg_core::testing::assert_deterministic(|threads| run(...))`：用 1 与 N 线程的专用 rayon 线程池分别运行并比较字节哈希。

## 08.5 数据格式

- **`.tgf` 场文件**：小端；头 `magic "TGF1", version u32, dtype u8 (F32|F16|U8|U16|I16), nu u64, ns u64, tile u32, meta_len u32, meta(JSON)`，随后瓦片索引表（每瓦片 offset u64, len u32），瓦片 zstd(level 3) 压缩、行主序。支持按矩形区域随机读取（周期 wrap）。
- **`.tgw` 窗口缓存**：同一格式的多字段容器（字段名 → 子块）。
- **结构化数据**（河网、湖泊、板块表、日照表等）：`postcard` 序列化，外包一层 `{magic, version, payload}`。
- **PLY 导出**：顶点坐标用 `double`（嵌入式网格坐标可达 ~10⁷ m，f32 精度不足）。
- **`.tgc` 体素块**：头 + 32768 字节材料（zstd）+ 1024 × f32 地表高程 + `x_scale`。
- 所有格式带版本号，读到不支持的版本报错而不是猜测。

## 08.6 可视化（`tg-viz`）

- **平面地图**：y 轴为 σ，默认把外赤道放在图中央、内赤道在上下边缘；x 轴为 u（按 D3 比例）。色表：地形分层设色（含海深）、自实现感知均匀顺序色表、发散色表、分类色表；晕渲使用真实度量的坡度；叠加层：河网（线宽 ∝ log Q）、板块边界（按类型着色）、湖泊、冰川、等值线；简单色标。
- **环面三维渲染**：CPU 光线追踪，相机在空间中，球追踪 SDF（可选高程夸张 ×20 位移），纹理取 L0 场（高程/生物群系/温度），太阳方向按指定日期时刻计算，含阴影射线——直观展示内侧自遮挡与季节。默认 1280×800 PNG。
- **帧序列**：构造/Phase B 每 N Myr 一帧 PNG，可选 GIF。
- **细层**：区域晕渲图、L0→L6 缩放序列拼图、体素块等轴测渲染（简单体素光线步进）。
- 所有预览写入 `<world>/previews/` 与任务审查目录 `artifacts/<Txx>/`。

## 08.7 真实性指标（`tg-metrics`）

输出 `previews/metrics.json` 与 `metrics.md`。以下区间是**合理性护栏**，不是调参目标；执行者如为通过指标而改参数，必须在报告中写明。

| 指标 | 期望区间 |
|---|---|
| 高程直方图 | 双峰（陆/洋），峰距 > 3 km |
| 海洋面积占比 | 0.5–0.8（默认水量下）|
| 一维行剖面功率谱斜率（10–1000 km）| −2.6 ~ −1.6 |
| 坡度–面积凹度 θ（河道单元）| 0.35–0.6 |
| Hack 指数 h | 0.5–0.65 |
| Horton 分叉比 R_b / 长度比 R_l | 3–5 / 1.5–3.5 |
| L3–L4 山地瓦片坡度分布 | 众数 15°–35°，> 45° 占比 < 10% |
| 生物群系 Whittaker 符合率 | ≥ 90% |
| 年均温/年降水全球分布 | 无非物理值（< 150 K、> 350 K、负降水）|

## 08.8 CLI（`terragen`）

```
terragen new <dir> --preset mini --seed 42 [--set section.key=value ...]
terragen run <dir> [--until figure|astro|tecto|coupled|climate|eco|hydro|assets] [--threads N]
terragen status <dir>
terragen render <dir> map --field elevation|biome|temp|precip|plates|... [--out f.png]
terragen render <dir> globe [--day D --hour H --field F --exaggerate 20]
terragen render <dir> frames --stage tecto|coupled
terragen render <dir> atlas
terragen render <dir> voxels --u DEG --s KM --size CELLS
terragen region <dir> --level L --u DEG --s KM --size CELLS --out r.png|r.tgf
terragen chunks <dir> --u DEG --s KM --radius-m 256 --out <dir>
terragen mesh <dir> --level L --u DEG --s KM --size CELLS [--embedded] --out m.ply
terragen metrics <dir>
terragen bench <dir> [--region-km2 1]
```

## 08.9 编码规范

- 公共项必须有文档注释（中文或英文均可，代码标识符英文）；注释密度适中，解释物理含义与单位。
- 库中不使用 `unwrap()`（测试除外）；不变量用 `expect("原因")`；库错误用 `thiserror`，CLI 用 `anyhow`。
- 日志用 `tracing`；长任务每 ≥ 5 s 输出一次进度。
- 无全局可变状态；物理常量集中在 `tg-core::consts`；需要 g 的地方一律调用 `Body::g`（§01.5）。
- 测试分层：`cargo test`（快速，用 `test` 预设，全工作区 < 3 min）；`cargo test --release -- --ignored`（慢速，mini 预设长程）。
- 脚本：`scripts/check.sh`（fmt --check、clippy -D warnings、快速测试）、`scripts/slow.sh`（慢速测试）、`scripts/preview.sh <task>`（生成该任务的审查图到 `artifacts/<task>/`）。
- `artifacts/` 与 `worlds/` 加入 `.gitignore`（审查在本机读取）。

## 08.10 性能记录

- 每阶段记录耗时、峰值内存到 manifest；`terragen bench` 汇总。
- 任务报告必须附上相关阶段在 `mini`（以及能跑时的 `earth` 估算）上的耗时与内存。
- 预算超标 > 50% 的任务不得标记完成，须在报告中给出剖析结果与优化方案。
