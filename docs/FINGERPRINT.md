# 同轮数字指纹

用户明确要求每个工作轮次独立采样，并假定同轮的多个模型请求来自相同模型。实施顺序：prepare → 当前模型直接生成数字 → 原样写 raw.json → score → 输出摘要 → 同轮继续任务。

## 命令与记录

在真实的 work/... 或 arena/... 分支运行：

```sh
node .github/scripts/fingerprint.mjs prepare
# 模型自己回答输出的英文 JSON 探针；把原样数组写入返回的 raw_path。
node .github/scripts/fingerprint.mjs score <turn_id>
```

prepare 不调用模型，也不生成探针数字。它生成记录 ID、同步上游数据并输出提示词。score 只运行确定性统计程序，不调用其他 LLM。每个目录保存 manifest.json、raw.json、report.json；banks/ 按内容哈希保存实际使用的上游数据。STATE 用 Fingerprint 字段链接最新报告。

记录包含原始样本哈希、提示词、实际长度、候选/拟合/差距、bank 版本与哈希、数据是否新鲜，以及 `same_model_within_turn=assumed_by_user`。重复 score 返回已冻结结果；样本被改动会报错，不能通过补数或重复采样筛选模型。

历史工作不能补测过去的模型；此前的检查点标注 not recorded。指纹不是性能测试或身份认证，不能替代 Kibiandkimi 审核，也不允许提前解码被延后的任务。

## 与网站同步

每轮 prepare 读取 https://whatsmyllm.com/ 的版本、bank URL、发布的 SHA-256 和当前英文 JSON 探针，并获取 `/data/gates.json`、`/data/verdict.json` 的数值规则。新的兼容模型指纹数据会在下一次 prepare 立即采用，冻结为本轮快照；score 不在生成样本后更换参考库。

联网失败时优先使用已保存的最近兼容快照，再退回随仓库提供的 seed，并明确输出 cached-fallback 与失败原因。可单独运行 `node .github/scripts/fingerprint.mjs refresh` 检查上游版本，不调用任何模型、不生成样本。

只自动更新数据，不自动执行外站的新代码。检查了网站 core、gates、verdict 脚本的已审阅哈希：若评分逻辑变化，记录 engine_update_required 并保留旧兼容快照，需维护 PR 更新后才使用新的算法。这避免把新数据与不兼容的旧算法混用。实时同步以成功联网及上游仍兼容为前提。

## 评分与来源

核心来自 MIT 许可的 [ModelTrace](https://github.com/xqy2006/ModelTrace)，原样保存及附带 LICENSE；来源提交、网站代码哈希在 `.github/vendor/modeltrace/provenance.json`。输入门槛和拟合判定按网站公开的数值规则独立实现，并用网站示例校验一致性。输入通道限定为一个 JSON 整数数组，避免把说明文字混进样本。

结果为 match、family_only、insufficient、invalid 或 unscored，均保留 `identity_verified=false`、`arena_protocol_calibrated=false`。展示候选与拟合值，不把候选库内 softmax 份额称作真实身份概率。单轮单样本不沿用网站三份独立样本的准确率。

协议 CI 在有报告时核对原始样本哈希，并用受保护的检查器重新计算归因关键字段。缺失历史指纹显示为警告；无效/无法评分不会被捏造成模型身份，也不会因推测模型质量而自动阻止其他工作。
