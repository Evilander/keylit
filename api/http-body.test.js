import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readJsonBody, readTextBody } from "../server/http-body.mjs";

describe("HTTP body boundaries", () => {
  it("preserves musical symbols across every UTF-8 chunk boundary", async () => {
    const body = { sheet: "B♭ F♯ — 春" };
    const bytes = Buffer.from(JSON.stringify(body));
    for (let split = 1; split < bytes.length; split++) {
      expect(await readJsonBody(Readable.from([bytes.subarray(0, split), bytes.subarray(split)]), 128)).toEqual(body);
    }
  });
  it("enforces byte limits for streamed and preparsed inputs", async () => {
    await expect(readTextBody(Readable.from([Buffer.from("♭♭")]), 5)).rejects.toMatchObject({ tooLarge: true });
    for (const body of [{ sheet: "x".repeat(50) }, JSON.stringify({ sheet: "x".repeat(50) })]) {
      await expect(readJsonBody({ body }, 20)).rejects.toMatchObject({ tooLarge: true });
    }
  });
  it("rejects aborted requests instead of leaving them pending", async () => {
    const req = new Readable({ read() {} });
    const result = readJsonBody(req, 100);
    req.emit("aborted");
    await expect(result).rejects.toThrow("aborted");
    req.destroy();
  });
});

 it("rejects premature close and already-aborted requests", async () => {
   const req = new Readable({ read() {} });
   const pending = readTextBody(req, 100);
   req.emit("close");
   await expect(pending).rejects.toThrow("aborted");
   expect(req.listenerCount("data")).toBe(0);
   req.destroy();
   await expect(readTextBody(req, 100)).rejects.toThrow("aborted");
 });
 it("uses raw Buffer byte lengths before decoding preparsed data", async () => {
   const raw = Buffer.from([34, 255, 34]);
   expect(await readJsonBody({ body: raw }, 3)).toBe("�");
   await expect(readJsonBody({ body: raw }, 2)).rejects.toMatchObject({ tooLarge: true });
 });

it.each(["oversized", "error", "aborted"])("retains error protection after %s rejection until terminal close", async reason => {
  const req = new EventEmitter();
  let drained = false;
  req.resume = () => { drained = true; };
  const result = readTextBody(req, 2);
  if (reason === "oversized") req.emit("data", Buffer.from("abc"));
  else if (reason === "error") req.emit("error", new Error("first error"));
  else req.emit("aborted");
  await expect(result).rejects.toThrow();
  expect(req.listenerCount("data")).toBe(0);
  expect(req.listenerCount("error")).toBe(1);
  if (reason === "oversized") expect(drained).toBe(true);
  expect(() => req.emit("error", new Error("late socket error"))).not.toThrow();
  req.emit("aborted");
  req.emit("close");
  for (const event of ["data", "end", "error", "aborted", "close"]) expect(req.listenerCount(event)).toBe(0);
});
it("cleans rejected drain listeners on end as well as close", async () => {
  const req = new EventEmitter();
  req.resume = () => {};
  const result = readTextBody(req, 1);
  req.emit("data", Buffer.from("xx"));
  await expect(result).rejects.toMatchObject({ tooLarge: true });
  req.emit("end");
  for (const event of ["data", "end", "error", "aborted", "close"]) expect(req.listenerCount(event)).toBe(0);
});
