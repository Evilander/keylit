// Electron main process for Keylit. Wraps the built Vite SPA in a desktop window.
// Production serves dist/ via a custom app:// protocol so the app's absolute
// asset/font paths (/assets, /fonts) resolve correctly and Web MIDI / Web Audio
// work exactly as in Chrome.

const { app, BrowserWindow, protocol, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const isDev = !app.isPackaged && !!process.env.KEYLIT_DEV_URL;
const DIST = path.join(__dirname, "..", "dist");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".map": "application/json",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".ogg": "audio/ogg", ".wasm": "application/wasm",
};

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 920,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: "#14110f",
    title: "Keylit",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Web MIDI / Web Audio need no special flags; they work in the renderer.
    },
  });

  // Open external links (AI proxy docs, credits) in the system browser, not in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    win.loadURL(process.env.KEYLIT_DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadURL("app://app/index.html");
  }
}

app.whenReady().then(() => {
  // Serve the built SPA from dist/ over app://. Reads via fs so it works inside
  // the packaged asar archive too.
  protocol.handle("app", async (request) => {
    let rel = decodeURIComponent(new URL(request.url).pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const filePath = path.normalize(path.join(DIST, rel));
    if (!filePath.startsWith(DIST)) return new Response("forbidden", { status: 403 });
    try {
      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return new Response(data, { headers: { "content-type": MIME[ext] || "application/octet-stream" } });
    } catch {
      // SPA fallback: unknown path -> index.html
      try {
        const html = await fs.promises.readFile(path.join(DIST, "index.html"));
        return new Response(html, { headers: { "content-type": "text/html" } });
      } catch {
        return new Response("not found", { status: 404 });
      }
    }
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
