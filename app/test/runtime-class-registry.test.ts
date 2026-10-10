import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { SOURCE_GLOBAL_CLASS_NAMES, SourceClassRegistry } from '../src/game/runtime/class-registry';
import { ItemCore } from '../src/game/item-core';
import { declaration } from './oracle/source';

/** Run the exact `注册全局类` with one distinct stub class per provided name. */
function runSourceRegistration(names: readonly string[]) {
  const window: Record<string, unknown> = {};
  const stubs: Record<string, unknown> = {};
  for (const name of names) stubs[name] = new vm.Script(`(class ${name} {})`).runInNewContext();
  const context = vm.createContext({ window, ...stubs });
  new vm.Script(`${declaration('注册全局类')}\n注册全局类();`).runInContext(context);
  return { window, stubs };
}

describe('source 注册全局类 name set', () => {
  it('SOURCE_GLOBAL_CLASS_NAMES is exactly the window key order the source produces', () => {
    const { window, stubs } = runSourceRegistration(SOURCE_GLOBAL_CLASS_NAMES);
    expect(Object.keys(window)).toEqual([...SOURCE_GLOBAL_CLASS_NAMES]);
    for (const name of SOURCE_GLOBAL_CLASS_NAMES) expect(window[name], name).toBe(stubs[name]);
    expect(new Set(SOURCE_GLOBAL_CLASS_NAMES).size).toBe(SOURCE_GLOBAL_CLASS_NAMES.length);
    expect(SOURCE_GLOBAL_CLASS_NAMES.length).toBe(241);
  });
  it('mutation check: dropping a name makes the source throw; an extra name changes the key list', () => {
    expect(() => runSourceRegistration(SOURCE_GLOBAL_CLASS_NAMES.filter(name => name !== '水怪'))).toThrow(/水怪 is not defined/);
    const { window } = runSourceRegistration([...SOURCE_GLOBAL_CLASS_NAMES, '栅栏']);
    expect(Object.keys(window)).not.toContain('栅栏');
  });
  it('base classes that the source never registers stay out of the list', () => {
    for (const name of ['栅栏', '追踪风弹弹头', '界面元素基类', '文本元素', '进度条元素', '推箱子关卡生成器']) {
      expect(SOURCE_GLOBAL_CLASS_NAMES as readonly string[]).not.toContain(name);
    }
  });
});

interface Ports { tag: string }
class 物品Impl { ports: Ports; config: unknown; constructor(ports: Ports, config: unknown = {}) { this.ports = ports; this.config = config; } }
class 钥匙Impl extends 物品Impl {}
const minified = (() => { const e = class extends 物品Impl {}; return e; })(); // what a name-dropping minifier emits

