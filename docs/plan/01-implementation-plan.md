# 01 · AerraGen 实现计划（完善版，供审核）

- 状态：**草案 v3** —— 基于 `reference/terragen7/docs/plan/`（v1.1）经 `docs/plan/00-audit.md` 审查修订而成；**待 Kibiandkimi 批准后才开始实现**（TASK.md 首个工作单元）。
- v3 变更（第 2 轮 plan-review，见 `docs/plan/04-refinement-log.md`）：数值复核脚本化（`docs/plan/analysis/verify_plan_numbers.py` + `verify_output.txt`）；新增 §1.4.0 派生网格与预算口径；修订 §4.1 G1 判据与可行性数值、§4.10 导出重采样规格（D1 方案 C′）、§5 存储预算实数、§9 环境风险（新决策 D8）、§10 差异 Δ13–Δ18。
- 项目：AerraGen —— 三维环面星球的过程地形生成（Rust）
- 任务：Issue #1；评审者：Kibiandkimi；提交：SUSTechHSAS（Arena 协议，PR 到 `AerraGen-main`，禁止自动合并）
- 编写日期：2026-10-07（UTC）

> 章节编号在本系列文档内稳定。参考文档中的详尽参数表（岩石属性、PFT 表、相枚举等）以参考计划为蓝本，本文只增补/修订与审查相关的条款；实现时的唯一依据是**经人工批准后的本文档 + 参考规格中未被修订的部分**。

## 01.1 目标与范围

### 01.1.1 目标（户主要求，原文见 `.context/OWNER_REQUEST.md`）

通过模拟真实地理过程生成三维环面星球的地形：覆盖地形形成全过程（星体平衡形状与重力 → 自转/公转/光照/季节 → 板块构造 → 地表过程 → 气候 → 土壤与生态 → 逐级细化到 1 m³ 体素）；地形较噪声更接近真实；计算量可接受（可非实时）；二维环面世界、平面化映射减少拉伸；三维环面物理不套球体物理；星球大小类似真实星球且可配置；按需生成；Rust 实现。

### 01.1.2 非目标

- 不做实时渲染引擎/游戏；只提供库 API、CLI、导出与预览图。
- 不追求地球物理学研究级精度；追求"机制正确、量级正确、形态统计接近真实"。
- 不模拟生命演化；生物圈按类地假设（植物功能型 PFT）。
- 不使用任何噪声/地形生成 crate；形态由过程塑造，噪声仅作初始条件与材料扰动（参考 D7）。

## 01.2 总体架构

### 01.2.1 管线（S0–S8，同参考 §00.4，闸门见 §7）

```
S0 init        配置校验，派生参数（网格尺寸、层级、时间表、预算）
S1 figure      SCF 平衡形状 → 子午线、度量、重力/位势表、大地水准面、Ω、f(σ)   [闸门 G1]
S2 astro       轨道/自转 → 太阳方向 → 自遮挡日照表 Q(σ,日,时) → 环间视角因子
S3 tecto-deep  Phase A：板块构造长期演化（默认 −2.0 Ga → −100 Ma），粗 LEM + EBM
S4 coupled     Phase B：构造 + L0 高分辨率地貌演化（LEM）+ 气候 + 冰川（−100 Ma → 0）
S5 climate     现代气候：简化 GCM（两层 σ 原始方程）多年积分 → 月气候态
S6 eco         土壤、植被/生物群系（与气候 1 次反馈迭代；反馈后为最终气候）
S7 hydro       最终水文：流向、湖泊、河网矢量化（流量、宽深）、L0 流量场、波浪风区
S8 assets      全局共享资源：细化谱斜率表、沙丘周期纹理
（按需）       查询驱动：L1..L6 窗口细化 → 1 m 高度/材料 → 体素块导出
```

每个阶段写检查点到世界目录，可断点续跑（§5、§8）。

### 01.2.2 Crate 工作区（同参考 §08.1）

| crate | 职责 | 依赖 |
|---|---|---|
| `tg-core` | 配置/预设/常量、RNG 与哈希噪声、周期网格与场、求解器、IO、岩石/材料表 | — |
| `tg-geom` | 子午线、度量、SCF、重力、SDF、坐标映射 | core |
| `tg-astro` | 轨道、太阳、自遮挡、日照表、视角因子 | core, geom |
| `tg-surface` | 流向、河流、坡面、冰川、均衡、海洋、LEM 驱动 | core, geom |
| `tg-climate` | EBM、降水模拟器、GCM、降尺度 | core, geom, astro |
| `tg-tecto` | 板块构造 | core, geom, surface |
| `tg-eco` | 土壤、植被、个体植物 | core, geom, climate, surface, tecto |
| `tg-pipeline` | 阶段编排 S0–S8、Phase A/B 驱动、检查点 | 以上全部 + viz, metrics |
| `tg-refine` | 窗口、缓存、河流细化、各层配方、地层几何 `strat`、World API | core, geom, astro, surface, climate, eco, tecto |
| `tg-voxel` | 材料柱、体素块、导出 | core, geom, refine |
| `tg-viz` | 色表、晕渲、地图、环面三维渲染、帧序列 | core, geom, astro |
| `tg-metrics` | 真实性指标与报告（只接受普通场/数组输入） | core, geom |
| `tg-cli` | 二进制 `terragen` | 全部 |

Phase B 的耦合逻辑放在 `tg-pipeline`，避免 `tg-tecto` ↔ `tg-surface` 循环依赖。

### 01.2.3 允许依赖与禁止项（同参考 §08.1）

- 允许：`rayon`, `serde`(derive), `serde_json`, `toml`, `postcard`, `zstd`, `bytemuck`, `half`, `glam`, `image`, `clap`, `tracing`, `tracing-subscriber`, `thiserror`, `anyhow`, `rustfft`, `smallvec`；dev：`approx`, `criterion`。
- 禁止：任何噪声/地形生成 crate、GPU crate；全工作区 `#![forbid(unsafe_code)]`。
- 新增（审计 F12）：路径全部相对；构建目录由环境变量决定，不在仓库中写入绝对路径。

### 01.2.4 配置与世界目录（同参考 §08.2–08.3，预算可配置化）

- TOML 顶层节：`[world] seed, preset, name, levels`、`[figure]`、`[orbit]`、`[atmosphere]`、`[ocean]`、`[tectonics]`、`[surface]`、`[climate]`、`[eco]`、`[refine]`、`[output]`、`[budget]`（线程数、内存/磁盘/缓存上限——**审计 F3 新增**）。
- 预设（test / mini / earth-lite / medium / earth / earth-g）先填充全部字段，用户 TOML 覆盖，CLI `--set a.b=v` 再覆盖。预设参数见参考 §00.7；星球"大小"口径见开放决策 D2。
- `world.toml` 的 `[derived]` 节记录派生参数（网格尺寸、实际分辨率、Ω、年长等）；`config_hash()`（规范化 TOML 的 64 位哈希）进入缓存键与 manifest。
- 世界目录结构同参考 §08.3；`manifest.json` 记录每阶段 `{status, started, finished, elapsed_s, peak_rss_mb, code_version, config_hash, outputs}`；峰值内存读取 `/proc/self/status` 的 `VmHWM`。

## 01.3 物理假设与近似清单（PA-1..PA-12，审计 F2 要求明示）

