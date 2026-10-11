import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build, type Rollup } from 'vite';
import { describe, expect, it } from 'vitest';

const app = fileURLToPath(new URL('..', import.meta.url));

/** Production-build a tiny entry with the app's own vite.config.ts and run the chunk. */
async function buildAndRun(entrySource: string, override: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'k1-'));
  try {
    const entry = join(dir, 'entry.ts');
    writeFileSync(entry, entrySource);
    const result = await build({
      configFile: join(app, 'vite.config.ts'), root: app, logLevel: 'silent',
      build: { write: false, minify: true, rolldownOptions: { input: entry, ...override } },
    }) as Rollup.RollupOutput | Rollup.RollupOutput[];
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
    const chunk = outputs.find((item): item is Rollup.OutputChunk => item.type === 'chunk' && item.isEntry)!;
    const context = vm.createContext({ result: undefined as unknown });
    new vm.Script(chunk.code.replace(/^import[^;]*;/gm, '')).runInContext(context);
    return context.result as string[];
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const entry = (registryPath: string, armorPath: string, itemCorePath: string) => `
import { SourceClassRegistry } from ${JSON.stringify(registryPath)};
import { 秘银锁甲 } from ${JSON.stringify(armorPath)};
import { ItemCore } from ${JSON.stringify(itemCorePath)};
class 本地类 {}
function 恢复物品() { return 1; }
const registry = new SourceClassRegistry();
registry.define('物品', ItemCore, () => { throw new Error(); });
registry.define('秘银锁甲', 秘银锁甲, () => Object.create(秘银锁甲.prototype));
const armor = new (registry.lookup('秘银锁甲'))({});
globalThis.result = [秘银锁甲.name, 本地类.name, 恢复物品.name, ItemCore.name,
  registry.nameOf(armor), registry.nameOf(Object.create(ItemCore.prototype)), String(registry.isA(armor, '物品'))];
`;

describe('K1: production builds keep source names', () => {
  const paths = [join(app, 'src/game/runtime/class-registry.ts'), join(app, 'src/game/armor-items.ts'), join(app, 'src/game/item-core.ts')] as const;
  it('the app build configuration preserves class and function names in a minified bundle', async () => {
    expect(await buildAndRun(entry(...paths))).toEqual(['秘银锁甲', '本地类', '恢复物品', 'ItemCore', '秘银锁甲', '物品', 'true']);
  }, 60000);
  it('mutation check: without keepNames the same bundle loses names, while registry names survive', async () => {
    const names = await buildAndRun(entry(...paths), { output: { keepNames: false } });
    expect(names.slice(0, 4)).not.toEqual(['秘银锁甲', '本地类', '恢复物品', 'ItemCore']);
    expect(names.slice(4)).toEqual(['秘银锁甲', '物品', 'true']);
  }, 60000);
});
