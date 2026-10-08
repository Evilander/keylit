import { afterEach, expect, it, vi } from "vitest";
import { memos } from "./memos.js";
afterEach(() => vi.unstubAllGlobals());

function database({ abort = false, result = [] } = {}) {
  const close = vi.fn();
  const transactions = [];
  const db = { close, transaction: (stores) => {
    transactions.push(stores);
    const tx = { objectStore: () => ({ getAll: () => ({ result }), get: () => ({ result }), add: vi.fn(), delete: vi.fn() }) };
    queueMicrotask(() => abort ? tx.onabort() : tx.oncomplete());
    return tx;
  } };
  vi.stubGlobal("indexedDB", { open: () => {
    const req = { result: db }; queueMicrotask(() => req.onsuccess()); return req;
  } });
  return { close, transactions };
}
it("settles abort-only writes and closes the connection", async () => {
  const { close } = database({ abort: true });
  expect(await memos.save({ blob: new Blob(["take"]), at: 1 })).toBeNull();
  expect(close).toHaveBeenCalledOnce();
});
it("lists only the metadata store and closes the connection", async () => {
  const { close, transactions } = database({ result: [{ id: "one", size: 3, at: 1 }] });
  expect(await memos.list()).toEqual([{ id: "one", size: 3, at: 1 }]);
  expect(transactions).toEqual([["metadata"]]);
  expect(close).toHaveBeenCalledOnce();
});
it("settles abort-only reads and closes the connection", async () => {
  const { close } = database({ abort: true });
  expect(await memos.blobOf("one")).toBeNull();
  expect(close).toHaveBeenCalledOnce();
});
it("migrates v1 recordings to metadata one cursor record at a time", async () => {
  const put = vi.fn();
  const close = vi.fn();
  const next = vi.fn();
  const cursor = { result: { value: { id: "old", name: "old take", at: 4, blob: new Blob(["audio"]) }, continue: next } };
  const db = {
    close,
    objectStoreNames: { contains: (name) => name === "memos" },
    createObjectStore: vi.fn(() => ({ put })),
    transaction: () => {
      const tx = { objectStore: () => ({ getAll: () => ({ result: [] }) }) };
      queueMicrotask(() => tx.oncomplete()); return tx;
    },
  };
  vi.stubGlobal("indexedDB", { open: (_name, version) => {
    expect(version).toBe(2);
    const req = { result: db, transaction: { objectStore: () => ({ openCursor: () => cursor }) } };
    queueMicrotask(() => {
      req.onupgradeneeded(); cursor.onsuccess(); cursor.result = null; cursor.onsuccess(); req.onsuccess();
    });
    return req;
  } });
  await memos.list();
  expect(put).toHaveBeenCalledWith({ id: "old", name: "old take", at: 4, size: 5 });
  expect(next).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
it("settles blocked upgrades and closes a connection that opens after rejection", async () => {
  const close = vi.fn();
  let req;
  vi.stubGlobal("indexedDB", { open: () => {
    req = { result: { close } };
    queueMicrotask(() => req.onblocked());
    return req;
  } });
  expect(await memos.save({ blob: new Blob(["preserve me"]) })).toBeNull();
  req.onsuccess();
  expect(close).toHaveBeenCalledOnce();
});