| # | 假设/近似 | 层次 | 主要影响 | 验证手段 |
|---|---|---|---|---|
| PA-1 | 星体为旋转体环面（子午线闭曲线绕对称轴旋转），R/r = 4（可配置） | 几何 | 拓扑=矩形双周期，无极点；内侧存在自遮挡与环间辐射 | NX-01, NX-04, NX-09 |
| PA-2 | 均匀密度（不可压缩），无圈层分异 | 物理 | 简化重力与 SCF；质量-半径关系偏真实行星 | NX-04, NX-06 |
| PA-3 | 刚体自转（无较差自转），Ω 由 SCF 自洽决定 | 物理 | 科里奥利 f = 2Ωn_z 随 σ 变化；日长数小时级 | NX-04, NX-20 |
| PA-4 | 无黏性、无磁场、无卫星；近日点进动与黄赤交角/偏心率摄动按配置的周期振荡 | 物理 | 进动由转动惯量计算（环面特有：周期可能仅数千年） | NX-07, V10–V11 |
| PA-5 | 流体静力平衡形状由 SCF 求解；圆截面仅为初值；`figure.mode="rigid"` 为带警告的回退 | 数值 | 大地水准面 = 平衡形状表面；高程相对其度量 | 闸门 G1, NX-04 |
| PA-6 | 重力由轴对称质量分布的环形格林函数积分；禁止常量 9.81（除标注的地球参考值 `consts::G_EARTH_REF`） | 数值 | g 随 σ 与高程变化；低重力下挠曲更宽、山坡可更陡 | NX-06 |
| PA-7 | 板块为"尽可能刚性"的 3 自由度运动；环面上经向运动必然产生面内应变（压缩/拉伸），转化为地壳增厚/减薄 | 物理 | 环面特有；不回避应变 | NX-11 |
| PA-8 | 地表过程：ξ–q 河流侵蚀–沉积 + 线性/非线性坡面扩散 + 浅冰近似（SIA）+ 海洋沉积 + 挠曲均衡 | 物理 | 河流形态、冰川谷、陆架陆坡由过程塑造 | NX-13..NX-17 |
| PA-9 | 气候：EBM（能量平衡）→ 快速降水模拟器 → 两层 σ 简化 GCM；低重力与自遮挡必须体现（柱质量 p_s/g、干绝热直减率 Γ = 0.66 g/c_p、变号的 β） | 物理 | 多急流、窄环流、内侧强季节性；禁止预设三圈环流 | NX-18..NX-21 |
| PA-10 | 生态：PFT 竞争 + 桶模型水分平衡 + 火干扰；土壤为 Heimsath 型生产-侵蚀平衡 | 物理 | 生物群系与土纲由气候/地形/母质涌现 | NX-22, RS-08 |
| PA-11 | 细化层以过程配方（LEM 稳态、滑坡、阶地、冲积扇、三角洲、海岸、沙丘、岩溶）+ 确定性哈希噪声（仅初始条件/微起伏）叠加 | 数值 | 亚父层细节由过程与地层结构涌现，非纯噪声 | NX-23..NX-27 |
| PA-12 | 体素最小单位口径见**开放决策 D1**（默认推荐方案 C：内部名义 1 m 网格，导出重采样到严格 1 m³） | 工程 | 见 F1/D1；导出产物体积偏差阈值由 AC-1 按所选方案定义 | AC-1, NX-26, NX-28 |

## 01.4 各阶段实现细节

### 01.4.0 S0 派生网格与量化口径（第 2 轮新增；复核脚本见 `docs/plan/analysis/`）

**派生公式（参考 §01.3.1，实现必须逐字采用；NX-30 逐预设断言）**：令 `s0 = 4^levels` m（L0 格距，`levels` 默认 6 → 4096 m），
`L_m` = 子午线周长、`R_ref = (1/L_m)∮ρ dσ`（圆截面下 `L_m = 2πr`、`R_ref = R`）：

```
N_u^0 = 16·round(2πR_ref/(16·s0))      N_σ^0 = 16·round(L_m/(16·s0))
N^L   = N^0·4^L（L = 0..levels）       实际 L_max 格距：Δx_planar = 2πR_ref/N_u^levels，Δσ = L_m/N_σ^levels
```

由此可得闭式结论（用于验收口径，必须写进实现文档）：`Δσ = x/round(x)`，`x = L_m/(16·4^levels)`；
**只有 `x ∈ ℕ` 时 σ 向 L_max 格距才精确等于 1 m**。earth：`x = 172.57`（既非整数），只能取
`N_σ^0 = 172` 或 `173`，对应 `Δσ = 1.003330 m` 或 `0.997531 m`；若放宽 `N_σ^0` 为 16 的倍数
（窗口/瓦片步长 64/256 整除所必需，见 §4.9 与参考 §07.2），则**不存在** σ 向严格 1 m 的规则网格。u 向同理
（`Δx_planar = y/round(y)`）。这是 D1 方案 B/C 取舍的数学依据：**“全程严格 1 m³”在规则嵌套网格上不可实现**。

**逐预设定值（圆截面解析值；SCF 后 `L_m/R_ref` 略变，由 M1 回填）**：

| 预设 | levels | L0 格距 | L0 = N_σ^0 × N_u^0 | L0 格数 | Δσ(L_max) | Δx_planar(L_max) |
|---|---|---|---|---|---|---|
| test | 5 | 1024 m | 608 × 2448 | 1.49 M | 1.00920 m | 1.00260 m |
| mini | 6 | 4096 m | 608 × 2448 | 1.49 M | 1.00920 m | 1.00260 m |
| earth-lite | 7 | 16384 m | 688 × 2768 | 1.90 M | 1.00333 m | 0.99753 m |
| medium | 6 | 4096 m | 1376 × 5520 | 7.60 M | 1.00333 m | 1.00042 m |
| earth | 6 | 4096 m | 2768 × 11040 | 30.56 M | 0.99753 m | 1.00042 m |
| earth-g | 6 | 4096 m | 6512 × 26080 | 169.83 M | 1.00114 m | 0.99991 m |

- earth 全局 1 m 列数 = 1.1338e7 × 4.5220e7 = **5.13e14**（不可存储/不可全算，故必须有 §4.9 的按需细化）。
- 气候网格 earth 512×128：两方向格距均为 **88.357 km**（因 R = 4r）；构造网格 20 km → 1.279 M 格。
- **量化口径（消除审计的口径歧义）**：GB 一律为 10⁹ 字节；「峰值内存」为 `/proc/self/status` 的 `VmHWM`（KiB→MB 换算按 2²⁰）；耗时以 `T = cell_steps/(rate × cores)` 表达（§6）；所有区间含端点。
- 复核命令：`python3 docs/plan/analysis/verify_plan_numbers.py`（仅标准库，约 60 s；`--fine` 为高分辨率积分）；其输出 `verify_output.txt` 随本 PR 提交，覆盖 V1–V15 与上表。

### 01.4.1 S1 星体（`tg-geom::scf`，闸门 G1）

**算法（Hachisu 自洽场法的环面版本）：**

```
输入: ρ_A = R+r, ρ_B = R−r（外/内赤道半径）, ρ_d（均匀密度）, 网格 N_ρ×N_z（迭代 128×64，终算 256×128）
1. 初值 D = 圆截面（中心 (R,0)，半径 r）占据分数（单元内 4×4 子采样）
2. repeat:
   a. 全网格引力位势 Φ_g（环形格林函数，见下；利用 z 镜像对称；近场 ≤2 格距拆 8×8 子点；
      目标点并行，求和顺序固定——按 ρ 升序、z 升序扫描源单元）
   b. 由固定点 A=(ρ_A,0)、B=(ρ_B,0)：Ω² = 2(Φ_g(A)−Φ_g(B))/(ρ_A²−ρ_B²)，C = Φ_g(A) − ½Ω²ρ_A²；
      Ω² ≤ 0 → NoEquilibrium
   c. Ψ = Φ_g − ½Ω²ρ² − C；新占据 = {Ψ<0} 中与 (R,0) 连通的分量（洪泛填充，4 邻接）
   d. 边界单元分数 D = clamp(0.5 − Ψ/(|∇Ψ|·Δ), 0, 1)；欠松弛 D ← 0.5D_new + 0.5D_old
   e. 收敛：rel(Ω², C) < 1e-9 且 max|ΔD| < 1e-5，或 200 次后 NotConverged（附残差）
3. marching squares 提取 Ψ=0 等值线（z≥0），镜像得闭曲线，重采样等弧长 M=4096 → Meridian
4. 派生：Ω、T_rot、V、M、A、L_m、R_ref、GravityTable（σ×高程表）、Sdf2
```

