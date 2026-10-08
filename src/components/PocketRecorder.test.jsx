// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "../test/render.js";
import PocketRecorder from "./PocketRecorder.jsx";
import { memos } from "../audio/memos.js";

vi.mock("../audio/memos.js", () => ({ memos: {
  supported: () => true, list: async () => [], save: vi.fn(async () => "memo"),
} }));

beforeEach(() => { memos.save.mockReset().mockResolvedValue("memo"); });
afterEach(() => {
  const view = render(<PocketRecorder />);
  for (const button of screen.queryAllByRole("button", { name: /discard unsaved take/ })) fireEvent.click(button);
  view.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

const setupRecorder = () => {
  let count = 0;
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("MediaRecorder", class {
    constructor() { this.state = "inactive"; this.mimeType = "audio/webm"; this.take = ++count; }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable({ data: new Blob([`take-${this.take}`], { type: this.mimeType }) });
      this.onstop();
    }
  });
  const createObjectURL = vi.fn(() => "blob:rescue");
  const BaseURL = URL;
  vi.stubGlobal("URL", class extends BaseURL { static createObjectURL = createObjectURL; static revokeObjectURL = vi.fn(); });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return { getUserMedia, createObjectURL };
};
const take = async () => {
  fireEvent.click(screen.getByRole("button", { name: /hum it before/ }));
  await screen.findByRole("button", { name: /keep it/ });
  fireEvent.click(screen.getByRole("button", { name: /keep it/ }));
};

describe("pocket recorder lifecycle", () => {
  it("releases a microphone granted after the room unmounts", async () => {
    let grant;
    const stop = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => new Promise((resolve) => { grant = resolve; }) } });
    const recorder = vi.fn();
    vi.stubGlobal("MediaRecorder", recorder);
    const view = render(<PocketRecorder />);
    fireEvent.click(screen.getByRole("button", { name: /hum it before/ }));
    view.unmount();
    await act(async () => grant({ getTracks: () => [{ stop }] }));
    expect(stop).toHaveBeenCalledOnce();
    expect(recorder).not.toHaveBeenCalled();
  });

  it("releases the stream and allows a retry when the recorder cannot initialize", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("MediaRecorder", class { constructor() { throw new Error("Unsupported recorder"); } });
    render(<PocketRecorder />);
    fireEvent.click(screen.getByRole("button", { name: /hum it before/ }));
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: /hum it before/ }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  });

  it("keeps a failed take downloadable even after a download is requested", async () => {
    const { createObjectURL } = setupRecorder();
    memos.save.mockResolvedValue(null);
    render(<PocketRecorder />);
    await take();
    const rescue = await screen.findByRole("button", { name: /download unsaved take/ });
    fireEvent.click(rescue);
    expect(createObjectURL).toHaveBeenCalledWith(memos.save.mock.calls[0][0].blob);
    expect(screen.getByRole("button", { name: /download unsaved take/ })).toBeInTheDocument();
  });

  it("keeps the first failed take accessible during and after another failed take", async () => {
    const { createObjectURL } = setupRecorder();
    memos.save.mockResolvedValue(null);
    render(<PocketRecorder />);
    await take();
    await screen.findByRole("button", { name: /download unsaved take/ });
    fireEvent.click(screen.getByRole("button", { name: /hum it before/ }));
    await screen.findByRole("button", { name: /keep it/ });
    expect(screen.getByRole("button", { name: /download unsaved take/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /keep it/ }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /download unsaved take/ })).toHaveLength(2));
    const rescues = screen.getAllByRole("button", { name: /download unsaved take/ });
    rescues.forEach((button) => fireEvent.click(button));
    expect(createObjectURL.mock.calls.map(([blob]) => blob)).toEqual(memos.save.mock.calls.map(([row]) => row.blob));
  });

  it("recovers a recording whose save rejects after the room unmounts", async () => {
    const { createObjectURL } = setupRecorder();
    let rejectSave;
    memos.save.mockImplementation(() => new Promise((_, reject) => { rejectSave = reject; }));
    const view = render(<PocketRecorder />);
    fireEvent.click(screen.getByRole("button", { name: /hum it before/ }));
    await screen.findByRole("button", { name: /keep it/ });
    view.unmount();
    await act(async () => rejectSave(new Error("quota")));
    render(<PocketRecorder />);
    fireEvent.click(await screen.findByRole("button", { name: /download unsaved take/ }));
    expect(createObjectURL).toHaveBeenCalledWith(memos.save.mock.calls[0][0].blob);
  });

  it("blocks another recording when the recovery backlog is full", async () => {
    const { getUserMedia } = setupRecorder();
    memos.save.mockResolvedValue(null);
    render(<PocketRecorder />);
    for (let i = 0; i < 4; i++) {
      await take();
      await waitFor(() => expect(screen.getAllByRole("button", { name: /download unsaved take/ })).toHaveLength(i + 1));
    }
    expect(screen.getByRole("button", { name: /hum it before/ })).toBeDisabled();
    expect(getUserMedia).toHaveBeenCalledTimes(4);
  });

  it("reserves recovery slots while saves are still pending", async () => {
    setupRecorder();
    const settleSaves = [];
    memos.save.mockImplementation(() => new Promise((resolve) => settleSaves.push(resolve)));
    render(<PocketRecorder />);
    for (let i = 0; i < 4; i++) await take();
    expect(screen.getByRole("button", { name: /hum it before/ })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /download unsaved take/ })).toHaveLength(4);
    await act(async () => settleSaves.forEach((resolve) => resolve(null)));
  });

  it("stops a long recording and saves its collected audio at the duration limit", async () => {
    setupRecorder();
    vi.useFakeTimers();
    render(<PocketRecorder />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /hum it before/ })));
    expect(screen.getByRole("button", { name: /keep it/ })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(300000));
    expect(memos.save).toHaveBeenCalledOnce();
    expect(memos.save.mock.calls[0][0].blob.size).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /keep it/ })).not.toBeInTheDocument();
  });
});

it("exposes older recordings for playback and download", async () => {
  vi.spyOn(memos, "list").mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ id: `memo-${i}`, name: `Take ${i}`, at: i })));
  render(<PocketRecorder />);
  expect(await screen.findByRole("button", { name: "play Take 7" })).toBeVisible();
  expect(screen.getByRole("button", { name: "download Take 7" })).toBeVisible();
});
