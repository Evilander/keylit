// Preload runs before the renderer with context isolation on. Keylit is a pure
// web app and needs no Node bridge, so this is intentionally minimal — it just
// exposes the fact that we're running inside the desktop shell.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("keylit", {
  desktop: true,
  platform: process.platform,
});