- 环形格林函数：质量 dm 的细圆环（半径 a、高度 z₀）在 (ρ,z) 处：`Φ = −(2G dm/π)·K(k)/√((ρ+a)²+(z−z₀)²)`，`k² = 4aρ/((ρ+a)²+(z−z₀)²)`；K(k) 用 AGM 迭代至相对差 < 1e-15。**奇点处理**：k² > 0.9999 时用展开式 `K ≈ ln(4/√(1−k²))` 避免精度损失；目标点恰好在源单元中心时偏移 1e-6·Δ。
- 半平面网格：ρ ∈ [max(0, R−1.6r), R+1.6r]，z ∈ [0, 1.6r]。**边界条件**：网格外边缘 Φ_g 用单极矩近似（总质量集中于原点），误差 < 0.1%（验证：网格扩大 1.5× 后 Ω 变化 < 0.1%）。
- `Meridian`：闭合折线，等弧长 M 点，数组 `rho/z/drho/dz/kappa[k]`；周期三次 Hermite 插值；构造保证并测试 z=0 镜像对称；派生 A = 2π∮ρdσ、V = π∮ρ²z′dσ（周期梯形，谱精度）。
- 重力表：1024 个 σ 采样 × 17 个高程（−12 km .. +60 km），中心差分（步长 50 m，f64）；记录 g(σ,h) 与切向残差比 |g_tan|/|g|；查询：σ 周期三次 + h 线性插值。**精度保证**：f64 全程；位势求和用 Kahan 补偿求和（每目标点累积误差 < 1e-14·|Φ|）。
- SDF：旋转体性质 → 三维点到表面距离 = 子午半平面点到子午线的二维距离；预计算 2048×1024 f32 二维 SDF；球追踪 `ray_hits_body`（命中阈值 1e-4·r）。**SDF 构建**：对每条网格线段（共 M 段）用点到线段距离的解析公式，取所有线段的最小值（分桶加速：ρ 方向 64 桶，z 方向 32 桶，每点只检查相邻 3×3 桶内的线段）。

**可行性数值（第 2 轮独立积分，圆截面均匀密度；SCF 实算须以本组数为量级参考并覆盖报告）**：
`earth` 预设 `Ω² ≈ 1.622e-7 s⁻²`（`T_rot ≈ 4.334 h`，落在参考预期 2.5–5 h 内）、`(C−A)/C ≈ 0.485`
（细环极限 0.5）、进动周期 ≈ **3.0 kyr**（“数千年”成立）、外赤道有效表面重力 ≈ **3.36 m/s²**、
内赤道 ≈ 3.78 m/s²（内/外 ≈ 1.13）。**注意**：`2πGρr = 4.15 m/s²` 只是无限长圆柱近似，R/r=4 时
高估约 **19%**（薄环 R/r=20 时才降到 2.2%）——`02` 的 AC-2 与 NX-06 已据此改写，不得再把 4.15 m/s²
当作 earth 的验收目标。因 R/r 相同且 `ρ_d·r` 相同，`test/mini` 的放大密度方案**在设计上精确复现**
earth 的归一化重力（`g` 相同、`T_rot` 之比 = `√(ρ_mini/ρ_earth) = 2.1213`），这为 D6 提供了可断言依据。

**闸门 G1（可行性，审计 F2 新增 → 第 2 轮补齐实现细节）**：以下六项全部满足才通过，否则走回退路径并在报告中记录：

1. SCF 收敛（判据见 §4.1 迭代 2e）且 **Ω² > 0**；附最终残差。
2. 表面 Ψ 相对起伏 `(max−min)/|mean| < 1e-5`。
3. **质量记账守恒**：每次迭代结束计算 `M_iter = Σ ρ_d·D·(2π a)·ΔρΔz`，要求
   `|M_iter − M_0|/M_0 < 1e-6`（`M_0` 为初始圆截面质量），且**最终占据区必须是与 (R,0) 同属一个
   4 邻接连通分量的唯一分量**（洪泛填充后对全网格扫描分量标签；若出现第二分量或质量漂移超限 →
   报告并按 `NotConverged` 处理）。这就是“无经环孔质量流失”的可执行定义。
4. 网格加密一致性：128×64 与 256×128 的 Ω 相对差 < 1%（并记录 512×256 趋势）。
5. 镜像对称：`max|Ψ(ρ, z) − Ψ(ρ, −z)| / |Ψ| < 1e-6`（构造对称性与求解器）。
6. 薄环校验：`R/r = 20` 的算例中，截面轮廓相对圆的归一化偏差 < 2%·r。

**回退**：调整 R/r 或 Ω 上限；或 `figure.mode="rigid"`（圆截面 + 用户给定自转周期，
报告等效大地水准面偏差 `(max−min)Ψ/g`，> 100 m 时警告），并在 manifest 与报告中标注 `figure_mode=rigid`。

**数据结构（具体类型签名）**：

```rust
/// 子午线闭合折线（等弧长 M 点）
pub struct Meridian {
    pub rho: Vec<f64>,   // ρ(σ_k)，长度 M
    pub z: Vec<f64>,     // z(σ_k)
    pub drho: Vec<f64>,  // dρ/dσ（单位切向量分量）
    pub dz: Vec<f64>,    // dz/dσ
    pub kappa: Vec<f64>, // 曲率 κ(σ_k)
    pub l_m: f64,        // 子午线周长 (m)
    pub r_ref: f64,      // 平面化参考半径 (m)
    pub m: usize,        // 采样点数
}
impl Meridian {
    /// 圆截面（R, r, M=4096）
    pub fn circle(r_major: f64, r_minor: f64, m: usize) -> Self;
    /// SCF 输出重采样
    pub fn from_contour(points: &[(f64, f64)], m: usize) -> Self;
    /// 周期三次 Hermite 插值
    pub fn eval(&self, sigma: f64) -> (f64, f64, f64, f64); // (ρ, z, dρ/dσ, dz/dσ)
    pub fn rho(&self, sigma: f64) -> f64;
    pub fn drho(&self, sigma: f64) -> f64;
    pub fn kappa(&self, sigma: f64) -> f64;
    pub fn surface_area(&self, density: f64) -> f64; // A = 2π∮ρdσ
    pub fn volume(&self) -> f64;                      // V = π∮ρ²z'dσ
}

/// 重力/位势查询表（σ × 高程）
pub struct GravityTable {
    pub sigma_samples: Vec<f64>,  // 1024 个 σ 采样
    pub h_samples: Vec<f64>,     // 17 个高程 (m)
    pub g_magnitude: Vec<f32>,   // [1024×17] g 大小 (m/s²)
    pub tangential_ratio: Vec<f32>, // [1024×17] |g_tan|/|g|
}
impl GravityTable {
    /// σ 周期三次 + h 线性插值
    pub fn g(&self, sigma: f64, h: f64) -> f64;
    pub fn tangential_residual(&self, sigma: f64, h: f64) -> f64;
}

/// 星体（完整几何 + 物理）
pub struct Body {
    pub meridian: Meridian,
    pub omega: f64,     // 自转角速度 (rad/s)
    pub mass: f64,      // 总质量 (kg)
    pub density: f64,   // 均匀密度 (kg/m³)
    pub r_ref: f64,     // 平面化参考半径 (m)
    pub l_m: f64,       // 子午线周长 (m)
    pub gravity: GravityTable,
    pub sdf: Sdf2,      // 二维有符号距离场
}
impl Body {
    pub fn position(&self, u: f64, s: f64, h: f64) -> DVec3;       // P + h·n
    pub fn frame(&self, u: f64, s: f64) -> Frame;                    // e_u, e_σ, n
    pub fn rho(&self, s: f64) -> f64;
    pub fn drho(&self, s: f64) -> f64;
    pub fn g(&self, s: f64, h: f64) -> f64;                          // 查表 + 插值
    pub fn coriolis(&self, s: f64) -> f64;                           // f = 2Ω n_z
    pub fn x_scale(&self, s: f64) -> f64;                            // k(σ) = ρ/R_ref
    pub fn inverse(&self, p: DVec3) -> (f64, f64, f64);              // (u, σ, h) 最近点
}

/// 层级网格规范
pub struct LevelSpec {
    pub level: u8,
    pub n_u: i64,   // 环向格数
    pub n_s: i64,   // 子午线格数
    pub du: f64,    // 环向步长 (rad)
    pub ds: f64,    // 子午线步长 (m)
}
impl LevelSpec {
    pub fn center(&self, i: i64, j: i64) -> (f64, f64); // (u, σ)，自动 wrap
    pub fn cell_of(&self, u: f64, s: f64) -> (i64, i64);
}

/// 二维周期场（SoA 布局，rayon 友好）
pub struct Field2d<T: Copy + Send + Sync> {
    pub data: Vec<T>,  // 长度 n_u × n_s，行优先 (i, j) → i + j * n_u
    pub n_u: i64,
    pub n_s: i64,
}
impl<T: Copy + Send + Sync> Field2d<T> {
    pub fn new(n_u: i64, n_s: i64, fill: T) -> Self;
    pub fn get(&self, i: i64, j: i64) -> T;    // 自动 wrap
    pub fn set(&mut self, i: i64, j: i64, v: T);
    pub fn par_iter_cells(&self) -> impl ParallelIterator<Item = (i64, i64)>; // rayon
}
```

