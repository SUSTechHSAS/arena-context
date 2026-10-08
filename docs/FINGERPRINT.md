# 同轮数字指纹

Arena 任务每个用户轮次独立采样，默认使用 [LM Fingerpoint Detector](https://lm.ikale.io/) 的参考库和 `shared-detector-v2` 评分器。按用户约定，同一轮假定模型不变；跨轮不复用样本。维护者在 `meta/...` 分支更新本仓库时不执行 Arena 任务门控。

## 命令与记录

在有 `.context/TASK.md` 的实际 `work/...` 或 `arena/...` 分支运行：

```sh
node .github/scripts/fingerprint.mjs prepare
# 当前模型直接回答三道探针，输出 FINGERPRINT_RAW。
# 将三条回答按顺序放在一个 JSON 数组中，原样保存到返回的 raw_path。
node .github/scripts/fingerprint.mjs score <turn_id>
```

`prepare` 不调用模型，不生成探针答案。它先在线读取受保护 main 的中央接受名单，再冻结本轮 bank、检测器、校准参数和三道英文 JSON 探针。探针来自上游固定采样集 `environment-06`，分别要求 301、319、327 个 1–355 的整数。原始文件形状为 `[[第一条回答的整数], [第二条回答的整数], [第三条回答的整数]]`，实际文件中不能有说明文字或占位符。

三条回答都由当前模型在本用户轮次生成，不使用其他模型、API、工具或随机数生成器选数；不能复制一条回答、把单条回答切成三份、补数、修复或重复采样挑选结果。每条至少有 `max(80, ceil(请求数量 × 0.55))` 个有效整数。保留原有的常数、单调、等差、低多样性检查，并拒绝相同的重复回答。数量不完全相等会记录 `exact_count=false`，不偷偷截断或补齐。

每轮目录保存 `manifest.json`、`raw.json`、`report.json`；`banks/<package_id>.json` 保存按内容哈希寻址的完整 bank 和 detector，使用 gzip/base64 封装。重复 `score` 返回已冻结结果；原始文件有任何改动会报错。评分在本地完成，不向检测网站或模型接口上传回答。

## 统计结果与工作门槛

网站提供的是参考库内的校准分数，没有“允许工作”的阈值。仓库采用独立且明确的规则：

1. 三条回答都通过输入检查，且校准参数与 detector、模型顺序及参考库哈希绑定。
2. 按库内校准分数从高到低，取累计分数至少达到 **95%** 的最小完整类别集合，并包含边界上所有并列类别。遍历整个库，不截断为展示用的前三名。
3. 将类别展开为具体模型 ID，得到 `reference_models`；所有 ID 都必须在 protected main 的 `.github/fingerprint-policy.json` 中。

95% 是本仓库的工作规则，不是网站的认证门槛，也不是身份识别准确率。它只描述库内分数的累计份额。库外模型也可能得到很高的库内分数；同一会话三次回答的相关性也未被上游独立对话评估覆盖。因此始终保留 `identity_verified=false`、`arena_protocol_calibrated=false`、`identified_candidate=null` 和上游的 `upstream_decision=not_confirmed`。

`status=reference_match` 表示集合展开后只有一个具体 ID；`reference_ambiguity` 表示多个 ID。仅当全部获准时返回 `gate.allowed=true`、`gate.action=CONTINUE`、`gate.reason=accepted_reference_set`。展示候选中的 `reference_probability` 明确是库内分数，不称为真实后端身份概率。集合中的任何未获准 ID、校准缺失、无效/不足输入或政策缺失均拒绝。

名单仍保留原来的六个具体模型 ID。仅对已核对的上游名称作以下显式映射，不做通用替换、系列或前缀匹配：

| 上游类别 ID | 必须获准的中央政策 ID |
| --- | --- |
| `claude-opus-5.5` | `claude-opus-5-5` |
| `claude-sonnet-5.5` | `claude-sonnet-5-5` |
| `claude-fable-5.1` | `claude-fable-5-1` |
| `gpt-6-astra`，上游显示 `gpt-6-astra/6.1-sol` | `gpt-6-astra` **和** `gpt-6.1-sol` |
| 其他 ID | 原样逐字匹配 |

上游明确将 Astra 与 6.1 Sol 的样本合为一个不可区分的指纹类别；不能因为它的内部 ID 是 `gpt-6-astra` 就只检查这一个名字。撤销两个 ID 中任意一个，含该类别的结果就会被拒绝。

`END_TURN` 和退出码 20 是预期的拒绝。Arena agent 输出实际结果与理由后立即结束，不重试、补样、继续任务或运行提交工具。通过时才把报告路径写入 STATE 并继续任务，随下一检查点推送原始记录和所用数据。拒绝记录只在本地保存，不能声称已上传。

## 数据来源与更新

数据和评分代码来自 MIT 许可的 [Ikaleio/lm-detector](https://github.com/Ikaleio/lm-detector)，随仓库保存许可证、来源提交及 SHA-256。内置快照为提交 `97eb41f78722d32524265bb259fe6258856ca470`，bank 构建时间为 `2026-10-08T13:07:32.556925+00:00`，包含 **57 个指纹类别、2,128 条回答、707,442 个有效整数**。精确来源和本地转换后的代码哈希见 `.github/vendor/fingerpoint/provenance.json`。

每次 `prepare` 通过 `api.github.com` 读取上游 main 的提交，再从该固定提交获取数据。对上游评分代码和固定探针集核对已审阅哈希，只同步兼容数据，不执行下载的代码；算法或探针集改变时记录 `engine_update_required`，使用最近兼容的 Fingerpoint 快照。bank、模型顺序、样本数、特征维数、校准绑定和数据哈希都须通过验证，不能把新库与旧检测器混用。

同步先读取固定提交下的 `shared/` 和 `data/` 文件元数据，核对 Git blob ID。两个数据文件均未变化时复用原始快照和 package ID，不重复下载约 33 MB 的未压缩数据。仅当数据改变时下载并核对 blob ID；HTTP 支持传输压缩，大文件下载单次最多 60 秒，失败仍使用明确标记的兼容缓存。

联网失败时优先用最近兼容的 Fingerpoint 缓存，再用内置快照，并输出 `cached-fallback` 和实际失败原因。不会因网络失败切换回 WhatsMyLLM。更新和中央政策读取都只使用允许的 GitHub API，不访问 `raw.githubusercontent.com` 或 API 的 `download_url`，不跟随跨主机重定向，不绕过代理或 TLS 校验。

```sh
# 检查当前兼容版本，不调用模型或产生样本。
node .github/scripts/fingerprint.mjs refresh

# 跳过 detector 更新；中央名单仍须在线读取。
node .github/scripts/fingerprint.mjs prepare --offline
```

HTTP 请求遵循标准代理和系统 CA；有代理时不回退到绕过代理的直连。名单读取失败直接拒绝，不能用工作分支上的副本授权。

## 为什么不把两站分数或样本直接相加

旧的 WhatsMyLLM 快照有 23 个型号、828 条参考回答。Fingerpoint 已导入 ModelTrace 的部分原始数据，并追加、重采、退役和重命名了多批样本；它不是对当前 WhatsMyLLM 全量库的简单超集。将两个站的输出视为独立证据相乘、投票或加权，会重复计算共享样本。直接拼接派生 bank 也不成立：中心、位置判别、近邻参考和校准参数必须一起重训。

因此这次采用已经整合多来源并重训的 Fingerpoint 库。若以后继续导入 WhatsMyLLM 的新增原始回答，需要先核对许可、采样提示、型号别名、渠道和推理参数，按原始样本去重，并使用独立留出集重新训练、校准和评估。较大的模型数量或总样本量本身不证明准确率更高，两个站不同评估集上的数字不能直接比较。

依据：[上游数据与变更记录](https://lm.ikale.io/docs/reference/data)、[排名与校准](https://lm.ikale.io/docs/principles/ranking)。尤其注意上游对 Astra/Sol 标签合并、旧 OpenAI 渠道样本替换的说明；恢复已退役的旧样本会抵消这些处理。

## 历史记录与 CI

schema 1 的 WhatsMyLLM 记录继续使用原来的一个数组、ModelTrace core 和 Clear match / Close call 规则复算。原有 `match`、`family_only` 和 `ambiguous_models` 不改写，不拿新算法追溯授予旧轮次权限。新 `prepare` 只产生 schema 2 的 Fingerpoint 记录。

协议 CI 从受信任的 base 执行评分器，将候选 PR 的记录作为数据读取；核对样本和完整快照哈希，独立重算新报告的完整候选集合、别名、输入检查、校准和分数，再按受保护 main 的当前名单判定。原报告必须已经允许工作；以后放宽名单不能把原拒绝记录变成通行证。历史豁免仍仅限 `.github/fingerprint-legacy.json` 固定的检查点。

main 的维护 PR 更新新任务模板；已有任务须通过各自的 `meta/<任务号>/...` PR 更新脚本、规则与文档，不能将不同任务历史合并。main 的名单、评分逻辑或 Fingerpoint vendor 数据变化会重检开放任务 PR。最终合并与任务内容接受仍由人工决定。

这种门控是统计审核证据，不是进程级权限隔离，不能强制停止 Arena 服务端进程，也不能替代人工审核。
