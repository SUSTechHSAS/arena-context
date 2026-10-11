# 工作包 t10-color-math：颜色解析与混色算法

- 包定义：`.context/collaboration/packets/t10-color-math.json`（主模型指纹 `20261009T091343Z-0e4cf368`，引入提交 `4cc1298`）
- 本轮运行：`.context/collaboration/runs/20261011T032501Z-38446eb4/`（子模型指纹 `20261011T032501Z-38446eb4`，起点 `545e0f1`，即已接受的 `task/10/main`）
- 参考快照：`reference/chinese-dungeon/ChineseDungeon.html`，上游 `8d80b5a4dd3d737ed6d3060f05611eaa3de611ab`（`reference/manifest.json` 校验过的 8 个文件之一）

## 覆盖范围

| 原始声明 | HTML 行 | 候选实现 | 说明 |
| --- | --- | --- | --- |
| `hexToRgba(hex, alpha)` | 51756-51768 | `createColorMath().hexToRgba` | 纯函数，无外部效果 |
| `hexToRgb(hex)` | 51770-51777 | `createColorMath().hexToRgb` | 返回 `[r, g, b]` 三元组 |
| `blendColors(hexArray)` | 51778-51885 | `createColorMath().blendColors` | 内部子函数 `rgbToHsl`、`hslToRgb`、`rgbToHex` 与源码同序移植；`hexToRgb` 复用本模块的候选实现 |

- 源码移植：`app/src/domain/color-math.ts`。表达式、运算顺序与浮点运算顺序保持源码形式，以保证逐位相同的结果。
- ports：`ColorMathPorts` 为空接口。这三个函数不读取可变世界状态，不使用 RNG、时钟、DOM 或网络，因此端口面为空；`createColorMath(_ports)` 保留该签名以便后续包统一接入。
- 原始实现由 `test/oracle/source.ts` 从参考 HTML 的精确 AST 区间执行（vm 独立上下文），候选实现与之并行比较，不共享对象。

## 测试与差分方法

`app/test/oracle/color-math-fixture.ts` 与 `app/test/color-math.test.ts`：

- 完整 suite 共 **12,397** 行：`hexToRgba` 936、`hexToRgb` 10,231、`blendColors` 1,230。每一行比较返回值（逐位，`Object.is`）或错误名与消息。
- `hexToRgba`：39 个输入形式（936 行 = 39 × (1 + 22 + 1)）（规范 6 位、大小写、带 `#`、3 位、非十六进制、空串、`null`/`undefined`/数字/数组/对象等）× 22 个 alpha（falsy、truthy、数字、字符串、对象、`Symbol`）× 调用元数（一参/显式 undefined）。
- `hexToRgb`：4096 个 3 位颜色（带/不带 `#`）、2000 个由固定种子生成的混合字符串（长度 0-10，含 `#`、`-`、空白、`g/x/z`）、非字符串输入。
- `blendColors`：空数组、单色、色相边界（红/绿/蓝、红/洋红、红/青、互补色、灰色）、1200 个固定种子随机数组（长度 1-7，含大小写与 `#` 变体）、畸形条目、非数组、稀疏数组。
- 突变检测：在候选源码上做 4 处边界/顺序突变（`hex.length === 3` → `<= 3`；`if (alpha)` → `!== undefined`；`Math.round` → `Math.floor`；`(g < b ? 6 : 0)` → `(g > b ? 6 : 0)`），全部被 suite 检出。突变在临时转写副本中进行，跟踪的源码不变。
- 另有显式断言记录源码行为（见下节），且它们同时与原始实现比较。

## 已保留的源码行为（未修复，供主模型复核）

1. `hexToRgba` 的 alpha 使用真值判断：`alpha` 为 `0`、`''`、`NaN`、`null`、`false` 时输出不透明的 `rgb(...)`。调用点 `显示格子特效`（HTML 44251）的渐变 0% 停止点为 `hexToRgba(颜色, 0)`，因此源码中该停止点是不透明的。这可能与作者意图不一致，记为待审核的源码行为。
2. `hexToRgba` 不去除 `#`：`'#ff0000'` 输出 `rgb(NaN, 240, 0)`。已确认的调用点（默认值 `"FF0000"`，44189/44251）传入的是不带 `#` 的 6 位十六进制，因此在现有调用中不触发。
3. `hexToRgb` 只去除一个前导 `#`，只对长度恰为 3 的字符串扩展；其他长度直接交给 `parseInt(hex, 16)`，因此出现部分解析（`'12g456'` 解析为 `0x12`）、负号（`'-f0000'` 得到负数，再经 `>>` 与 `& 0xff` 取低位）以及超过 32 位的值按 `ToInt32` 回绕。非十六进制串得到 0 通道。
4. `blendColors` 的空数组返回 `#000000`；色相使用向量平均；颜色为 `s = 0` 时直接为灰度；非数组、`null` 条目与稀疏数组抛出 `TypeError`（与原始实现消息一致）。
5. `hexToRgba` 与 `blendColors` 的 `null`、对象、`Symbol` 等非字符串输入：`hexToRgba` 在 `alpha` 真值且不可转换为字符串时抛出 `TypeError`（suite 中 250 个错误用例均为此类，且两侧一致）。

以上均未修复。若要修正，应由主模型或 Kibiandkimi 决定并在 `DEVIATIONS.md` 中以新的 SRC 编号登记；子模型不改动共享文档。

## 限制

- 本包只证明这三个纯函数的隔离契约。颜色在实际渲染中的使用（画布、CSS 渐变、`玩家状态` 收集、HUD）仍属于后续渲染与 UI 集成包，未覆盖。
- 差分比较的范围是本 suite 的输入；它不是对所有输入的形式化证明，具体覆盖以上列出的行数为准。
- 测试数据由固定种子 LCG 生成（仅测试使用，候选实现不使用随机数）。

## 验证

- `cd app && npm ci --ignore-scripts`（本轮首次安装，68 个包）
- `npm run typecheck`：通过（退出码 0）
- `npx vitest run test/color-math.test.ts`：10/10 通过（约 10 s）
- `npm run check`（含 `check:reference`、typecheck、全量 `npm test`、`vite build`）：结果见本轮 `result.md`。

## 下一步

- 主模型复核：核对源码锚点、端口面、突变设计与第 1 条 alpha 行为是否需要登记为 SRC。
- 不修改其他包，不改 TASK/DECISIONS/共享规则。
