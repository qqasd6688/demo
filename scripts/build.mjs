import { cp, lstat, mkdir, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'pages');
const output = path.join(root, 'dist');

// 多个发布构建可能同时执行；只允许一个进程重建 dist。
const lockFile = path.join(root, '.build.lock');
async function acquireBuildLock() {
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      const handle = await open(lockFile, 'wx');
      await handle.writeFile(String(process.pid));
      await handle.close();
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const owner = Number(await readFile(lockFile, 'utf8'));
        if (Number.isSafeInteger(owner) && owner > 0) {
          try {
            process.kill(owner, 0);
          } catch (error) {
            if (error.code === 'ESRCH') await rm(lockFile, { force: true });
          }
        } else if (Date.now() - (await stat(lockFile)).mtimeMs > 60000) {
          await rm(lockFile, { force: true });
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      await delay(100);
    }
  }
  throw new Error('另一个页面构建仍在运行，请稍后重试。');
}

await acquireBuildLock();
try {
  // 只校验并复制发布文件；入口内容由 site/index.html 手动维护。
  const entries = await readdir(source, { withFileTypes: true });
  const pages = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) {
      throw new Error(`pages/ 下只放小写英文、数字及短横线命名的页面目录：${entry.name}`);
    }
    const directory = path.join(source, entry.name);
    if (!(await stat(path.join(directory, 'index.html'))).isFile()) {
      throw new Error(`${entry.name}/ 缺少 index.html`);
    }
    pages.push({ slug: entry.name, directory });
  }
  const html = await readFile(path.join(root, 'site/index.html'), 'utf8');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(root, 'site/assets'), path.join(output, '_site'), { recursive: true });
  for (const page of pages) {
    await cp(page.directory, path.join(output, page.slug), {
      recursive: true,
      filter: async (file) => {
        const name = path.basename(file);
        const relative = path.relative(page.directory, file);
        if (relative === 'tests' || relative === 'scripts') return false;
        if (name.startsWith('.') || name === 'node_modules' || name === 'page.json') return false;
        if ((await lstat(file)).isSymbolicLink()) {
          throw new Error(`页面资源不能是符号链接：${file}`);
        }
        return true;
      },
    });
  }
  await writeFile(path.join(output, 'index.html'), html);
  await writeFile(path.join(output, '.nojekyll'), '');
  console.log(`已构建 ${pages.length} 个页面 → dist/`);
} finally {
  await rm(lockFile, { force: true });
}
