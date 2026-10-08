import { describe, expect, it } from "vitest";
import { createProxyServer } from "../server.mjs";
import { clientIp } from "./analyze.js";

describe("local proxy failure isolation", () => {
  it("uses the local socket rather than caller-supplied proxy identities", async () => {
    const ips = [];
    const server = createProxyServer({ analyze: async (req, res) => { ips.push(clientIp(req)); res.end("ok"); } });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      for (const ip of ["203.0.113.1", "203.0.113.2"]) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analyze`, {
          headers: { "x-forwarded-for": ip, "x-real-ip": ip, "x-vercel-forwarded-for": ip },
        });
        await response.text();
      }
      expect(ips).toEqual(["127.0.0.1", "127.0.0.1"]);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
  it("returns a safe error on a rejected handler and still serves later requests", async () => {
    const fail = async () => { throw new Error("fixture credential must not leak"); };
    const server = createProxyServer({ analyze: fail, tutorHandler: fail });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      for (const route of ["/api/analyze", "/api/tutor"]) {
        const response = await fetch(`${base}${route}`, { method: "POST" });
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Proxy request failed" });
      }
      expect(await (await fetch(`${base}/health`)).text()).toBe("ok");
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
