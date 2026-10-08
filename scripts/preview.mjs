// Serve the compiled production worker and assets locally; no Vite dev modules.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import worker from "../.output/server/index.mjs";
const args = process.argv.slice(2);
const value = (key, fallback) =>
  args[args.indexOf(key) + 1] && args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const host = value("--host", "127.0.0.1"),
  port = Number(value("--port", "4173"));
const root = path.resolve(".output/public");
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".html": "text/html",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
      if (file.startsWith(root + path.sep)) {
        try {
          const body = await readFile(file);
          res.writeHead(200, {
            "Content-Type": types[path.extname(file)] || "application/octet-stream",
            "Cache-Control": "no-cache",
          });
          res.end(body);
          return;
        } catch {
          /* SSR for documents */
        }
      }
      const response = await worker.fetch(
        new Request(url, { headers: req.headers }),
        {},
        { waitUntil() {}, passThroughOnException() {} },
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(error);
      res.writeHead(500);
      res.end("Erro ao abrir o build de produção.");
    }
  })
  .listen(port, host, () => console.log(`Local: http://${host}:${port}/`));