describe('SourceClassRegistry', () => {
  const setup = () => {
    const registry = new SourceClassRegistry();
    const ports = { tag: 'session-a' };
    const 物品 = registry.defineWithPorts('物品', 物品Impl, ports);
    const 钥匙 = registry.defineWithPorts('钥匙', 钥匙Impl, ports);
    return { registry, ports, 物品, 钥匙 };
  };
  it('lookup keeps the source one-argument construction and binds the session ports', () => {
    const { registry, ports } = setup();
    const Key = registry.lookup('钥匙')!;
    const key = new Key({ 对应门ID: 3 }) as 钥匙Impl;
    expect(key).toBeInstanceOf(钥匙Impl);
    expect(key.ports).toBe(ports);
    expect(key.config).toEqual({ 对应门ID: 3 });
    expect(key.constructor).toBe(钥匙Impl);
    expect(Key.name).toBe('钥匙');
    expect(Key.prototype).toBe(钥匙Impl.prototype);
  });
  it('instanceof through looked-up globals follows source subclassing', () => {
    const { registry } = setup();
    const key = new (registry.lookup('钥匙')!)({});
    expect(key instanceof registry.lookup('物品')!).toBe(true);
    expect(registry.isA(key, '物品')).toBe(true);
    expect(registry.isA(new 物品Impl({ tag: 'x' }), '钥匙')).toBe(false);
    expect(registry.isA(key, '武器类')).toBe(false); // not defined yet in this session
    for (const value of [null, undefined, 0, '钥匙', Symbol.for('钥匙')]) expect(registry.isA(value, '物品')).toBe(false);
  });
  it('like a source class, a looked-up global cannot be called without new', () => {
    const { registry } = setup();
    expect(() => (registry.lookup('钥匙') as unknown as () => unknown)()).toThrow(TypeError);
  });
  it('lookup answers only the names 注册全局类 exposes', () => {
    const registry = new SourceClassRegistry();
    registry.define('栅栏', 物品Impl, () => new 物品Impl({ tag: '' }));
    expect(registry.lookup('栅栏')).toBeUndefined();
    expect(registry.isA(new 物品Impl({ tag: '' }), '栅栏')).toBe(true);
    for (const name of ['Object', 'Map', 'toString', '__proto__', 'constructor', '', undefined, null, 3]) {
      expect(registry.lookup(name)).toBeUndefined();
    }
    expect(registry.lookup('钥匙')).toBeUndefined(); // source name, not defined in this session
  });
  it('nameOf reports source names independent of Function.prototype.name', () => {
    const registry = new SourceClassRegistry();
    registry.define('物品', ItemCore, () => { throw new Error('unused'); });
    registry.defineWithPorts('钥匙', minified, { tag: '' });
    const fake = Object.create(ItemCore.prototype) as ItemCore;
    expect(ItemCore.name).toBe('ItemCore');
    expect(registry.nameOf(fake)).toBe('物品');
    expect(minified.name).toBe('e');
    expect(registry.nameOf(new (registry.lookup('钥匙')!)({}) as object)).toBe('钥匙');
    class 未登记 {}
    expect(registry.nameOf(new 未登记())).toBe('未登记');
    expect(registry.nameOf({})).toBe('Object');
    expect(() => registry.nameOf(Object.create(null))).toThrow(TypeError);
    expect(() => registry.nameOf(null)).toThrow(TypeError);
    expect(registry.nameOf({ constructor: { name: 'x' } })).toBe('x');
    expect(registry.nameOf({ constructor: 1 })).toBeUndefined();
  });
  it('rejects duplicate names and shared implementations', () => {
    const { registry } = setup();
    expect(() => registry.defineWithPorts('钥匙', 钥匙Impl, { tag: '' })).toThrow(/already defined/);
    expect(() => registry.defineWithPorts('万能钥匙', 钥匙Impl, { tag: '' })).toThrow(/reuses/);
  });
  it('sessions are isolated: the same class binds different ports per registry', () => {
    const a = new SourceClassRegistry(); const b = new SourceClassRegistry();
    a.defineWithPorts('钥匙', 钥匙Impl, { tag: 'a' }); b.defineWithPorts('钥匙', 钥匙Impl, { tag: 'b' });
    expect((new (a.lookup('钥匙')!)({}) as 钥匙Impl).ports.tag).toBe('a');
    expect((new (b.lookup('钥匙')!)({}) as 钥匙Impl).ports.tag).toBe('b');
  });
  it('globals() mirrors the source window keys for defined classes; missingGlobals() lists the rest', () => {
    const registry = new SourceClassRegistry();
    registry.defineWithPorts('钥匙', 钥匙Impl, { tag: '' });
    registry.defineWithPorts('门', class 门Impl extends 物品Impl {}, { tag: '' });
    registry.defineWithPorts('物品', 物品Impl, { tag: '' });
    expect(Object.keys(registry.globals())).toEqual(['门', '物品', '钥匙']);
    expect(registry.definedNames()).toEqual(['钥匙', '门', '物品']);
    expect(registry.missingGlobals()).toHaveLength(SOURCE_GLOBAL_CLASS_NAMES.length - 3);
    expect(registry.missingGlobals()[0]).toBe('怪物');
  });
});
