// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "./test/render.js";
import { beforeEach, expect, it, vi } from "vitest";
import App from "./App.jsx";
import { encodeShare } from "./lib/sharelink.js";
import { buildUserSong } from "./lib/usersong.js";
import { benchBook, userSongbook } from "./storage.js";
const mocks = vi.hoisted(() => ({
  audio: { init: vi.fn(async () => {}), play: vi.fn(), setMuted: vi.fn(), now: () => 0, playEvents: vi.fn(() => ({ stop: vi.fn() })) },
  load: vi.fn(), analyze: vi.fn(),
}));
vi.mock("./audio/useAudioEngine.js", () => ({ useAudioEngine: () => ({ engine: mocks.audio, engineState: { engine: "off", loading: false } }) }));
vi.mock("./lib/llm.js", async (original) => ({ ...await original(), analyzeSheet: mocks.analyze }));
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); window.history.replaceState(null, "", "/"); });
const go = (key) => fireEvent.keyDown(document.body, { key });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };


vi.mock("./corpus.js", async (original) => ({
  ...await original(),
  loadManifest: async () => [{ id: "fixture", source: "fixture", artist: "Wilco", title: "Tuning check", format: "tab", tuning: "standard", capo: 0 }],
  loadSong: (...args) => mocks.load(...args) || Promise.resolve(({ id: "fixture", source: "fixture", artist: "Wilco", title: "Tuning check", tuning: "standard", capo: 0, format: "tab", body: ["Capo 3", "[Intro]", "C G", "e|--0---|", "B|------|", "G|------|", "D|------|", "A|------|", "E|------|"].join("\n") })),
}));

