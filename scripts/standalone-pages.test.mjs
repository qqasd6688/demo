import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { inspectStandalone } from './standalone-assets.mjs';

const pages = fileURLToPath(new URL('../pages/', import.meta.url));

test('每个作品完整复制并改名后，文档、封面、模块、样式及模型资源都在自身目录', async (t) => {
  const parent = path.resolve(tmpdir());
  const temporary = await mkdtemp(path.join(parent, 'demo-standalone-'));
  try {
    for (const entry of await readdir(pages, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      await t.test(entry.name, async () => {
        const copied = path.join(temporary, `relocated-${entry.name}`);
        await cp(path.join(pages, entry.name), copied, { recursive: true });
        const result = await inspectStandalone(copied);
        assert.deepEqual(result.errors, [], result.errors.join('\n'));
        assert.ok(result.files.has('assets/cover.webp'), '缺少独立封面');
        assert.ok(![...result.files].some(file => file.startsWith('docs/')), '作品内不保留 docs 目录');
        for (const heading of ['简介', '封面', '功能点', '技术栈', '独立运行', '操作说明', '资源目录', '素材与许可']) {
          assert.ok(result.readme.includes(`## ${heading}`), `readme.md 缺少${heading}`);
        }
        assert.doesNotMatch(result.readme, /^## .*?(?:迭代|验证记录|升级记录|工作范围)/m);
        if (result.files.has('sw.js')) {
          const source = await readFile(path.join(copied, 'sw.js'), 'utf8');
          const files = runInNewContext(`${source}\n;FILES;`, {
            URL, self: { registration: { scope: 'http://localhost/relocated/' }, addEventListener() {} },
          });
          const cached = new Set(files.map(file => file.replace(/^\.\//, '')));
          for (const dependency of result.dependencies) {
            if (dependency.startsWith('assets/') && !dependency.endsWith('LICENSE')) {
              assert.ok(cached.has(dependency), `离线清单缺少 ${dependency}`);
            }
          }
        }
      });
    }
  } finally {
    assert.ok(path.resolve(temporary).startsWith(`${parent}${path.sep}demo-standalone-`));
    await rm(temporary, { recursive: true, force: true });
  }
});
