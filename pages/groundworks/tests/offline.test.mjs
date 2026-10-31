import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

test('离线缓存按部署路径隔离，只清理当前作品的旧缓存', async () => {
  const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  function configuration(scope) {
    return runInNewContext(`${source}\n;({ PREFIX, VERSION });`, {
      URL, self: { registration: { scope }, addEventListener() {} },
    });
  }
  const first = configuration('http://localhost/copied-one/');
  const second = configuration('http://localhost/copied-two/');
  assert.notEqual(first.PREFIX, second.PREFIX);
  assert.notEqual(first.VERSION, second.VERSION);
  const removed = [];
  const handlers = {};
  runInNewContext(source, {
    URL,
    self: { registration: { scope: 'http://localhost/copied-one/' }, addEventListener(name, handler) { handlers[name] = handler; }, clients: { claim() {} } },
    caches: { keys: async () => [first.PREFIX + 'v2', first.VERSION, second.VERSION, 'unrelated-cache'], delete: async key => { removed.push(key); } },
  });
  let completed;
  handlers.activate({ waitUntil(promise) { completed = promise; } });
  await completed;
  assert.deepEqual(removed, [first.PREFIX + 'v2']);
});
