import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

// Vite's public-file index can miss a large harvest's file events on Windows.
// Read corpus JSON directly in dev so a completed hunt is immediately playable.
export function createCorpusMiddleware({ publicDir, base = "/" }) {
  const prefix = `${base}corpus/`;
  const root = path.resolve(publicDir, "corpus");
  return async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    if (!pathname.startsWith(prefix)) return next();
    const send = (status, body = "null") => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(req.method === "HEAD" ? undefined : body);
    };
    if (!["GET", "HEAD"].includes(req.method)) return send(405);
    let parts;
    try { parts = pathname.slice(prefix.length).split("/").map(decodeURIComponent); }
    catch { return send(400); }
    const manifest = parts.length === 1 && parts[0] === "manifest.json";
    const chart = parts.length === 2 && /^[a-z][a-z0-9_-]*$/.test(parts[0]) && parts[1].length > 5 && parts[1].endsWith(".json");
    if ((!manifest && !chart) || parts.some((part) => /[/\\\0]/.test(part) || part === "." || part === "..")) return send(404);
    try {
      const [realRoot, file] = await Promise.all([realpath(root), realpath(path.resolve(root, ...parts))]);
      if (!inside(realRoot, file)) return send(404);
      const body = await readFile(file);
      send(200, body);
    } catch (error) {
      send(["ENOENT", "ENOTDIR", "EISDIR"].includes(error.code) ? 404 : 500);
    }
  };
}

export default function liveCorpus() {
  return {
    name: "keylit-live-corpus",
    apply: "serve",
    configureServer(server) {
      if (!server.config.publicDir) return;
      return () => {
        // Keep Vite's host/CORS guards ahead of us, but bypass its public-file cache.
        const stack = server.middlewares.stack;
        const index = stack.findIndex((layer) => layer.handle.name === "viteServePublicMiddleware");
        if (index < 0) throw new Error("Could not attach live corpus after Vite's request guards.");
        stack.splice(index, 0, { route: "", handle: createCorpusMiddleware({ ...server.config, base: "/" }) });
      };
    },
  };
}
