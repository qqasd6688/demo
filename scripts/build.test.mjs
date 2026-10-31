import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);

test('原样发布手动入口，页面增删与元数据不会改写入口', async () => {
  const fixture = await mkdtemp(path.join(root, '.build-check-'));
  try {
    for (const directory of ['scripts', 'site/assets', 'pages/sample/assets', 'pages/sample/tests', 'pages/sample/scripts'])
      await mkdir(path.join(fixture, directory), { recursive: true });
    await cp(path.join(root, 'scripts/build.mjs'), path.join(fixture, 'scripts/build.mjs'));
    let home = '<!doctype html><a href="./sample/"><img src="./sample/assets/cover.svg">手动名称</a>';
    await writeFile(path.join(fixture, 'site/index.html'), home);
    await writeFile(path.join(fixture, 'site/assets/main.js'), 'console.log("入口");');
    await writeFile(path.join(fixture, 'pages/sample/index.html'), '<!doctype html>页面');
    await writeFile(path.join(fixture, 'pages/sample/assets/cover.svg'), '<svg/>');
    await writeFile(path.join(fixture, 'pages/sample/.private'), 'not published');
    await writeFile(path.join(fixture, 'pages/sample/tests/sample.test.mjs'), 'import test from "node:test";');
    await writeFile(path.join(fixture, 'pages/sample/scripts/generate.mjs'), 'import fs from "node:fs/promises";');
    const build = () => run(process.execPath, [path.join(fixture, 'scripts/build.mjs')]);
    await build();
    assert.equal(await readFile(path.join(fixture, 'dist/index.html'), 'utf8'), home);
    assert.equal(await readFile(path.join(fixture, 'dist/sample/assets/cover.svg'), 'utf8'), '<svg/>');
    assert.equal(await readFile(path.join(fixture, 'dist/_site/main.js'), 'utf8'), 'console.log("入口");');
    await assert.rejects(readFile(path.join(fixture, 'dist/sample/.private')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(fixture, 'dist/sample/tests/sample.test.mjs')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(fixture, 'dist/sample/scripts/generate.mjs')), { code: 'ENOENT' });

    await writeFile(path.join(fixture, 'pages/sample/page.json'), '{"title":"不自动同步的名称","cover":"missing.png"}');
    await mkdir(path.join(fixture, 'pages/added'));
    await writeFile(path.join(fixture, 'pages/added/index.html'), '<!doctype html>新增页面');
    await build();
    assert.equal(await readFile(path.join(fixture, 'dist/index.html'), 'utf8'), home);
    assert.match(await readFile(path.join(fixture, 'dist/added/index.html'), 'utf8'), /新增页面/);
    await assert.rejects(readFile(path.join(fixture, 'dist/sample/page.json')), { code: 'ENOENT' });

    home = home.replace('手动名称', '同步维护的名称');
    await writeFile(path.join(fixture, 'site/index.html'), home);
    const removed = path.resolve(fixture, 'pages/added');
    assert.ok(removed.startsWith(`${fixture}${path.sep}`));
    await rm(removed, { recursive: true });
    await Promise.all([build(), build()]);
    assert.equal(await readFile(path.join(fixture, 'dist/index.html'), 'utf8'), home);
    await assert.rejects(readFile(path.join(fixture, 'dist/added/index.html')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(fixture, '.build.lock')), { code: 'ENOENT' });

    await mkdir(path.join(fixture, 'pages/missing-index'));
    await assert.rejects(build);
    assert.equal(await readFile(path.join(fixture, 'dist/index.html'), 'utf8'), home);
  } finally {
    assert.ok(path.resolve(fixture).startsWith(`${path.resolve(root)}${path.sep}`));
    await rm(fixture, { recursive: true, force: true });
  }
});