单元中心约定：上一级单元 (I,J) 恰好包含下一级 `i∈[4I,4I+4)`, `j∈[4J,4J+4)`。所有层级、构造网格、气候网格都用此约定。索引类型：层级内 `i64`（earth L6 的 N_u ≈ 4.5×10⁷）；数组下标 `usize`。`wrap(i, n)` 对负数正确：`((i % n) + n) % n`（Rust 的 `%` 对负数返回负值，须修正）。

### 01.4.2 S2 天文（`tg-astro`）

- **轨道**：开普勒（M_*=1.989e30 kg，L_*=3.828e26 W，a=1.496e11 m，e=0.0167，ϖ=102.9°）；平近点角→偏近点角（牛顿，残差 < 1e-13）；`T_orb = 2π√(a³/G(M_*+M))`。
- **自转与太阳方向**：自转轴 = +z；黄赤交角 ε（默认 23.4°）；`sin δ = sin ε sin λ`；直射点环向角 `u_sun(t) = wrap(α(t) − θ(t))`；μ = n·s；地方时角 H = wrap_pm(u − u_sun)。日历零点 = 上半环春分（λ=0）。
- **长期变化**：进动由 SCF 转动惯量计算 `ψ̇ = (3/2)(n²/Ω)((C−A)/C)cos ε`（环面 (C−A)/C ≈ 0.4–0.5，周期可能仅数千年——快进动时 EBM 用 ϖ 平均日照，8 相位平均）；近日点进动、黄赤交角与偏心率摄动按配置周期振荡（相位由 seed 派生，t=0 等于配置值）。
- **自遮挡**：V 只依赖 (σ, H, δ)，紧凑存储每个 (σ_k, δ_m) 的被遮挡区间列表；σ 1024 采样，δ 每 0.25°；查询双线性加权软可见度。
- **日照表**：q(σ,δ) = (1/2π)∫max(0,μ)V dH（H 上 2048 点梯形 + 端点修正），σ 1024 × δ 每 0.25°，只算一次；日均 `Q̄(σ,d) = S_d·q(σ,δ_d)`；任意轨道下查表毫秒级。
- **视角因子**：N_vf = 256 个 σ 分箱，每箱 8192 条余弦加权射线（确定性 RNG），命中记录箱号；对称化满足互易 `A_k VF[k][k′] = A_k′ VF[k′][k]`（令 G = 均值，VF = G/A_k，不再重归一，F_sky = 1 − ΣVF，负值报错）。
- 产物：`astro/shadow.bin`、`astro/insolation_present.bin`、`astro/viewfactor.bin`、`astro/report.json`。

### 01.4.3 S3 构造 Phase A（`tg-tecto`，构造网格 T）

- 网格：Δ_t = 16/10/20 km（test/mini/earth）；dt = 1 Myr；半拉格朗日回溯（RK2），候选搜索半径随位移扩大，仅当 v_max·dt > 4Δ_t 时子步。
- 状态（SoA，参考 §03.2）：`plate u16, ctype u8, thick f32, age f32, orogeny f32, strain [f32;3], tm f32, weak f32, bnd_type u8, bnd_time f32, strat [Layer;8], elev f32`；`Layer { rock: u8, thick: f32, age: f32 }`。
- 速度场（3 基函数，物理分量）：`v_p(x) = a_p·ρ(σ)·e_u + b_p·e_σ + ω_p·S_p(x)`；Galerkin 投影 `θ_p = M⁻¹F`（力：板片拉力 F_sp=2.5e13 N/m、洋脊推力 k_rp=1.0e8 kg/m²、碰撞阻力 k_col=5e20、地幔拖曳 c_d）；θ ← 0.5θ_new+0.5θ_old；速度上限 20 cm/yr。
- 地幔流：低波数傅里叶模态（|k_u|≤3, |k_σ|≤2），rms ≈ 1.5 cm/yr，相位缓慢漂移；超大陆保温贡献发散流。
- 平流与归属判定：候选板块 → RK2 回溯 → 0 有效（新洋壳）/ 1 有效（保单调 Catmull-Rom，异板块退化）/ ≥2 有效（汇聚胜负规则）；形变 `J = exp(−div v·dt)`，`thick *= J`，应变累加；边界分类（汇聚/离散/转换，阈值 0.5 cm/yr）。
- 汇聚：俯冲（Dijkstra 距离 d_tr/d_sub，弧岩浆 k_arc=40 km³/km/Myr，安第斯型挤压，弧后伸展，增生楔，俯冲侵蚀）；陆–陆碰撞（厚度叠加、重力垮塌扩散 κ = 3e3 m²/yr·(g/9.81)·(T/T_crit−1)，T_crit = min(75 km, 60 km·9.81/g)）；缝合（20 Myr 内平均汇聚 < 0.3 cm/yr 合并）；变质（每 10 Myr 按埋深扫描）。
- 离散与裂谷：裂谷事件（泊松触发，板内 Dijkstra 最短路分割板块）；热点与大火成岩省（泊松出生，LIP）。
- 高程（§03.8）：洋壳 GDH1（两段连续，见 V14）+ 加厚修正；陆壳 Airy；被动陆缘热沉降；动力项（海沟/前隆/热点/地幔动力地形 +8 m/K）；海平面二分求解（水量 V_w = 2600 m × 表面积，精度 0.1 m）。
- Phase A 地表耦合：每构造步调用 `tg-surface` 侵蚀核（n=1，dt=1 Myr，隐式），降水因子来自 EBM（每 10 Myr 更新）。
- 初始条件（−2.0 Ga，见 D4）：板块数 N = clamp(round(A/3e7 km²), 5, 30)，Poisson-disk 种子 + 随机边权多源 Dijkstra；克拉通 12% 陆壳（3–6 团块，thick=38 km，Gneiss）；洋壳年龄 = 到边界距离 / 3 cm/yr（上限 150 Myr）。
- 输出：每 25 Myr 快照（f16 高程 + u16 板块，只留最近 2 个）；`tecto/final.bin`；`tecto/metrics.csv`；Phase B 每步内存接口 `TectoForcing { uplift_rate（拉格朗日，不含侵蚀反弹）, vel_u, vel_s, plate_id, surface_rock, erodibility, strain, boundary_type }`。

### 01.4.4 S4 耦合 Phase B（`tg-pipeline::phase_b`）

- 时间：−100 Myr → 0；分辨率日程（earth）：16 km（L0/4）至 −20 Myr；8 km 至 −4 Myr；4 km（L0）至 0；切换时双三次上采样，不加噪声。
- 每构造步（1 Myr）：① 构造推进一步；② 构造抬升率（拉格朗日，基准均为上步侵蚀后厚度，避免与均衡反弹重复）；③ L0 水平平流（最近构造单元板块号，同板块双三次采样，否则取 e_tecto、沉积清零）；④ 气候（每 1 Myr EBM + 降水模拟器；每 10 Myr GCM 快照 C/2 更新风场与 τ_bg 校准；由降水模拟器输出算 `veg_cover`）；⑤ N 个 LEM 子步（dt_lem：16/8 km 用 20 kyr，4 km 用 10 kyr）：`h += U·dt` → 流向与湖泊 → 河流 ξ–q（传 U=0）→ 坡面扩散 → 海洋沉积 → 均衡 → 海平面（水量 − 冰量）；⑥ 侵蚀/沉积量按块平均回写构造网格。
- 冰期窗口（最后 1 Myr）：EBM 每 1 kyr 用 `elements_at(t)` 更新日照（快进动用 ϖ 平均）；冰川模型每 1 kyr 与气候交换；冰体积进海平面。
- 检查点：每 5 Myr 写 `l0/ckpt_<t>/`，字段集与份数按 §5 存储预算（审计 F5 修订，见 D5）。
- L0 地层：`sed: [SedLayer; 4]`（`SedLayer { facies: Facies, thick: f32, age: f32 }`，自上而下）；基岩由构造地层提供。

