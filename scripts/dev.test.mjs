import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));

test('首页和作品接入 Vite，CSS 即时更新，作品脚本修改自动刷新', async () => {
  const fixture = await mkdtemp(path.join(root, '.dev-check-'));
  let server;
  try {
    for (const folder of ['site/assets', 'pages/sample/assets']) {
      await mkdir(path.join(fixture, folder), { recursive: true });
    }
    await cp(path.join(root, 'vite.config.mjs'), path.join(fixture, 'vite.config.mjs'));
    await writeFile(path.join(fixture, 'site/index.html'), '<!doctype html><link rel="stylesheet" href="./_site/style.css">首页');
    await writeFile(path.join(fixture, 'site/assets/style.css'), 'body { color: blue; }');
    await writeFile(path.join(fixture, 'pages/sample/index.html'), '<!doctype html><link rel="stylesheet" href="./assets/style.css"><script type="module" src="./assets/main.js"></script>作品');
    await writeFile(path.join(fixture, 'pages/sample/assets/style.css'), 'body { color: blue; }');
    await writeFile(path.join(fixture, 'pages/sample/assets/main.js'), 'console.log("before");');
    server = await createServer({ configFile: path.join(fixture, 'vite.config.mjs'), logLevel: 'silent',
      server: { port: 0, strictPort: false } });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    for (const url of ['/', '/index.html?check=1', '/sample/']) {
      const response = await fetch(origin + url);
      assert.equal(response.status, 200, url);
      assert.match(await response.text(), /\/@vite\/client/);
    }
    for (const url of ['/_site/style.css', '/sample/assets/style.css', '/sample/assets/main.js']) {
      assert.equal((await fetch(origin + url)).status, 200, url);
    }
    await assert.rejects(readFile(path.join(fixture, 'dist/index.html')), { code: 'ENOENT' });
    const messages = [];
    const send = server.ws.send.bind(server.ws);
    server.ws.send = (message, ...args) => { messages.push(message); return send(message, ...args); };
    await delay(100);
    for (const [file, source, type] of [
      ['site/assets/style.css', 'body { color: green; }', 'update'],
      ['pages/sample/assets/style.css', 'body { color: green; }', 'update'],
      ['pages/sample/assets/main.js', 'console.log("after");', 'full-reload'],
    ]) {
      messages.length = 0;
      await writeFile(path.join(fixture, file), source);
      const deadline = Date.now() + 5000;
      while (!messages.some(message => message.type === type) && Date.now() < deadline) await delay(25);
      assert.ok(messages.some(message => message.type === type), `${file} 没有触发 ${type}`);
    }
  } finally {
    await server?.close();
    assert.ok(path.resolve(fixture).startsWith(`${path.resolve(root)}${path.sep}`));
    await rm(fixture, { recursive: true, force: true });
  }
});
