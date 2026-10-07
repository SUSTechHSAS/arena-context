# 任务总表（INDEX）

★ = 重点审核（审核者做独立数值验证）。模型：S = Sonnet 5，H = Haiku 4.5。规模为预计 Rust 代码行数（不含测试）。

| ID | 名称 | 里程碑 | 依赖 | 模型 | 难度 | 规模 | 卡片 |
|---|---|---|---|---|---|---|---|
| T00 | 工作区骨架、脚本、git 初始化 | M0 | – | H | 低 | 300 | M0-infra.md |
| T01 | core：配置/预设/常量/RNG/哈希噪声/岩石与材料表 | M0 | T00 | S | 中 | 1200 | M0-infra.md |
| T02 | core：周期网格与场、插值、IO 格式、世界目录/manifest、CLI new/status | M0 | T01 | S | 中 | 1500 | M0-infra.md |
| T03 | core：求解器（三对角、度量 ADI、PCG、Dijkstra、确定性归约） | M0 | T02 | S | 中 | 900 | M0-infra.md |
| T04 | viz 基础：色表、PNG、晕渲、平面地图、帧序列 | M0 | T02 | H | 低 | 700 | M0-infra.md |
| T10 | geom：子午线、标架、度量、LevelSpec、坐标映射 | M1 | T03 | S | 中 | 1000 | M1-body.md |
| T11 ★ | geom：SCF 平衡形状 | M1 | T10 | S | 高 | 900 | M1-body.md |
| T12 | geom：重力表、科里奥利、SDF、Body、figure 阶段、三维渲染 | M1 | T11, T04 | S | 中 | 1100 | M1-body.md |
| T20 | astro：轨道、太阳方向、日历、轨道要素变化、进动 | M2 | T12 | S | 中 | 600 | M2-astro.md |
| T21 ★ | astro：自遮挡、日照表、视角因子、astro 阶段 | M2 | T20 | S | 中高 | 1000 | M2-astro.md |
| T40 ★ | surface：流向、Priority-Flood、湖泊、栈序、累积 | M3 | T10 | S | 中高 | 1100 | M3-surface.md |
| T41 ★ | surface：ξ–q 河流、坡面、海洋、均衡、海平面、沉积层、LEM 单步 | M3 | T40 | S | 高 | 1400 | M3-surface.md |
| T42 | surface：SIA 冰川、物质平衡、冰川侵蚀 | M3 | T41 | S | 中高 | 800 | M3-surface.md |
| T50 | climate：EBM | M4 | T21 | S | 中 | 800 | M4-climate.md |
| T51 ★ | climate：GCM 动力核 | M4 | T50 | S | 高 | 1500 | M4-climate.md |
| T52 ★ | climate：GCM 物理与气候态、climate 阶段 | M4 | T51 | S | 高 | 1500 | M4-climate.md |
| T53 | climate：快速降水模拟器、L0 气候场 | M4 | T52 | S | 中 | 900 | M4-climate.md |
| T30 | tecto：状态、初始化、速度基与力平衡、地幔流 | M5 | T12 | S | 中高 | 1000 | M5-tecto.md |
| T31 ★ | tecto：归属判定平流、新洋壳、形变、边界分类 | M5 | T30 | S | 高 | 1000 | M5-tecto.md |
| T32 ★ | tecto：俯冲、弧、碰撞、垮塌、合并、变质、地层 | M5 | T31 | S | 高 | 1300 | M5-tecto.md |
| T33 | tecto：裂谷、热点、均衡高程、海平面、Phase A 驱动 | M5 | T32, T41, T50 | S | 高 | 1200 | M5-tecto.md |
| T43 ★ | pipeline：Phase B 耦合驱动 | M6 | T33, T42, T53 | S | 高 | 1200 | M6-global.md |
| T60 | hydro：最终水文、河网矢量化、湖泊、L0 流量场、波浪风区 | M6 | T62 | S | 中 | 800 | M6-global.md |
| T61 | eco：土壤物理（风化层、质地、层位、持水）| M6 | T43 | S | 中 | 700 | M6-global.md |
| T62 | eco：植被、生物群系、土纲、GCM 反馈 | M6 | T61 | S | 中 | 1000 | M6-global.md |
| T63 | metrics + 全流程 CLI（S0–S7）+ 全局图集 | M6 | T60 | S | 中 | 900 | M6-global.md |
| T70 ★ | refine：窗口框架、混合、调度、缓存、World API、S8 assets 骨架（谱斜率表）| M7 | T63 | S | 高 | 1300 | M7-refine.md |
| T71 | refine：河流矢量细化 | M7 | T70 | S | 高 | 1100 | M7-refine.md |
| T72 ★ | refine：通用步骤 + L1–L2 配方、strat_at | M7 | T71 | S | 高 | 1400 | M7-refine.md |
| T73 | refine：L3–L4 配方 I（坡面、滑坡、阶地、冲积扇、湖泊）| M7 | T72 | S | 高 | 1200 | M7-refine.md |
| T75 | refine：L3–L4 配方 II（海岸、三角洲、沙丘、岩溶、辫状河）| M7 | T72 | S | 高 | 1100 | M7-refine.md |
| T74 | refine+eco：L5–L6 配方与个体植物 | M7 | T73, T75 | S | 中高 | 1000 | M7-refine.md |
| T80 | voxel：材料柱、体素块、树木体素 | M8 | T74 | S | 中 | 700 | M8-voxel.md |
| T81 | cli：细层导出、PLY、体素渲染 | M8 | T80 | H | 低中 | 700 | M8-voxel.md |
| T82 | 端到端验证、性能、用户文档 | M8 | T81 | S | 中 | – | M8-voxel.md |

## 可并行性与关键路径

```
T00→T01→T02→T03→T10→T11→T12→T20→T21→T50→T51→T52→T53──┐
             └→T04 ─────────┘   │                         │
                       T10→T40→T41→T42 ───────────────────┤
                       T12→T30→T31→T32→T33(需 T41,T50) ───┴→T43→T61→T62→T60→T63→T70→T71→T72→{T73,T75}→T74→T80→T81→T82
```

- M3（T40–T42）可与 M2 并行；M5 的 T30–T32 可与 M3/M4 并行。
- 关键路径为气候链（T50→T51→T52→T53）。GCM 是最高风险项：若 T51/T52 两轮仍未收敛，审核者可启用降级方案（在 CHANGELOG 记录）：以线性稳态 Gill 型风场模型替代 GCM 风场，EBM 提供温度。