### 01.4.5 S5 气候（`tg-climate`）

- **EBM**：二维季节性湿能量平衡，日步长，积分到周期稳态（相邻两年年均差 < 0.01 K，上限 50 年）。`C_s ∂T/∂t = (1−α_p)(Q̄ + SW_ring) + ε_ring·LW_ring − OLR(T) + ∇·(M K ∇m) + F_o`；`OLR = 210 − 5.35 ln(CO2/280) + 2.0(T−273.15)`；`m = c_p T + L_v RH_0 q_s(T, p_s)`；`M = p_s/g(σ)`；`K = 1.2e6·(Ω_E/Ω)` m²/s；隐式 ADI（参考 §01.3 有限体积算子）。气候网格：earth 512×128（~88 km），mini 128×32，test 64×16。
- **快速降水模拟器**：P 网格（max(16 km, 当前 LEM 格距)）稳态水汽收支 `V·∇W − ∇·(K_w∇W) = E − P`；迎风 Gauss–Seidel 扫描（< 30 次收敛，判据 max|ΔW|/W < 1e-4）；Budyko 陆面 ET 迭代；τ_bg(σ) 逐行一维牛顿校准到 GCM 纬向平均。
- **简化 GCM**：Arakawa C 网格（正交曲线坐标，度量 h_x=ρ(σ)，双周期，无极区滤波）；2 个 σ 层（0.25/0.75）；预报量柱质量 π = p_s/g(σ)、u_k, v_k, T_k、q_2；Sadourny 能量守恒格式；RK3（Wicker–Skamarock），dt 由 CFL 自动（earth 约 150 s）；∇⁴ 超扩散 + 上层 Rayleigh 阻尼；f64。物理过程（每 20 min 模型时）：短波（日周期解析 + SW_ring）、灰体两层长波（含 LW_ring）、云、对流调整、大尺度凝结、地表通量（体积公式）、平板海洋（50 m 混合层 + Ekman）、海冰、陆面、地形（包络地形）。
- **降尺度**：L0 气候存 P 网格 f16（月 T/P/R、净辐射、下行短波、PET、ET、降雪、4 季风、N_m、生长季）；细层：温度直减 + 冷池 + Smith–Barstad 线性地形降水（窗口 FFT，`P = P_parent + (P_SB(h) − P_SB(lowpass_parent(h)))`，下限 0.1·P_parent；L1–L3 计算，L4 以下双线性）+ 坡向日照（8 方位射线）+ 风暴露度。
- 现代气候：5 年积分（首年丢弃）；快照：2 年（C/2）。输出 `climate/<name>.tgclim`（12 月 × 字段 × 网格 f32）与 `climate/diag.json`。

### 01.4.6 S6 生态与土壤（`tg-eco`，在 S7 之前）

- 顺序：土壤物理（风化层、质地、层位、W_cap）→ 植被（PFT）→ 土纲判定 → 1 次 GCM 反馈迭代 → 最终气候重算植被与土纲。
- 风化层（Heimsath 型）：`P_s = P_0 f_T f_P exp(−H_r/h_0)`，P_0 = 1e-4 m/yr，h_0 = 0.5 m；L0 稳态令 P_s = E（最终 1 Myr 平均侵蚀率）；输运受限 `H_r = h_0 ln(P_0 f_T f_P/E)`，否则 0.05 m；上限 30 m。
- 土纲：12 类简化决策树（参考 §06.2.2）；质地（母质 + 风化增黏 `clay += 30W`）；层位 O/A/B/C；W_cap（Saxton 型，上限 400 mm）；活动层（Gelisol）。
- 植被：12 个 PFT（参考 §06.3.1 参数表）；月步长桶模型水分平衡（循环 3 年取第 3 年）；PET（Priestley–Taylor）；NPP = LUE·APAR·f_T·f_W；树按 NPP 优先竞争（FPC_tree = min(1, α/0.8)）；火干扰（干季 ≥ 4 月且燃料达阈）。
- 反馈：反照率/粗糙度/W_cap 块平均到气候网格，从上次 GCM 终态重启积分 2 年，重算植被一次（`eco.feedback_iterations = 1`）。
- 细层（L3–L5）：立地适宜度 `s_p`，逐层相对父层归一 `c_p = c_p^parent · s_p / mean_block(s_p)`；个体植物（L5→L6）：8 m 候选格 + 哈希优先级点过程（保留概率、冠幅竞争 r_min，按瓦片生成，窗口间一致）。

### 01.4.7 S7 最终水文（`tg-surface::hydro`）

- 在 L0 用最终气候重跑流向/湖泊/累积（年均 + 月流量）。
- 河网矢量化：河道单元 A > 50 km²（可配置）；节点属性 (u,σ)、z_surf（沿程单调不增）、年均 Q、平滩流量 Q_bf = max 月 Q、宽 `w = 4.0·Q_bf^0.5`、深 `d = 0.3·Q_bf^0.4`（Q 单位 m³/s）、坡度、Strahler 级、河床岩性、沉积物通量；河段 id 稳定且确定。
- 湖泊（集合、水位、面积、体积、出口、内流/外流、盐度类别）；冰川冰厚插值到 L0；`l0/flow.tgf`（汇水面积、年均流量、对数域平滑版）；波浪风区（4 季风向上风追踪 ≤ 2000 km，`wave_index = Σ_季 U_10²·√fetch` 归一化）。
- 产物：`rivers/network.bin`、`l0/lakes.bin`、`l0/ice.tgf`、`l0/flow.tgf`、`l0/wave.tgf`。

### 01.4.8 S8 资源（`tg-pipeline::assets`）

- 细化谱斜率表：按 L0 的 64×64 块与地形类别统计 L0 功率谱并外推（β 截断 [1.8, 3.0]），供细化层亚网格初值 δ 使用（不得在窗口内各自估计）。
- 沙丘周期纹理：每体制（新月形/横向/线形/星形，4–8 类）在 16 km 周期方形域（L4 分辨率 1024²）运行 Werner 沙板元胞自动机，存 `cache/dunes/`（分钟级，不计入按需生成预算）。

### 01.4.9 按需细化 L1–L6（`tg-refine`）

- 层级：L0 = 4096 m 全局存储；L1..L6 格距 s_L = s0/4^L（1024, 256, 64, 16, 4, 1 m）；细化层不持久化全局数据，只按窗口计算并缓存。
- 窗口与混合（无缝关键）：步长 S_L（L1 为 64，L≥2 为 256）；窗口核心 2S×2S，外扩 halo 32 格（Dirichlet = 父层值）；每个单元恰属 4 个窗口；混合权重 `w = 3t²−2t³`（`w(t)+w(1−t)=1`），二维取乘积；分类场由混合后连续场派生，否则取权重最大窗口（并列取字典序小者）。瓦片 T(L,ti,tj) = S×S，由 4 窗口混合；对外查询以瓦片为单位。
- 配方按格距选择：R1024/R256/R64/R16/R4/R1。通用步骤：父层输入（双三次/最近邻）→ 亚网格初值 δ（周期哈希格点噪声，谱参数来自 S8 全局表，沿构造走向拉伸）→ 岩性结构（`strat_at`）→ 过程模拟 → 保均值修正（每父单元 4×4 子块均值差双三次插值回加，残差目标 < 0.5 m 或父层局地起伏 1%，重新施加河道/湖面约束）→ 派生字段。
- 各层配方（同参考 §07.5）：L1–L2：LEM（U = 父层长期侵蚀率 E_p）+ 冰川地貌（平衡速度法）+ 气候降尺度；L3–L4：LEM + 非线性坡面 + 滑坡（Culmann，低重力下山坡可更高更陡）+ 泛滥平原/阶地 + 冲积扇 + 三角洲 + 海岸 + 沙丘（周期纹理）+ 岩溶 + 湖泊；L5–L6：5 步非线性扩散 + 微起伏 + 基岩节理 + 砾石点过程 + 土壤层位 + 浅滩–深潭 + 积雪 + 植物个体。
- 河流矢量细化（参考 §07.4）：Chaikin 平滑中心线 C₀ → 锚点/子段 → 河型判定（基岩峡谷/辫状/曲流）→ Ikeda–Parker–Sawai 型线性迁移到目标曲折度（裁弯记录牛轭湖）→ 纵剖面（水面插值，河床 = 水面 − d，累计最小保证单调）→ 抛物线横断面（外弯陡、内弯点坝、天然堤）→ 栅格化（空间索引，`h = min(h, 断面)`）。
- 调度与缓存：请求 → 自顶向下求每层窗口集 → 自 L1 起逐层计算（层内 rayon 并行）→ 混合出瓦片；内存 LRU（默认 512 MB）；磁盘缓存 `cache/L{L}/{a}_{b}.tgw`（zstd，高程 f32、其余 f16/u8，总上限可配置，LRU 淘汰，`cache/index.bin`）；缓存键含 config 哈希与 `REFINE_VERSION`。
- 确定性：窗口内容 = F(父层数据, 层配方, seed, (L,a,b), config 哈希)；随机量用全局坐标哈希（参考 §08.4），不得依赖窗口局部索引以外的状态或计算顺序。

