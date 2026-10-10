type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Ports for the editor wrench (`应用单个扳手规则` and `绘制` belong to the audit-only packet t10-editor-tools-audit). */
export interface WrenchPorts {
  notify(message: string, type: string): void; // 显示通知
  applyRule(target: unknown, rule: unknown): void; // 应用单个扳手规则
  draw(): void; // 绘制
}

/** Source `应用扳手规则(目标实体, 规则列表)` (HTML L58147): applies each rule of the quick slot in order, then reports and redraws. */
export function applyWrenchRules(ports: WrenchPorts, target: Loose, rules: Loose): void {
  if (!rules || rules.length === 0) {
    ports.notify('当前快捷槽没有定义任何规则。', '警告');
    return;
  }
  rules.forEach((rule: unknown) => { ports.applyRule(target, rule); });
  ports.notify(`已对 ${target.名称 || target.类型} 应用 ${rules.length} 条规则。`, '成功');
  ports.draw();
}