it("loads a tab, honors explicit no capo, and keeps the selected tuning across rooms", async () => {
  render(<App />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Search the library" }), { target: { value: "Tuning check" } });
  fireEvent.click(await screen.findByRole("button", { name: /Tuning check/ }));
  await screen.findByRole("heading", { name: "Tuning check" });
  expect(screen.getByText("Standard · no capo · Guitar ♯ names")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Expand guitar setup" }));
  fireEvent.change(screen.getByRole("combobox", { name: "My guitar tuning" }), { target: { value: "dropD" } });
  await waitFor(() => expect(screen.getByText(/written for Standard → Drop D/)).toBeInTheDocument());
  expect(screen.getByText(/Tab → piano/)).toHaveTextContent("Drop D");
  fireEvent.click(screen.getByRole("button", { name: "Transpose up" }));
  fireEvent.click(screen.getByRole("button", { name: "Transpose up" }));
  await screen.findByText("F#4");
  fireEvent.keyDown(document.body, { key: "4" });
  fireEvent.keyDown(document.body, { key: "2" });
  expect(screen.getByText("Drop D · no capo · Guitar ♯ names")).toBeInTheDocument();
  expect(screen.getByText("F#4")).toBeInTheDocument();
});

it("transposes an explicit mode lens with the song", () => {
  render(<App />); go("2");
  const key = screen.getByRole("combobox", { name: "key", exact: true });
  const before = Number(key.value);
  fireEvent.change(screen.getByRole("combobox", { name: "mode", exact: true }), { target: { value: "minor" } });
  fireEvent.click(screen.getByRole("button", { name: "Transpose up" }));
  expect(Number(key.value)).toBe((before + 1) % 12);
});
it("sounds the initial one-chord chart and replays its selected chip", async () => {
  render(<App />); go("2");
  fireEvent.change(screen.getByRole("textbox", { name: "chord sheet input" }), { target: { value: "C" } });
  go("4");
  fireEvent.click(screen.getByRole("button", { name: "Play through" }));
  await act(async () => {});
  expect(mocks.audio.play).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Pause", exact: true }));
  const chip = screen.getByRole("button", { name: /^C\s*1$/ });
  fireEvent.click(chip); await act(async () => {});
  fireEvent.click(chip); await act(async () => {});
  expect(mocks.audio.play).toHaveBeenCalledTimes(3);
});
it("applies mute to the engine shared by notes and arrangements", () => {
  render(<App />); go("4");
  fireEvent.click(screen.getByRole("button", { name: "Mute", exact: true }));
  expect(mocks.audio.setMuted).toHaveBeenLastCalledWith(true);
});
it("does not let a pending Library open replace a newer edit", async () => {
  const pending = deferred(); mocks.load.mockReturnValueOnce(pending.promise);
  render(<App />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Search the library" }), { target: { value: "Tuning check" } });
  fireEvent.click(await screen.findByRole("button", { name: /Tuning check/ }));
  go("2");
  fireEvent.change(screen.getByRole("textbox", { name: "chord sheet input" }), { target: { value: "Dm G C" } });
  await act(async () => pending.resolve({ title: "Old response", body: "F" }));
  expect(screen.getByRole("textbox", { name: "chord sheet input" })).toHaveValue("Dm G C");
});
it("reports an unavailable ordinary Library chart", async () => {
  mocks.load.mockReturnValueOnce(Promise.resolve(null)); render(<App />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Search the library" }), { target: { value: "Tuning check" } });
  fireEvent.click(await screen.findByRole("button", { name: /Tuning check/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
});
it("discards analysis after its source chart changes", async () => {
  const pending = deferred(); mocks.analyze.mockReturnValueOnce(pending.promise);
  render(<App />); go("2");
  fireEvent.click(screen.getByRole("button", { name: "Read the harmony" }));
  fireEvent.change(screen.getByRole("textbox", { name: "chord sheet input" }), { target: { value: "Dm G C" } });
  await act(async () => pending.resolve({ ok: true, data: { key: "A", summary: "Stale analysis" } }));
  expect(screen.queryByText("Stale analysis")).not.toBeInTheDocument();
});
it("recovers the active desk independently of manually kept sketches", async () => {
  const first = render(<App />); go("7");
  fireEvent.change(screen.getByRole("textbox", { name: "Lyric pad" }), { target: { value: "Unkept words" } });
  await act(async () => {});
  expect(localStorage.getItem("keylit.write.drafts.v2")).toBeNull();
  const recovered = JSON.parse(localStorage.getItem("keylit.write.recovery.v1"));
  expect(recovered.draft.id).not.toBe("write-draft");
  first.unmount(); render(<App />); go("7");
  expect(screen.getByRole("textbox", { name: "Lyric pad" })).toHaveValue("Unkept words");
});

it("keeps malformed recovery intact and reports the recovery failure", () => {
  localStorage.setItem("keylit.write.recovery.v1", "{bad json");
  render(<App />);
  expect(screen.getByRole("alert")).toHaveTextContent(/could not be recovered/i);
  expect(localStorage.getItem("keylit.write.recovery.v1")).toBe("{bad json");
});
it("reports recovery writes failing instead of promising an autosave", () => {
  const original = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(key, value) {
    if (key === "keylit.write.recovery.v1") throw new Error("quota");
    return original.call(this, key, value);
  });
  try {
    render(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be autosaved/i);
  } finally { spy.mockRestore(); }
});
it("gives a new desk a fresh identity without touching a kept sketch", () => {
  localStorage.setItem("keylit.write.drafts.v2", "kept fixture");
  const first = render(<App />);
  const firstId = JSON.parse(localStorage.getItem("keylit.write.recovery.v1")).draft.id;
  first.unmount(); localStorage.removeItem("keylit.write.recovery.v1");
  render(<App />);
  expect(JSON.parse(localStorage.getItem("keylit.write.recovery.v1")).draft.id).not.toBe(firstId);
  expect(localStorage.getItem("keylit.write.drafts.v2")).toBe("kept fixture");
});
it("does not start an arrangement after navigating away during audio initialization", async () => {
  const pending = deferred(); mocks.audio.init.mockReturnValueOnce(pending.promise);
  render(<App />); go("4");
  fireEvent.click(screen.getByRole("button", { name: "Play it", exact: true }));
  go("2");
  await act(async () => pending.resolve());
  expect(mocks.audio.playEvents).not.toHaveBeenCalled();
});

it("autosaves later desk edits without changing the explicitly kept snapshot", () => {
  render(<App />); go("7");
  fireEvent.change(screen.getByRole("textbox", { name: "Lyric pad" }), { target: { value: "Kept words" } });
  fireEvent.click(screen.getByRole("button", { name: "Keep sketch" }));
  const kept = JSON.parse(localStorage.getItem("keylit.write.drafts.v2")).drafts[0];
  fireEvent.change(screen.getByRole("textbox", { name: "Lyric pad" }), { target: { value: "New unkept words" } });
  const recovery = JSON.parse(localStorage.getItem("keylit.write.recovery.v1"));
  expect(recovery.draft.id).toBe(kept.id);
  expect(recovery.draft.lyrics).toBe("New unkept words");
  expect(JSON.parse(localStorage.getItem("keylit.write.drafts.v2")).drafts).toEqual([kept]);
});
it("a canceled late start cannot displace the next room's arrangement", async () => {
  const old = deferred(); mocks.audio.init.mockReturnValueOnce(old.promise);
  render(<App />); go("4");
  fireEvent.click(screen.getByRole("button", { name: "Play it", exact: true }));
  go("2"); go("4");
  fireEvent.click(screen.getByRole("button", { name: "Play it", exact: true }));
  await act(async () => {});
  expect(mocks.audio.playEvents).toHaveBeenCalledTimes(1);
  const active = mocks.audio.playEvents.mock.results[0].value;
  await act(async () => old.resolve());
  expect(mocks.audio.playEvents).toHaveBeenCalledTimes(1);
  expect(active.stop).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Stop", exact: true })).toBeInTheDocument();
});

it("New sketch preserves both kept songs and Undo restores unkept writing", () => {
  render(<App />); go("7");
  fireEvent.change(screen.getByRole("textbox", { name: "Draft name" }), { target: { value: "First" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Lyric pad" }), { target: { value: "First saved words" } });
  fireEvent.click(screen.getByRole("button", { name: "Keep sketch" }));
  const first = JSON.parse(localStorage.getItem("keylit.write.drafts.v2")).drafts[0];
  fireEvent.change(screen.getByRole("textbox", { name: "Lyric pad" }), { target: { value: "Unkept revision" } });
  fireEvent.click(screen.getByRole("button", { name: "New sketch" }));
  expect(screen.getByRole("textbox", { name: "Lyric pad" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Draft name" })).toHaveValue("Untitled");
  fireEvent.click(screen.getByRole("button", { name: /undo/i }));
  expect(screen.getByRole("textbox", { name: "Lyric pad" })).toHaveValue("Unkept revision");
  fireEvent.click(screen.getByRole("button", { name: "New sketch" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Draft name" }), { target: { value: "Second" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Lyric pad" }), { target: { value: "Second words" } });
  fireEvent.click(screen.getByRole("button", { name: "Keep sketch" }));
  const saved = JSON.parse(localStorage.getItem("keylit.write.drafts.v2")).drafts;
  expect(saved).toHaveLength(2);
  expect(saved.find((d) => d.id === first.id)).toEqual(first);
  expect(saved.find((d) => d.name === "Second").id).not.toBe(first.id);
});

it("uses the saved legacy identity when keeping a handed chart and adding it to a setlist", () => {
  const built = buildUserSong({ artist: "Writer", title: "Shared song", body: "C G" });
  userSongbook.save({ ...built.song, id: "legacy-user" }, { ...built.row, id: "legacy-user" });
  window.history.replaceState(null, "", `/#s=${encodeShare({ artist: "Writer", title: "Shared song", body: "Dm G" })}`);
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to setlist" }));
  expect(benchBook.setlists()[0].entries[0]).toMatchObject({ id: "legacy-user", source: "user" });
  expect(userSongbook.all()).toHaveLength(1);
  expect(userSongbook.get("legacy-user").body).toBe("Dm G");
});
it("surfaces the songbook's specific save error without destructive quota advice", () => {
  window.history.replaceState(null, "", `/#s=${encodeShare({ artist: "Writer", title: "Shared song", body: "C G" })}`);
  const save = vi.spyOn(userSongbook, "save").mockImplementation(() => { throw new Error("A different song already uses this ID"); });
  try {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A different song already uses this ID");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/clear space|clear app data|export a backup/i);
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument();
  } finally { save.mockRestore(); }
});