### 01.4.10 体素化与导出（`tg-voxel`，1 m³ 口径见 D1/AC-1）

- 块 32×32×32，坐标为 L6 索引 (i,j) 与高程索引 k（体素 k 覆盖 [k, k+1) m，相对海平面）；`z_min = −16000`，`z_max = +16000`。
- 每列取 `Column`（材料区间列表 + 精确地表高程 f32）；体素中心高程 k+0.5 查区间得材料；地表以上/水面以下填水/海水/冰；深部与高空为均匀块（常量表示）。
- `strat_at(x, y, depth) -> Material`（全项目唯一实现）：积雪/冰 → 水体 → 土壤层位（O/A/B/C）→ 沉积层（L0 sed 栈 + 细层叠加）→ 基岩层（构造地层，倾斜/褶皱/断层的局地几何由应变张量与边界历史导出）→ 地幔（Peridotite）。
- 材料枚举 `Material`（u8，参考 §07.7）。
- **1 m³ 处理（审计 F1；第 2 轮细化为 D1 方案 C′，按户主决策执行）**：
  - **内部网格（始终，方案 A 口径）**：L6 单元在物理空间为 `Δx = k(σ)·Δx_planar`、`Δy = Δσ`、`Δz = 1 m`，其中 `Δx_planar = 2πR_ref/N_u^levels`、`Δσ = L_m/N_σ^levels`（§1.4.0 已证明二者不能同时恰为 1 m）。块元数据必须**逐 σ 行**记录 `x_scale[j] = k(σ_j)`（32 个 f32；块内 k 的变化 ≤ 32 m/R_ref = 4.4e-6 相对量，故对 A 口径亦可接受单值 + 记录 max/min，但不得只写一个不标注含义的数）。**任何文档、CLI 输出、元数据不得声称内部格元体积恰为 1 m³。**
  - **导出网格（方案 C′：x 与 σ 双向重采样到严格 1 m）**：对每个 σ 行，按**全局相位**采样 `x = m·1.000 m`（m ∈ ℤ，`x = R_ref·u`，相位不依赖块坐标 → 相邻块共享同一组采样线，天然无缝）；σ 方向同样重采样到 `y = n·1.000 m`（双线性自 L6 网格取值，`y = σ`；L6 的 σ 间距偏差 ≤ 0.92%）；z 方向本就严格 1 m。**因此导出体素体积 `V = 1.000³ m³` 精确成立**（浮点舍入 ≤ 1e-9）。
  - **必须如实标注的近似**：C′ 是**插值**而非物理细化——导出样本与其最近的 L6 网格中心的最大水平距离 ≤ `0.5·max(k·Δx_planar, Δσ)` ≈ 0.63 m（earth），须写入 `.tgc` 头字段 `resample: {dx: 1.0, dy: 1.0, max_offset_m: f32, source_level: 6}` 并在 README/报告中说明“1 m³ 为交付产物的采样体积，数据分辨率仍为 ~1 m”。
  - 若户主选择方案 A：导出产物为名义 1 m，逐行元数据如实记录 `k(σ)` 与体积偏差（earth 下 `max|k−1| ≤ 0.25`），AC-1 按 A 口径判定。
  - 若户主坚持**内部网格**也严格 1 m³：只能选方案 B（非嵌套、逐行变列数），本计划评估其代价为窗口/瓦片/缓存/4×4 嵌套/单位分解混合全部失效（§4.9 不可复用），须另行评估工期——见 D1。
- 树木体素（`ChunkOpts.trees = true`）：块足迹外扩最大冠幅内的植物，按冠形几何填 Wood/Leaves。
- CLI（同参考 §08.8，路径相对化）：`new / run --until / status / render map|globe|frames|atlas|voxels / region / chunks / mesh / metrics / bench`。

## 01.5 存储预算（审计 F5 修订：逐字段明细 + 硬上限校验）

earth 预设，L0 = 3.05e7 格（V5）。推荐编码（方案 α，上限 2.0 GB；方案 β 见下）：

| 字段 | 位置 | 编码 | B/格 | earth 总计 |
|---|---|---|---|---|
| elevation h | `l0/elevation.tgf` | F32 | 4 | 122 MB |
| sed facies ×4 | `l0/sed.tgf` | U8×4 | 4 | 122 MB |
| sed thick ×4 | `l0/sed.tgf` | F16×4 | 8 | 244 MB |
| sed age（顶层） | `l0/sed.tgf` | F32 | 4 | 122 MB |
| ice thickness | `l0/ice.tgf` | F16 | 2 | 61 MB |
| flow log(accum) | `l0/flow.tgf` | F16 | 2 | 61 MB |
| wave index | `l0/wave.tgf` | F16 | 2 | 61 MB |
| bedrock rock id | `l0/rock.tgf` | U8 | 1 | 30 MB |
| erosion rate（长期） | `l0/erode.tgf` | F16 | 2 | 61 MB |
| **L0 核心小计** | | | **29** | **≈ 0.88 GB** |
| 气候场（P 网格 F16，~20 场） | `climate/` | F16 | — | ≈ 15 MB |
| 构造终态（构造网格 ~100 B/格） | `tecto/final.bin` | 混合 | — | ≈ 130 MB |
| 河网/湖泊/板块表 | `rivers/`, `l0/lakes.bin` | postcard | — | ≈ 30 MB |
| 构造快照 ×2（F16+U16） | `tecto/snap_*.tgf` | 混合 | — | ≈ 10 MB |
| 检查点 ×2（h F16 + sed 12 B + ice F16 = 14 B/格） | `l0/ckpt_*/` | 混合 | 14 | 2 × 0.43 = 0.86 GB |
| **合计（方案 α，上限 2.0 GB）** | | | | **≈ 1.93 GB** |

> 实数复核（第 2 轮，`verify_plan_numbers.py` §B）：earth L0 = 11040 × 2768 = 30,558,720 格；
> 逐字段字节数见脚本输出（本表数值与之逐行一致）。GB = 10⁹ 字节。

- 方案 β（维持参考 1.5 GB 上限）：检查点只保留 1 份，合计 **≈ 1.499 GB** —— **余量仅 +0.001 GB**，实际上等于没有余量（任何字段增加都会超限）。因此 β 只应视为“极限降级”，D5 仍推荐 α。
- 表中为**未压缩（逻辑）字节数**；`.tgf` 采用 zstd(3)，实际磁盘占用预期为 0.5–0.8×（F16/U8 场压缩率有限，按 0.8 保守）。PF-05 校验**磁盘实际占用** ≤ 上限；同时要求逻辑字节数 ≤ 上限（双保险）。
- 细化缓存（不计入世界目录上限）：磁盘 ≤ 1 GB（LRU，默认），内存 LRU ≤ 512 MB；`cache/dunes/` 与 `cache/rivers/` 另计，建议 ≤ 256 MB。
- **硬校验**：`terragen status` 输出世界目录与缓存的实际字节数；验收 PF-05/PF-06 在闸门处自动检查，超上限即失败。预算以实现后实测回填本表（不得默默超上限）。
- `.tgf` 格式（参考 §08.5）：小端；头 `magic "TGF1"`、version、dtype（F32|F16|U8|U16|I16）、nu、ns、tile、meta_len、meta(JSON)；瓦片索引表 + zstd(level 3) 瓦片；支持按矩形区域随机读取（周期 wrap）。`.tgw` 窗口缓存为多字段容器；结构化数据用 postcard + `{magic, version, payload}` 外包；PLY 顶点用 double；`.tgc` 体素块 = 头 + 32768 B 材料（zstd）+ 1024×f32 地表高程 + `x_scale[32]`（逐 σ 行）+ `resample` 节（§4.10 C′ 口径）。所有格式带版本号，不支持的版本报错；**损坏截断文件必须报错而非 panic/静默（NX-29）**。

