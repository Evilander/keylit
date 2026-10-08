// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "../test/render.js";
import HumHarmony from "./HumHarmony.jsx";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function mic() {
  const stop = vi.fn(), close = vi.fn();
  const stream = { getTracks: () => [{ stop }] };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.stubGlobal("AudioContext", class {
    close = close;
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 2048, getFloatTimeDomainData() {} }; }
  });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  return { stop, stream };
}
async function start() {
  render(<HumHarmony activeKey={{ root: 0, mode: "major" }} />);
  fireEvent.click(screen.getByRole("button", { name: /Hum-to-Harmony/ }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "hum a line" })));
}
it("stops the mic on collapse", async () => {
  const { stop } = mic();
  await start();
  fireEvent.click(screen.getByRole("button", { name: /Hum-to-Harmony/ }));
  expect(stop).toHaveBeenCalledOnce();
});
it("releases a permission grant that arrives after collapse", async () => {
  const { stop, stream } = mic();
  let release;
  navigator.mediaDevices.getUserMedia.mockReturnValue(new Promise(resolve => { release = resolve; }));
  await start();
  fireEvent.click(screen.getByRole("button", { name: /Hum-to-Harmony/ }));
  await act(async () => release(stream));
  expect(stop).toHaveBeenCalledOnce();
});
it("stops after 30 seconds even without animation frames", async () => {
  vi.useFakeTimers();
  const { stop } = mic();
  await start();
  await act(() => vi.advanceTimersByTimeAsync(30000));
  expect(stop).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "hum a line" })).toBeInTheDocument();
});
