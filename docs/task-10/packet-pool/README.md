# Task #10 工作包池

本轮按所有者要求扩充主模型预先分配的任务。共 **114 个正式定义**：原有 4 个保持原样，新增 110 个；73 个没有前置包依赖，41 个在依赖通过主模型复核后领取。新增包在 `4cc1298712ebfffcdd2bd1beb9ce4c8e046bd596` 正式发布并核对远程；CLI 实际返回 **73 个 available、41 个等待前置复核的 blocked**，没有其他阻塞。原始状态快照见 [status.json](status.json)，其 [远程协议检查](https://github.com/SUSTechHSAS/arena-context/actions/runs/37916813252)已通过。

新增任务包含 68 个类实现包、16 个算法/数据接口实现包和 26 个可执行源码审计包。静态 AST 中每个具名主程序类声明都能对应到现有成果、原有包或本次实现/审计包；这表示分配覆盖，尚不表示实现或验收完成。

源码与公共类型边界：原始快照 `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`，当前基础包含 `0ec3698` 的 ItemCore 多态接口兼容声明。新的类保留源类/成员名，按已有 armor 模式将 ports 作为首个构造参数并私有保存；函数包使用定义中指定的 create... 工厂。这里仍未建立旧脚本/存档所需的全局无 ports 构造接口。

## 如何领取

从包含本包池的最新 `arena/db5ddb58-arena-context` 主模型检查点启动；Arena 分配新分支后保留真实名称，PR base 仍为 `task/10/main`。每轮先重新指纹，再按角色执行。子模型运行 `collaboration.mjs status`，领取一个可用包后，仅写该包的路径和本轮证据；一个包一个 PR。

领取前查看任务现有未合并 PR 的 Work packet，避免重复开启同一包。CLI 的 status 描述当前分支记录，不是跨分支的全局抢占锁。有同包在执行时继续其指定分支或选择其他独立包，保持一个分支一个写入者。

有依赖的包先保留，优先处理其他无依赖包。后续从包含所需已复核成果和本包定义的正式任务检查点接续；不要自行拼接几个未合并子任务的历史。依赖检查返回 blocked 是等待前置复核，不是授权用 stub 替换缺失的实际父类。

## 优先清理的依赖入口

- 原有武器审计 → 武器核心 → 武器各组与融合计算。
- 怪物审计 → 怪物核心 → 12 组怪物/首领。
- 宠物审计 → 宠物核心 → 2 组宠物。
- 卷轴、陷阱、祭坛、炸弹和原有药水基类 → 各自子类。
- 路径基础 → 路径搜索；主地牢审计 → 房间几何 → 迷宫核心；棋子 → 棋盘求解。

主模型回来时优先复核这些入口的真实成果，可以同时解锁多个后续包。每个包仍须独立检查产物和运行证据；模型复核不代替 Kibiandkimi 的人工审核合并。

## 原有四包

- [源码 AST 清单](../../../.context/collaboration/packets/t10-source-ast-inventory.json)
- [饰品契约](../../../.context/collaboration/packets/t10-accessory-contracts.json)
- [药水基类](../../../.context/collaboration/packets/t10-potion-base-contracts.json)
- [武器契约审计](../../../.context/collaboration/packets/t10-weapon-contract-audit.json)

## 新增包分布

| 模块 | 新增 | 无前置依赖 | 有依赖 |
| --- | ---: | ---: | ---: |
| 物品与交互 | 42 | 32 | 10 |
| 通用算法 | 8 | 6 | 2 |
| 编辑器 | 3 | 3 | 0 |
| 地图与谜题 | 8 | 5 | 3 |
| 工坊与联机 | 5 | 5 | 0 |
| 武器、怪物与宠物 | 28 | 2 | 26 |
| 运行时整合契约 | 8 | 8 | 0 |
| 存档 | 4 | 4 | 0 |
| 界面与渲染 | 4 | 4 | 0 |

## 包目录

定义在 `.context/collaboration/packets/`。下表列出本轮新增的 110 个包；原有 `t10-source-ast-inventory`、`t10-accessory-contracts`、`t10-potion-base-contracts`、`t10-weapon-contract-audit` 四个包继续保留。已提交定义保持不可改写，需要改变范围时使用新 ID。

| ID | 交付 | 类型 | 前置包 |
| --- | --- | --- | --- |
| [t10-keys-coins](../../../.context/collaboration/packets/t10-keys-coins.json) | 钥匙、万能钥匙与金币契约 | 类契约实现 | 无 |
| [t10-scroll-core](../../../.context/collaboration/packets/t10-scroll-core.json) | 卷轴基类的非 DOM 生命周期 | 类契约实现 | 无 |
| [t10-chess-pieces](../../../.context/collaboration/packets/t10-chess-pieces.json) | 棋子基类与四种棋子的移动契约 | 类契约实现 | 无 |
| [t10-trap-core](../../../.context/collaboration/packets/t10-trap-core.json) | 陷阱基类与落石、地刺、失明陷阱 | 类契约实现 | 无 |
| [t10-conveyor-items](../../../.context/collaboration/packets/t10-conveyor-items.json) | 传送带与卷轴滚动墙契约 | 类契约实现 | 无 |
| [t10-bandages-flares](../../../.context/collaboration/packets/t10-bandages-flares.json) | 急救绷带与照明弹生命周期 | 类契约实现 | 无 |
| [t10-pulse-pressure-switches](../../../.context/collaboration/packets/t10-pulse-pressure-switches.json) | 脉冲器与压感开关契约 | 类契约实现 | 无 |
| [t10-color-switches](../../../.context/collaboration/packets/t10-color-switches.json) | 红蓝、绿紫开关与四色砖块 | 类契约实现 | 无 |
| [t10-challenge-stone](../../../.context/collaboration/packets/t10-challenge-stone.json) | 挑战石碑的独立状态契约 | 类契约实现 | 无 |
| [t10-obstacles-obsidian](../../../.context/collaboration/packets/t10-obstacles-obsidian.json) | 便携路障与黑曜石生命周期 | 类契约实现 | 无 |
| [t10-liquid-buckets](../../../.context/collaboration/packets/t10-liquid-buckets.json) | 岩浆及五种桶的独立契约 | 类契约实现 | 无 |
| [t10-poison-smoke-items](../../../.context/collaboration/packets/t10-poison-smoke-items.json) | 毒气、毒液与烟雾物品契约 | 类契约实现 | 无 |
| [t10-basin-compass](../../../.context/collaboration/packets/t10-basin-compass.json) | 洗身砚与时空罗盘的状态契约 | 类契约实现 | 无 |
| [t10-camp-services](../../../.context/collaboration/packets/t10-camp-services.json) | 存档点、重铸台与神龛触发契约 | 类契约实现 | 无 |
| [t10-merchants-well](../../../.context/collaboration/packets/t10-merchants-well.json) | 商人、探险家、赌徒与许愿井契约 | 类契约实现 | 无 |
| [t10-altar-core](../../../.context/collaboration/packets/t10-altar-core.json) | 祭坛基类的激活与奖励契约 | 类契约实现 | 无 |
| [t10-torch-fire](../../../.context/collaboration/packets/t10-torch-fire.json) | 火把与火焰物品生命周期 | 类契约实现 | 无 |
| [t10-webs-nets](../../../.context/collaboration/packets/t10-webs-nets.json) | 蛛网、渔网陷阱与渔网契约 | 类契约实现 | 无 |
| [t10-thorn-plants](../../../.context/collaboration/packets/t10-thorn-plants.json) | 荆棘种子与荆棘丛契约 | 类契约实现 | 无 |
| [t10-guard-ranged-plants](../../../.context/collaboration/packets/t10-guard-ranged-plants.json) | 护卫、远射种子与植物契约 | 类契约实现 | 无 |
| [t10-energy-plants-furnace](../../../.context/collaboration/packets/t10-energy-plants-furnace.json) | 吸能种子、能量草与能量熔炉 | 类契约实现 | 无 |
| [t10-spawners-whirlwinds](../../../.context/collaboration/packets/t10-spawners-whirlwinds.json) | 刷怪笼、旋风物品与磨刀石契约 | 类契约实现 | 无 |
| [t10-portal-items](../../../.context/collaboration/packets/t10-portal-items.json) | 普通、折跃与沉浸式传送门物品 | 类契约实现 | 无 |
| [t10-map-quest-items](../../../.context/collaboration/packets/t10-map-quest-items.json) | 定位地图、旗帜、奖杯与寻宝戒指 | 类契约实现 | 无 |
| [t10-crystal-runes](../../../.context/collaboration/packets/t10-crystal-runes.json) | 魔法水晶与符文圈契约 | 类契约实现 | 无 |
| [t10-containers](../../../.context/collaboration/packets/t10-containers.json) | 罐子与空罐子的内容、破碎契约 | 类契约实现 | 无 |
| [t10-fences](../../../.context/collaboration/packets/t10-fences.json) | 栅栏及木、石、铁栅栏契约 | 类契约实现 | 无 |
| [t10-bomb-core](../../../.context/collaboration/packets/t10-bomb-core.json) | 炸弹基类的引爆与范围契约 | 类契约实现 | 无 |
| [t10-display-logic-items](../../../.context/collaboration/packets/t10-display-logic-items.json) | 文本框、告示牌及逻辑物品契约 | 类契约实现 | 无 |
| [t10-books-formulas](../../../.context/collaboration/packets/t10-books-formulas.json) | 书架、泉水与配方卷轴契约 | 类契约实现 | 无 |
| [t10-npc-contract-item](../../../.context/collaboration/packets/t10-npc-contract-item.json) | 佣兵契约与自定义 NPC 入口契约 | 类契约实现 | 无 |
| [t10-path-primitives](../../../.context/collaboration/packets/t10-path-primitives.json) | 路径、方向与回溯基础算法 | 算法/接口实现 | 无 |
| [t10-portal-geometry](../../../.context/collaboration/packets/t10-portal-geometry.json) | 传送门方向与墙壁旋转算法 | 算法/接口实现 | 无 |
| [t10-color-math](../../../.context/collaboration/packets/t10-color-math.json) | 颜色解析与混色算法 | 算法/接口实现 | 无 |
| [t10-fusion-list-helpers](../../../.context/collaboration/packets/t10-fusion-list-helpers.json) | 融合增益、附魔合并与提示算法 | 算法/接口实现 | 无 |
| [t10-spawn-selection](../../../.context/collaboration/packets/t10-spawn-selection.json) | 怪物引入与加权随机选择 | 算法/接口实现 | 无 |
| [t10-ending-certificates](../../../.context/collaboration/packets/t10-ending-certificates.json) | 结局评级与死亡凭证格式 | 算法/接口实现 | 无 |
| [t10-editor-history](../../../.context/collaboration/packets/t10-editor-history.json) | 编辑器深拷贝、快照与撤销核心 | 算法/接口实现 | 无 |
| [t10-cave-kernel](../../../.context/collaboration/packets/t10-cave-kernel.json) | 洞穴元胞、连通区域与评分核心 | 算法/接口实现 | 无 |
| [t10-sokoban-solver](../../../.context/collaboration/packets/t10-sokoban-solver.json) | 推箱子搜索、生成与质量评估核心 | 类契约实现 | 无 |
| [t10-seed-search](../../../.context/collaboration/packets/t10-seed-search.json) | 种子筛选的调度与判定核心 | 算法/接口实现 | 无 |
| [t10-manager-data](../../../.context/collaboration/packets/t10-manager-data.json) | 关卡管理器的离线数据请求契约 | 算法/接口实现 | 无 |
| [t10-workshop-data](../../../.context/collaboration/packets/t10-workshop-data.json) | 游戏内工坊的离线请求契约 | 算法/接口实现 | 无 |
| [t10-monster-contract-audit](../../../.context/collaboration/packets/t10-monster-contract-audit.json) | 怪物基类全部成员的契约审计 | 源码审计与契约测试 | 无 |
| [t10-pet-contract-audit](../../../.context/collaboration/packets/t10-pet-contract-audit.json) | 宠物基类及装备管理的契约审计 | 源码审计与契约测试 | 无 |
| [t10-turn-movement-audit](../../../.context/collaboration/packets/t10-turn-movement-audit.json) | 玩家移动、回合与怪物调度审计 | 源码审计与契约测试 | 无 |
| [t10-inventory-actions-audit](../../../.context/collaboration/packets/t10-inventory-actions-audit.json) | 背包、装备、拾取与交易契约审计 | 源码审计与契约测试 | 无 |
| [t10-main-generation-audit](../../../.context/collaboration/packets/t10-main-generation-audit.json) | 主地牢、楼层切换与内容放置审计 | 源码审计与契约测试 | 无 |
| [t10-special-floors-audit](../../../.context/collaboration/packets/t10-special-floors-audit.json) | 沉没迷宫、图书馆与首领层审计 | 源码审计与契约测试 | 无 |
| [t10-tutorial-professions-audit](../../../.context/collaboration/packets/t10-tutorial-professions-audit.json) | 教程、职业与新游戏启动契约审计 | 源码审计与契约测试 | 无 |
| [t10-weather-terrain-audit](../../../.context/collaboration/packets/t10-weather-terrain-audit.json) | 天气、地形、水域与环境顺序审计 | 源码审计与契约测试 | 无 |
| [t10-fusion-engine-audit](../../../.context/collaboration/packets/t10-fusion-engine-audit.json) | 融合配方、增益计算与提交顺序审计 | 源码审计与契约测试 | 无 |
| [t10-save-items-cells-audit](../../../.context/collaboration/packets/t10-save-items-cells-audit.json) | 物品与单元格存档格式审计 | 源码审计与契约测试 | 无 |
| [t10-save-monsters-audit](../../../.context/collaboration/packets/t10-save-monsters-audit.json) | 怪物存档与恢复契约审计 | 源码审计与契约测试 | 无 |
| [t10-save-floors-audit](../../../.context/collaboration/packets/t10-save-floors-audit.json) | 楼层对象图存档与恢复审计 | 源码审计与契约测试 | 无 |
| [t10-save-envelope-audit](../../../.context/collaboration/packets/t10-save-envelope-audit.json) | 整体存档、设置与导入导出审计 | 源码审计与契约测试 | 无 |
| [t10-script-facade-audit](../../../.context/collaboration/packets/t10-script-facade-audit.json) | 自定义 NPC、脚本 API 与界面元素审计 | 源码审计与契约测试 | 无 |
| [t10-editor-tools-audit](../../../.context/collaboration/packets/t10-editor-tools-audit.json) | 编辑器放置、填充、复制与规则审计 | 源码审计与契约测试 | 无 |
| [t10-editor-ui-import-audit](../../../.context/collaboration/packets/t10-editor-ui-import-audit.json) | 属性面板、地图导入与编辑试玩审计 | 源码审计与契约测试 | 无 |
| [t10-main-canvas-audit](../../../.context/collaboration/packets/t10-main-canvas-audit.json) | 主画布、单元格与动画渲染审计 | 源码审计与契约测试 | 无 |
| [t10-minimap-camera-audit](../../../.context/collaboration/packets/t10-minimap-camera-audit.json) | 大地图、小地图与相机交互审计 | 源码审计与契约测试 | 无 |
| [t10-input-hud-audit](../../../.context/collaboration/packets/t10-input-hud-audit.json) | 键盘、触摸、滑动与 HUD 契约审计 | 源码审计与契约测试 | 无 |
| [t10-menus-inventory-ui-audit](../../../.context/collaboration/packets/t10-menus-inventory-ui-audit.json) | 菜单、背包、装备与通知界面审计 | 源码审计与契约测试 | 无 |
| [t10-manager-ui-launch-audit](../../../.context/collaboration/packets/t10-manager-ui-launch-audit.json) | 关卡管理器列表、详情与启动路由审计 | 源码审计与契约测试 | 无 |
| [t10-socket-contract-audit](../../../.context/collaboration/packets/t10-socket-contract-audit.json) | 联机连接、事件与同步数据审计 | 源码审计与契约测试 | 无 |
| [t10-cdn-bootstrap-audit](../../../.context/collaboration/packets/t10-cdn-bootstrap-audit.json) | CDN、图标缓存与离线启动契约审计 | 源码审计与契约测试 | 无 |
| [t10-challenge-runtime-audit](../../../.context/collaboration/packets/t10-challenge-runtime-audit.json) | 挑战房间、奖励和失败回收审计 | 源码审计与契约测试 | 无 |
| [t10-portal-runtime-audit](../../../.context/collaboration/packets/t10-portal-runtime-audit.json) | 传送、楼层与传送带运行时审计 | 源码审计与契约测试 | 无 |
| [t10-potion-restoration](../../../.context/collaboration/packets/t10-potion-restoration.json) | 治疗、能量与强化药水子类 | 类契约实现 | `t10-potion-base-contracts` |
| [t10-potion-stealth-mystery](../../../.context/collaboration/packets/t10-potion-stealth-mystery.json) | 隐身、透视与神秘药水子类 | 类契约实现 | `t10-potion-base-contracts` |
| [t10-potion-harmful-elements](../../../.context/collaboration/packets/t10-potion-harmful-elements.json) | 腐蚀、毒、盲、冰与抗火药水 | 类契约实现 | `t10-potion-base-contracts` |
| [t10-potion-terrain](../../../.context/collaboration/packets/t10-potion-terrain.json) | 药水桶与药水液的地形作用 | 类契约实现 | `t10-potion-base-contracts` |
| [t10-trap-advanced](../../../.context/collaboration/packets/t10-trap-advanced.json) | 召唤、烈焰与虫洞陷阱子类 | 类契约实现 | [t10-trap-core](../../../.context/collaboration/packets/t10-trap-core.json) |
| [t10-scroll-buffs](../../../.context/collaboration/packets/t10-scroll-buffs.json) | 迅捷、神秘、贪婪、清净与时间卷轴 | 类契约实现 | [t10-scroll-core](../../../.context/collaboration/packets/t10-scroll-core.json) |
| [t10-scroll-spatial](../../../.context/collaboration/packets/t10-scroll-spatial.json) | 易位与跃迁卷轴子类 | 类契约实现 | [t10-scroll-core](../../../.context/collaboration/packets/t10-scroll-core.json) |
| [t10-scroll-solar-verbal](../../../.context/collaboration/packets/t10-scroll-solar-verbal.json) | 太阳、真言与湮灭卷轴子类 | 类契约实现 | [t10-scroll-core](../../../.context/collaboration/packets/t10-scroll-core.json) |
| [t10-scroll-enchantment-audit](../../../.context/collaboration/packets/t10-scroll-enchantment-audit.json) | 附魔与大师附魔卷轴完整契约审计 | 源码审计与契约测试 | 无 |
| [t10-altar-rewards](../../../.context/collaboration/packets/t10-altar-rewards.json) | 物品、耐久与扩容祭坛子类 | 类契约实现 | [t10-altar-core](../../../.context/collaboration/packets/t10-altar-core.json) |
| [t10-potion-bomb](../../../.context/collaboration/packets/t10-potion-bomb.json) | 药水弹的爆炸与状态子类契约 | 类契约实现 | [t10-bomb-core](../../../.context/collaboration/packets/t10-bomb-core.json) |
| [t10-weapon-core](../../../.context/collaboration/packets/t10-weapon-core.json) | 武器基类的完整非界面契约实现 | 类契约实现 | `t10-weapon-contract-audit` |
| [t10-weapons-melee](../../../.context/collaboration/packets/t10-weapons-melee.json) | 近战武器与吸血、剧毒子类 | 类契约实现 | [t10-weapon-core](../../../.context/collaboration/packets/t10-weapon-core.json) |
| [t10-weapons-sweep-whip](../../../.context/collaboration/packets/t10-weapons-sweep-whip.json) | 扫帚、荆棘鞭与斜方刀 | 类契约实现 | [t10-weapon-core](../../../.context/collaboration/packets/t10-weapon-core.json) |
| [t10-weapons-projectiles](../../../.context/collaboration/packets/t10-weapons-projectiles.json) | 火箭筒、回旋镖与穿云箭 | 类契约实现 | [t10-weapon-core](../../../.context/collaboration/packets/t10-weapon-core.json) |
| [t10-weapons-frost-fire](../../../.context/collaboration/packets/t10-weapons-frost-fire.json) | 冰霜法杖与喷火枪 | 类契约实现 | [t10-weapon-core](../../../.context/collaboration/packets/t10-weapon-core.json) |
| [t10-weapons-lightning](../../../.context/collaboration/packets/t10-weapons-lightning.json) | 闪电链与雷电法杖 | 类契约实现 | [t10-weapon-core](../../../.context/collaboration/packets/t10-weapon-core.json) |
| [t10-weapons-force](../../../.context/collaboration/packets/t10-weapons-force.json) | 重力锤、大地猛击锤与冲撞牛角 | 类契约实现 | [t10-weapon-core](../../../.context/collaboration/packets/t10-weapon-core.json) |
| [t10-weapons-summon-wind](../../../.context/collaboration/packets/t10-weapons-summon-wind.json) | 橡木、死灵法杖与追踪风弹 | 类契约实现 | [t10-weapon-core](../../../.context/collaboration/packets/t10-weapon-core.json) |
| [t10-weapons-economy-tools](../../../.context/collaboration/packets/t10-weapons-economy-tools.json) | 神偷手、金币枪、磁铁与钩索 | 类契约实现 | [t10-weapon-core](../../../.context/collaboration/packets/t10-weapon-core.json) |
| [t10-weapons-special-magic](../../../.context/collaboration/packets/t10-weapons-special-magic.json) | 恐惧、陨石、充能与魔法师法杖 | 类契约实现 | [t10-weapon-core](../../../.context/collaboration/packets/t10-weapon-core.json) |
| [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) | 怪物基类的非渲染行为实现 | 类契约实现 | [t10-monster-contract-audit](../../../.context/collaboration/packets/t10-monster-contract-audit.json) |
| [t10-monsters-basic](../../../.context/collaboration/packets/t10-monsters-basic.json) | 基础变体、吸血鬼与仙人掌怪物 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-monsters-ghost-water](../../../.context/collaboration/packets/t10-monsters-ghost-water.json) | 幽灵、水怪、复活与墓碑 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-monsters-centipede](../../../.context/collaboration/packets/t10-monsters-centipede.json) | 蜈蚣主体与部位契约 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-monsters-giant](../../../.context/collaboration/packets/t10-monsters-giant.json) | 巨人主体与部位契约 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-monsters-guard-projectiles](../../../.context/collaboration/packets/t10-monsters-guard-projectiles.json) | 守卫、娃娃及移动弹幕 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-boss-throne](../../../.context/collaboration/packets/t10-boss-throne.json) | 王座守护者状态机契约 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-boss-wizards](../../../.context/collaboration/packets/t10-boss-wizards.json) | 魔法师与大魔法师状态机 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-monsters-status-thieves](../../../.context/collaboration/packets/t10-monsters-status-thieves.json) | 蜘蛛、腐蚀、盗贼与吸能怪物 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-monsters-summoners](../../../.context/collaboration/packets/t10-monsters-summoners.json) | 召唤师、萨满及仆从、佣兵 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-monsters-slimes-teleport](../../../.context/collaboration/packets/t10-monsters-slimes-teleport.json) | 分裂、史莱姆、瞬移与伪装怪物 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-monsters-hazards-patrol](../../../.context/collaboration/packets/t10-monsters-hazards-patrol.json) | 炸弹、旋风、巡逻与远射怪物 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-boss-minotaur](../../../.context/collaboration/packets/t10-boss-minotaur.json) | 米诺陶阶段、冲撞与迷宫交互 | 类契约实现 | [t10-monster-core](../../../.context/collaboration/packets/t10-monster-core.json) |
| [t10-pet-core](../../../.context/collaboration/packets/t10-pet-core.json) | 宠物非界面状态机与装备核心 | 类契约实现 | [t10-pet-contract-audit](../../../.context/collaboration/packets/t10-pet-contract-audit.json) |
| [t10-pets-mount-panda](../../../.context/collaboration/packets/t10-pets-mount-panda.json) | 马与熊猫子类契约 | 类契约实现 | [t10-pet-core](../../../.context/collaboration/packets/t10-pet-core.json) |
| [t10-pets-elemental](../../../.context/collaboration/packets/t10-pets-elemental.json) | 火蜥蜴、水母与小书魔 | 类契约实现 | [t10-pet-core](../../../.context/collaboration/packets/t10-pet-core.json) |
| [t10-path-search](../../../.context/collaboration/packets/t10-path-search.json) | BFS、A 星与视线搜索契约 | 算法/接口实现 | [t10-path-primitives](../../../.context/collaboration/packets/t10-path-primitives.json) |
| [t10-main-room-geometry](../../../.context/collaboration/packets/t10-main-room-geometry.json) | 主游戏房间、走廊和门几何 | 算法/接口实现 | [t10-main-generation-audit](../../../.context/collaboration/packets/t10-main-generation-audit.json) |
| [t10-maze-kernel](../../../.context/collaboration/packets/t10-maze-kernel.json) | 主游戏迷宫生长、连通与最终化 | 算法/接口实现 | [t10-main-room-geometry](../../../.context/collaboration/packets/t10-main-room-geometry.json) |
| [t10-chess-solver](../../../.context/collaboration/packets/t10-chess-solver.json) | 棋盘放置、威胁计数与布局求解 | 算法/接口实现 | [t10-chess-pieces](../../../.context/collaboration/packets/t10-chess-pieces.json) |
| [t10-fusion-buff-engine](../../../.context/collaboration/packets/t10-fusion-buff-engine.json) | 融合增益计算的非界面实现 | 算法/接口实现 | `t10-fusion-engine-audit`, `t10-fusion-list-helpers`, `t10-weapon-core` |

## 验证与剩余工作

已验证 110 个定义、503 个精确 AST 源码锚点、依赖存在且无环、所有新旧包的允许任务路径不重叠，以及数值/空值/多参数子类的编译兼容性。共享接口调整后，8 个源码哈希、5 个完整性测试、严格类型检查、110 个领域测试及生产构建通过；初次检查发现并修正了灌木丛的窄返回类型声明。原始输出和校验值见 [verification.json](verification.json)。

审计包只证明源行为与依赖；实现包多数证明隔离契约。完整可玩游戏、真实 actor/world 整合、React 界面、存档互载、在线服务和最终端到端验收仍需利用这些成果继续完成，不能把 114 个已分配包写成 114 个已完成包。总任务范围仍以 TASK 和 FEATURE-MATRIX 为准。

当前主模型证据：[本轮报告](../../../.context/fingerprints/20261009T091343Z-0e4cf368/report.json)。角色 `primary`，门控 `CONTINUE`；每个新轮次重新指纹。