## 01.6 计算预算（审计 F3/F6 修订：机器相对口径）

**机器相对口径**：以 criterion 微基准 + mini 全流程实测标定的 `rate`（每核每秒 cell-steps，分内核记录）为基准；任意机器上的预计耗时 `T_est = cell_steps / (rate × cores)`。绝对指标（内存、磁盘）不变。参考机（8C/16T）的工时仅作历史参考；当前沙箱（2 vCPU/3.8 GB）只能跑 test/mini（earth 峰值 6 GB 不可运行）。

| 阶段 | 主要工作量（earth） | 参考机（16 线程）估算 |
|---|---|---|
| S1 figure | SCF 两档网格 × ~50 次迭代 × 256×128 目标点 × 源求和 | 分钟级 |
| S2 astro | 阴影表 1024σ × ~145δ × 720H 射线；q 表；VF 256 箱 × 8192 射线 | 分钟级 |
| S3 Phase A | 1900 构造步 × 1.28e6 格 + EBM 190 次（秒级/次） | ≤ 1.5 h |
| S4 Phase B | LEM ≈ 2.6e10 cell-steps + 降水模拟 100 次 + GCM 快照 10 次 + 冰期窗口 | ≤ 8 h |
| S5 现代 GCM | 5 年 × 88 km 网格 × 全物理 | 2–4 h（**M4 实测澄清**，F6） |
| S6 eco | L0 月步 ×3 年 ×（1+反馈）迭代 | 分钟级 |
| S7 hydro | L0 流向/累积 + 河网矢量化 + 风区追踪 | 分钟级 |
| S8 assets | 谱斜率表 + 沙丘纹理 | 分钟级（不计入按需预算） |
| 按需 1 km² @1 m | 冷启动 / 热缓存 | ≤ 60 s / ≤ 5 s（参考机 16 线程） |

- 峰值内存：earth ≤ 6 GB（绝对，目标机）；mini ≤ 1.5 GB（沙箱可运行）；记录于 manifest（VmHWM）。
- 单窗口耗时（单线程）：R1024 ≤ 1 s、R256–R16 ≤ 6 s、R4–R1 ≤ 0.5 s。
- 规则（保留参考 §08.10）：预算超标 > 50% 的任务不得标记完成，须在报告中给出剖析与优化方案。

## 01.7 依赖顺序与里程碑闸门（审计 F7 修订：Arena 协议）

### 01.7.1 任务依赖 DAG（同参考 INDEX，编号稳定）

```
T00→T01→T02→T03→T10→T11→T12→T20→T21→T50→T51→T52→T53──┐
             └→T04 ─────────┘   │                         │
                       T10→T40→T41→T42 ───────────────────┤
                       T12→T30→T31→T32→T33(需 T41,T50) ───┴→T43→T61→T62→T60→T63→T70→T71→T72→{T73,T75}→T74→T80→T81→T82
```

- 可并行：M3（T40–T42）与 M2 并行；M5 的 T30–T32 与 M3/M4 并行。
- **关键路径：气候链 T50→T51→T52→T53**（GCM 最高风险，降级闸门 D7）。

### 01.7.2 里程碑闸门（Arena 协议：每个里程碑结束于一个 PR，Kibiandkimi 人工批准后才继续；禁止自动合并）

| 闸门 | 任务 | 出口证据（除验收矩阵外） |
|---|---|---|
| M0 基础设施 | T00–T04 | 可编译工作区、`terragen new/status`、测试场 PNG、**基准闸门 PF-01 初版** |
| M1 星体 | T10–T12 | 平衡截面、Ω/日长、g(σ) 曲线、三维渲染、**闸门 G1 通过** |
| M2 天文 | T20–T21 | 日照 Hovmöller、内侧季节与自遮挡、二分二至光照图、进动周期 |
| M3 地表核 | T40–T42 | 合成地形河网/湖泊/侵蚀帧、Halfar 验证、**LEM 基准** |
| M4 气候 | T50–T53 | EBM 温度场、GCM 风/降水、急流数、雨影测试、**GCM 耗时澄清（F6）、GCM 闸门或 D7 降级** |
| M5 构造 | T30–T33 | mini 1–2 Gyr 构造动画、超大陆旋回、高程双峰 |
| M6 全局成品 | T43, T60–T63 | 完整 mini 世界：地形、河网、气候、生物群系、三维渲染、指标报告（C 类闸门） |
| M7 细化 | T70–T75 | L0→L6 缩放序列、典型地貌特写、无缝/顺序无关检验、**窗口基准** |
| M8 体素与交付 | T80–T82 | 体素块渲染、导出文件（AC-1 按 D1 口径）、端到端基准（mini + earth 估算） |

- 工作单元：每个可审核单元 = 一个 `work/1/<unit>` 分支 + 一个 PR（base `AerraGen-main`）；更新 `.context/STATE.md`；提交 SUSTechHSAS；审核 Kibiandkimi；不合并、不写正式分支、不 force-push。
- 审查分级（保留参考 REVIEW.md）：BLOCKER（物理/数值错误、确定性破坏、测试造假或缺失关键验收）/ MAJOR（规格不符、性能超预算 > 50%、明显伪影）/ MINOR / NIT。
- 报告模板（保留参考 EXECUTOR.md §6，路径相对化）：完成内容、验收测试（实测值 vs 阈值）、性能（预设/耗时/峰值内存/预算）、审查图、决策记录、偏差与未完成项、发现的问题、ICR、BLOCKED。

## 01.8 确定性、测试与质量保障

- **证据留存政策（第 2 轮新增；对应 AGENTS.md 规则 8 与 OPERATIONS.md「检查点和恢复」）**：验收证据分三类，各自的留存方式不同——
  1. **可复现证据（首选）**：每个 GATE 项必须能由仓库内的代码/脚本 + 固定 preset + seed + 命令复现，PR 中写明该命令、实测结果与耗时；重现命令必须在文档中可执行（例如 `terragen bench --preset mini --seed 42`）。
  2. **随 PR 提交的证据**：阶段报告（`docs/reports/M<k>.md`）、`metrics.json` / `bench.json` / `diag.json` 等小型 JSON、`verify_output.txt`、单张 ≤ 5 MB 的审查图；大图/动画只提交 SHA256 与生成命令。
  3. **不可保留的产物**（world 目录、`target/`、视频）：必须在报告中给出**生成命令 + 产物 SHA256 + 关键统计量**，不得以沙箱路径或 Actions artifact 作为唯一副本。评审复现以命令为准。

### 01.8.1 确定性规则（参考 §08.4 四规则 + 审计 F11 扩展）

1. **RNG 与哈希**：`hash(seed: u64, tag: &str, a: i64, b: i64, c: i64) -> u64` = SplitMix64 终结(FNV-1a(seed) ⊕ FNV-1a(tag) ⊕ a ⊕ (b << 17) ⊕ (c << 31))；xoshiro256** 按用途分流（构造、裂谷、热点、沙丘、植物各用独立 seed 流）。
2. **噪声周期性**：哈希噪声在**全局平面坐标**求值且**周期**：格点数 `n_x = max(1, round(2πR_ref/λ))`，`n_y = max(1, round(L_m/λ))`，取模。不同 λ 值的噪声叠加（分形）。
3. **并行归约**：不依赖 HashMap/HashSet 迭代顺序；浮点归约顺序固定（固定大小块部分和——每块 1024 元素，块内 Kahan 求和，块间按块索引顺序累加）；并行只写互不重叠区域；不用时间/线程 id/地址作随机源。
4. **扩展（审计 F11）**：导出路径（瓦片/区域/体素块/PLY）纳入确定性测试（NX-28）；缓存键含 config 哈希与 `REFINE_VERSION`。

