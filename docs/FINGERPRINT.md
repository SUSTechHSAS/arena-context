# 同轮数字指纹

用户明确要求每个工作轮次独立采样，并假定同轮的多个模型请求来自相同模型。实施顺序：prepare → 当前模型直接生成数字 → 原样写 raw.json → score → 输出摘要 → 同轮继续任务。

现在最后一步受接受名单控制：仅 Clear match 且具体模型 ID 在 main 的 `.github/fingerprint-policy.json` 中才继续。其他结果直接结束轮次。接受名单不按系列或名称前缀扩展，上游新增模型也不会自动获得工作权限。

## 命令与记录

在真实的 work/... 或 arena/... 分支运行：

```sh
node .github/scripts/fingerprint.mjs prepare
# 模型自己回答输出的英文 JSON 探针；把原样数组写入返回的 raw_path。
node .github/scripts/fingerprint.mjs score <turn_id>
```

prepare 不调用模型，也不生成探针数字。它先读取受保护 main 上的中央名单，冻结本轮政策快照，再同步上游数据并输出提示词；工作分支中的名单副本不能自行授予权限。政策读取失败就直接 END_TURN。score 只运行本地确定性统计程序，立即给出结果和 gate，不等待 GitHub Actions。每个目录保存 manifest.json、raw.json、report.json；banks/ 按内容哈希保存本轮实际数据。

`status=match` 对应网站的 Clear match；还必须满足确切模型 ID 在接受列表内，才有 `gate.action=CONTINUE`。否则是 END_TURN、退出码 20。它是预期的拒绝，不是让 agent 修复或重试的普通错误。拒绝后只输出原因并结束，不继续分析任务、修改文件、执行工具、提交或推送。记录已由命令保存到本地；若会话随后丢失，不保证该拒绝记录已同步到 GitHub。通过后才更新 STATE 并按原流程远程保存。

记录包含原始样本哈希、提示词、实际长度、候选/拟合/差距、bank 版本与哈希、数据是否新鲜，以及 `same_model_within_turn=assumed_by_user`。重复 score 返回已冻结结果；样本被改动会报错，不能通过补数或重复采样筛选模型。

历史工作不能补测过去的模型；此前的检查点标注 not recorded。指纹不是性能测试或身份认证，不能替代 Kibiandkimi 审核，也不允许提前解码被延后的任务。

## 与网站同步

每轮 prepare 读取 https://whatsmyllm.com/ 的版本、bank URL、发布的 SHA-256 和当前英文 JSON 探针，并获取 `/data/gates.json`、`/data/verdict.json` 的数值规则。新的兼容模型指纹数据会在下一次 prepare 立即采用，冻结为本轮快照；score 不在生成样本后更换参考库。

联网失败时优先使用已保存的最近兼容快照，再退回随仓库提供的 seed，并明确输出 cached-fallback 与失败原因。可单独运行 `node .github/scripts/fingerprint.mjs refresh` 检查上游版本，不调用任何模型、不生成样本。

只自动更新数据，不自动执行外站的新代码。检查了网站 core、gates、verdict 脚本的已审阅哈希：若评分逻辑变化，记录 engine_update_required 并保留旧兼容快照，需维护 PR 更新后才使用新的算法。这避免把新数据与不兼容的旧算法混用。实时同步以成功联网及上游仍兼容为前提。

## 评分与来源

核心来自 MIT 许可的 [ModelTrace](https://github.com/xqy2006/ModelTrace)，原样保存及附带 LICENSE；来源提交、网站代码哈希在 `.github/vendor/modeltrace/provenance.json`。输入门槛和拟合判定按网站公开的数值规则独立实现，并用网站示例校验一致性。输入通道限定为一个 JSON 整数数组，避免把说明文字混进样本。

结果为 match、family_only、insufficient、invalid 或 unscored，均保留 `identity_verified=false`、`arena_protocol_calibrated=false`。只有接受列表中的 match 才允许工作，其余结束轮次。展示候选与拟合值，不把候选库内 softmax 份额称作真实身份概率。单轮单样本不沿用网站三份独立样本的准确率。

协议 CI 核对原始样本哈希、重新评分，并用受保护 main 上的当前名单再次检查门槛。历史记录不能冒充本轮通行证，已拒绝的报告不能用于工作。修改 main 上的名单会自动重检开放任务 PR；不必为每个任务复制一份新名单。

引入门槛前已经保存的检查点在 `.github/fingerprint-legacy.json` 中固定，仍可由用户审核，不追溯伪造指纹。无新指纹时只允许这些既有文件及其协议/交接元数据迁移；新增业务文件、修改计划/代码等需要本轮通过的报告。

本地退出码和明确指令控制合规 agent 的工作流程，CI 额外阻止不满足条件的成果合入。当前 GitHub 连接方式无法强制终止 Arena 服务端模型进程或拦截所有工具调用，不能把它描述为进程级终止开关。
