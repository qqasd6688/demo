import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, normalizePath } from 'vite'

const pages = fileURLToPath(new URL('./pages/', import.meta.url))
const site = new URL('./site/', import.meta.url)

export default defineConfig({
  root: pages,
  publicDir: false,
  appType: 'mpa',
  resolve: { alias: { '/_site': normalizePath(fileURLToPath(new URL('assets', site))) } },
  plugins: [
    {
      name: 'home-entry',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const pathname = request.url?.split('?')[0]
          if (pathname !== '/' && pathname !== '/index.html') return next()
          try {
            const source = await readFile(new URL('index.html', site), 'utf8')
            const html = await server.transformIndexHtml(request.url, source)
            response.setHeader('Content-Type', 'text/html; charset=utf-8')
            response.end(request.method === 'HEAD' ? undefined : html)
          } catch (error) {
            next(error)
          }
        })
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5170, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: '../dist' },
})
