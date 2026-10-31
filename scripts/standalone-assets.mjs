import { readFile, readdir, lstat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 使用 Vite 已附带的解析器读取真正的模块引用，避免把库注释里的示例当成依赖。
const requireFromVite = createRequire(import.meta.resolve('vite'));
const { parseSync } = await import(pathToFileURL(requireFromVite.resolve('rolldown/utils')).href);
const ignoredURL = /^(?:data:|blob:|#)/i;
const stringValue = (node) => node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
const slash = (value) => value.split(path.sep).join('/');

export async function inspectStandalone(directory) {
  directory = path.resolve(directory);
  const files = new Set();
  const errors = [];
  const dependencies = new Set();
  const base = pathToFileURL(`${directory}${path.sep}`);
  async function list(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (folder === directory && (entry.name === 'tests' || entry.name === 'scripts')) continue;
      const file = path.join(folder, entry.name);
      if ((await lstat(file)).isSymbolicLink()) errors.push(`符号链接不能保证独立复制：${file}`);
      else if (entry.isDirectory()) await list(file);
      else files.add(slash(path.relative(directory, file)));
    }
  }
  await list(directory);
  function local(reference, from) {
    if (!reference || ignoredURL.test(reference)) return;
    if (/^(?:https?:|\/)/i.test(reference)) {
      errors.push(`${from} 的运行资源不是作品内相对路径：${reference}`);
      return;
    }
    const url = new URL(reference, new URL(from, base));
    if (url.protocol !== 'file:') { errors.push(`${from} 不支持的资源协议：${reference}`); return; }
    const relative = slash(path.relative(directory, fileURLToPath(url)));
    if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
      errors.push(`${from} 引用了作品外资源：${reference}`);
    } else if (!files.has(relative)) {
      errors.push(`${from} 缺少资源或文件名大小写不匹配：${reference}`);
    } else dependencies.add(relative);
  }
  const html = await readFile(path.join(directory, 'index.html'), 'utf8');
  const map = html.match(/<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
  const imports = map ? JSON.parse(map[1]).imports || {} : {};
  function moduleReference(reference, from) {
    if (!reference || ignoredURL.test(reference)) return;
    if (reference.startsWith('.')) return local(reference, from);
    const key = Object.keys(imports).sort((a, b) => b.length - a.length)
      .find((key) => reference === key || (key.endsWith('/') && reference.startsWith(key)));
    if (!key) errors.push(`${from} 缺少 import map 映射：${reference}`);
    else local(imports[key] + reference.slice(key.length), 'index.html');
  }
  for (const tag of html.matchAll(/<(?:script|link|img|source|audio|video)\b[^>]*>/gi)) {
    for (const attribute of tag[0].matchAll(/\b(?:src|href|poster)=["']([^"']+)["']/gi)) local(attribute[1], 'index.html');
  }
  for (const file of files) {
    if (file.endsWith('.js')) {
      const result = parseSync(file, await readFile(path.join(directory, file), 'utf8'), { sourceType: 'module' });
      for (const error of result.errors) errors.push(`${file}：${error.message}`);
      function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type)) {
          moduleReference(stringValue(node.source), file);
        }
        if (node.type === 'NewExpression' && node.callee.name === 'URL'
          && node.arguments[1]?.object?.type === 'MetaProperty'
          && node.arguments[1]?.property?.name === 'url') {
          const reference = stringValue(node.arguments[0]);
          if (reference) local(reference, file);
          else if (node.arguments[0]?.type === 'TemplateLiteral') {
            const template = node.arguments[0];
            const escaped = template.quasis.map((part) => part.value.cooked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const pattern = new RegExp(`^${escaped.join('[^/]+')}$`);
            const candidates = [...files].map((candidate) => './' + slash(path.relative(path.dirname(file), candidate)));
            if (!candidates.some((candidate) => pattern.test(candidate))) errors.push(`${file} 的动态资源模式没有本地文件：${template.quasis.map(p => p.value.cooked).join('*')}`);
          }
        }
        if (node.type === 'CallExpression' && node.callee.name === 'fetch') local(stringValue(node.arguments[0]), file);
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(walk);
          else if (value && typeof value === 'object') walk(value);
        }
      }
      walk(result.program);
    } else if (file.endsWith('.css')) {
      const css = await readFile(path.join(directory, file), 'utf8');
      for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/g)) local(match[1] || match[2] || match[3], file);
      for (const match of css.matchAll(/@import\s+["']([^"']+)["']/g)) local(match[1], file);
    } else if (file.endsWith('.gltf')) {
      const gltf = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
      for (const resource of [...(gltf.buffers || []), ...(gltf.images || [])]) local(resource.uri, file);
    }
  }
  const readme = await readFile(path.join(directory, 'readme.md'), 'utf8');
  for (const link of readme.matchAll(/\]\(([^)]+)\)/g)) if (!/^https?:/i.test(link[1])) local(link[1], 'readme.md');
  return { files, dependencies, errors, readme };
}
