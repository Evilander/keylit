// Node HTTP readers: byte limits and UTF-8 decoding belong at the boundary.
export function readTextBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
      req.removeListener("aborted", onAborted);
      req.removeListener("close", onClose);
    };
    const onError = (error) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      req.removeListener("data", onData);
      // A rejected request may still emit error/aborted while draining. Keep
      // terminal listeners until end/close, without retaining its body.
      reject(error);
    };
    const onAborted = () => onError(new Error("request aborted"));
    const onClose = () => { onAborted(); cleanup(); };
    const onData = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBytes) {
        onError(Object.assign(new Error("body too large"), { tooLarge: true }));
        // Drain without destroying the socket before the caller sends a 413.
        req.resume?.();
        return;
      }
      chunks.push(bytes);
    };
    const onEnd = () => {
      cleanup();
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, size).toString("utf8"));
    };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
    req.on("close", onClose);
    if (req.aborted || req.destroyed) onAborted();
  });
}

export async function readJsonBody(req, maxBytes) {
  if (req.body !== undefined) {
    const raw = Buffer.isBuffer(req.body) || typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > maxBytes) throw Object.assign(new Error("body too large"), { tooLarge: true });
    return JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : raw);
  }
  const text = await readTextBody(req, maxBytes);
  return text ? JSON.parse(text) : {};
}