**验证方法**：`tg_core::testing::assert_deterministic(seed, f)`：运行 `f` 两次（1 线程 vs 16 线程专用线程池），比较所有输出的字节哈希。每个并行模块（SCF、构造平流、LEM 步、GCM 步、细化窗口）都须有此测试。

### 01.8.2 检查点与恢复

**文件命名**：`<world>/ckpt_<stage>_<timestamp>.bin`（stage = init/figure/astro/tecto_a/tecto_b/climate/eco/hydro/assets）。

**恢复算法**：
1. 扫描世界目录，找最新检查点（按时间戳降序）。
2. 读取 `manifest.json`，校验 `config_hash` 与当前配置一致（不一致 → 警告并中止，除非 `--force`）。
3. 恢复阶段状态（反序列化到对应结构体）。
4. 从下一阶段继续（manifest 记录每个阶段的 started/finished 时间戳）。
5. 若检查点损坏（magic/version 不匹配、zstd 解压失败、校验和不一致）→ 尝试前一个检查点，或从头重跑。

**检查点内容**（每阶段不同，详见各阶段输出节）：
- `init`：配置 TOML 副本 + 派生参数 JSON。
- `figure`：Meridian (rho/z/drho/dz/kappa f64×M) + GravityTable (f32×1024×17×2) + Sdf2 (f32×2048×1024) + 派生标量 (Omega, T_rot, Mass, A, V)。
- `astro`：ShadowTable (压缩区间列表) + QTable (f32×1024×n_delta) + ViewFactors (f32×256×256 + f32×256)。
- `tecto_a`/`tecto_b`：构造网格全状态（plate u16, ctype u8, thick/age/orogeny/tm/weak f32, bnd_type u8, bnd_time f32, strain [f32;3], strat [Layer;8]）+ 板块表 + 当前时间 t_yr + 全局统计。
- `climate`：EBM/GCM 月均场 (f32) + 诊断 JSON。
- `eco`：土壤/植被状态 (f32) + 土纲 (u8)。
- `hydro`：流向 (u8) + 湖泊集合 + 河网 postcard。
- `assets`：谱斜率表 (f32) + 沙丘纹理索引。
- 测试分层：`cargo test`（test 预设，全工作区 < 3 min）；`cargo test --release -- --ignored`（mini 长程）；`scripts/check.sh`（fmt --check、clippy -D warnings、快速测试）；`scripts/slow.sh`；`scripts/preview.sh <task>`（审查图到 `artifacts/<task>/`，不入 git）。
- 编码规范（参考 §08.9）：公共项文档注释；库中不 `unwrap()`（测试除外），不变量 `expect("原因")`；`thiserror`/`anyhow`；`tracing` 日志（长任务每 ≥ 5 s 进度）；无全局可变状态；需要 g 处一律 `Body::g(σ,h)`。
- 预览（`tg-viz`）：平面地图（y=σ，外赤道居中；真实度量晕渲；叠加河网/板块/湖泊/冰川/等值线）；环面三维 CPU 光线追踪渲染（SDF 球追踪，太阳方向含阴影）；帧序列；细层缩放序列与体素块等轴测渲染。写入 `<world>/previews/` 与 `artifacts/<Txx>/`。

## 01.9 风险与降级

| 风险 | 等级 | 应对 |
|---|---|---|
| GCM 不收敛或全物理不稳定 | 高 | 决策闸门 D7：两轮不收敛 → Gill 型线性稳态风场 + EBM 温度，记录于报告与 CHANGELOG |
| SCF 无平衡解（Ω²≤0 / 质量流失） | 高 | 闸门 G1 回退：调整 R/r 或 Ω 上限，或 rigid 模式 + 大地水准面偏差报告 |
| 快进动（数千年）与 kyr 级气候更新混叠 | 中 | EBM 用 ϖ 平均日照（8 相位），物理等价（参考 §02.3） |
| 性能超预算 | 中 | 基准闸门 PF-01 定标；超 >50% 不得标完成；剖析 + 优化方案 |
| 磁盘不足 | 中 | D5：目标机 ≥ 15 GB；世界目录上限硬校验（PF-05）；缓存 LRU |
| 确定性破坏（并行归约/哈希） | 中 | §8 四规则 + `assert_deterministic`（1 vs N 线程字节哈希），导出路径 included |
| 1 m³ 口径争议 | 高（口径） | 开放决策 D1；AC-1 按所选方案定义；不得静默放宽 |
| **实现环境缺 Rust 工具链与 crates.io 访问（第 2 轮实测：沙箱无 cargo/rustc/rustup，`static.rust-lang.org`/`crates.io`/`index.crates.io` 均不可达，仅 github.com 可达）** | **阻塞（M0 起全部里程碑）** | **开放决策 D8**：优先由户主提供带工具链与 crates.io（或 vendor 代理）的环境；否则 M0–M8 的 `cargo build/test/bench` 类验收无法执行，计划中的 QE/NX/PF 证据将无法产生。本计划审查阶段（纯 Python/文档）不受影响 |

## 01.10 与参考计划 v1.1 的差异清单（审计对应）

| # | 差异 | 审计 |
|---|---|---|
| Δ1 | 1 m³ 口径不静默放宽：导出路径按 D1 决策（推荐方案 C 重采样到严格 1 m³）；块元数据记录 k(σ) 与体积 | F1/D1 |
| Δ2 | 增加可行性闸门 G1（含无经环孔质量流失断言与回退路径） | F2 |
| Δ3 | 物理假设统一明示为 PA-1..PA-12 清单 | F2 |
| Δ4 | 机器预算可配置（`[budget]`）；时间指标改为机器相对口径（每核每秒 cell-steps 定标）；区分开发/CI 机与目标机 | F3 |
| Δ5 | 统一验收矩阵（`02`），含测量方法/命令/阈值/证据/闸门-护栏分级 | F4 |
| Δ6 | 存储预算逐字段明细 + 硬上限校验；修复"1.5 GB 上限 vs 2 检查点"自相矛盾（方案 α/β，D5 决策） | F5 |
| Δ7 | 增加基准闸门 PF-01；GCM 现代/快照耗时口径待 M4 实测澄清 | F6 |
| Δ8 | 依赖与闸门改用 Arena 协议（work/1/<unit> + PR + 人工批准，禁自动合并）；保留里程碑与审查分级 | F7 |
| Δ9 | GCM 降级正式化为决策闸门 D7 | F9 |
| Δ10 | 确定性规则扩展到导出路径（NX-28） | F11 |
| Δ11 | 全部路径相对化；构建目录由环境决定 | F12 |
| Δ12 | 其余条款（各阶段公式、参数表、数据结构、验收阈值）采纳参考 v1.1，未被本清单修订的部分以参考规格为准 | F10 |
| Δ13 | 新增 §1.4.0 派生网格与量化口径；给出六预设定值表与 `Δσ = x/round(x)` 闭式结论（严格 1 m 不可达的证明） | 第 2 轮复核 |
| Δ14 | earth 重力口径更正：`2πGρr = 4.15 m/s²` 只是圆柱近似，R/r=4 的真实有效表面重力 ≈ 3.36 m/s²（−19%）；AC-2/NX-06 据此改写 | 第 2 轮复核 V2 |
| Δ15 | D1 方案 C 细化为 C′（x 与 σ 双向重采样 + 全局相位 + 保真度声明 + `x_scale[32]` 逐行元数据） | 第 2 轮复核 §E |
| Δ16 | voxel 块元数据由单个 `x_scale: f32` 改为逐 σ 行 `x_scale[32]` + `resample` 节 | 第 2 轮复核 |
| Δ17 | G1 判据补全为 6 条（新增质量记账守恒定义、镜像对称阈值、加密趋势记录） | 第 2 轮复核 §E |
| Δ18 | 新增 D8（实现环境：Rust 工具链 + crates.io）与 §1.8 证据留存政策；`02` 新增 RS-17、NX-29/30、PF-09/10、QE-07..09 与 §02.G | 第 2 轮复核 |
