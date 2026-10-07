# M8 · 体素与交付任务卡

---

### T80 voxel：材料柱、体素块、树木体素

- 依赖：T74｜模型：Sonnet 5｜难度：中
- 必读：§07.7、§07.8、§07.10 第 5 条、§08.5（`.tgc`）

**交付**（`tg-voxel`）：
1. `Column { surface: f32, intervals: SmallVec<[(f32 top, Material); 16]> }`：由 L6 瓦片字段 + `strat_at` 构造（积雪/冰 → 水 → 土壤层位 → 沉积 → 基岩 → 地幔）。
2. 扩展 trait `VoxelWorld`（在 tg-voxel 中为 `tg_refine::World` 实现；Rust 不允许跨 crate 的固有方法）：`column(i6, j6)`、`chunk(cx, cy, cz, &ChunkOpts)`：32³，均匀块（全岩/全空气/全水）快速路径；块元数据 `surface[1024]`、`x_scale`；`ChunkOpts { trees: bool, season: Option<Month> }`。
3. 树木体素（`ChunkOpts.trees`）：从 `World::plants` 取块足迹外扩最大冠幅范围内的植物，按冠形填 `Wood/Leaves`。
4. `.tgc` 读写。

**验收**：§07.10 第 5 条；随机 10⁴ 个体素与 `strat_at` 逐点一致；相邻块共享面一致；深处/高空块走快速路径；单块生成（热缓存）≤ 5 ms。

**审查图**：`artifacts/T80/chunk_cross_section.png`（垂直剖面按材料着色）、`chunk_iso.png`（等轴测体素渲染，含树）。

---

### T81 cli：细层导出、PLY、体素渲染

- 依赖：T80｜模型：Haiku 4.5｜难度：低中
- 必读：§08.8、§08.6（细层）、§07.6

**交付**：
1. `terragen chunks <dir> --u --s --radius-m --out <dir>`（批量导出 `.tgc` + 索引 JSON）。
2. `terragen mesh <dir> --level L --u --s --size [--embedded] --out m.ply`：高度场三角网格，顶点坐标写 `double`；`--embedded` 时顶点用 `Body::position(u, σ, h)` 输出真实三维环面坐标（可在任何三维软件中查看弯曲的环面地表）；顶点色取地表材料/生物群系颜色。
3. `terragen render <dir> voxels --u --s --size`：简单体素光线步进等轴测渲染 PNG。
4. `terragen region` 支持导出多字段 `.tgf` 与材料色图。

**验收**：PLY 可被标准解析（写一个最小 PLY 读回测试）；`--embedded` 网格顶点到星体表面的距离 = 高程（误差 < 1 mm）；导出的块数与半径一致。

**审查图**：`artifacts/T81/voxel_render.png`、`mesh_flat.png`、`mesh_embedded.png`（用内置 globe 渲染器渲染导出的嵌入网格区域）。

---

### T82 端到端验证、性能、用户文档

- 依赖：T81｜模型：Sonnet 5｜难度：中
- 必读：§00.6、§08.7、§08.10、全部验收章节

**交付**：
1. mini 预设全流程（新 seed）从零运行：记录每阶段耗时与峰值内存、指标报告、图集。
2. earth 预设：S1–S2 实测；S3–S7 以抽样（缩短时间窗/单分辨率阶段）实测后外推，给出总耗时与磁盘占用估算；若超出 §00.6 预算，给出剖析（`perf` 或内置计时）与已实施/建议的优化。
3. 热点优化（只做剖析证明有效的优化，每项在报告中给出前后对比）。
4. 用户文档 `docs/USER_GUIDE.md`（中文）：安装、创建世界、运行阶段、查看图集、查询区域与导出体素、配置参数说明（自动从配置结构体文档注释生成参数表的小工具可选）、已知限制。
5. 回归基线：`test` 预设全流程输出哈希写入 `tests/baseline.json`，慢速测试比对。

**验收**：mini 全流程 ≤ 1 h；1 km² @ 1 m 冷启动 ≤ 60 s；指标全部在护栏内或有书面分析；文档覆盖全部 CLI 子命令。

**审查图**：`artifacts/T82/`（新 seed 的完整图集、缩放序列、体素渲染、bench 输出）。
