// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "../test/render.js";
import Ear from "./Ear.jsx";

vi.mock("../lib/ear.js", () => ({ frameChroma: vi.fn(), finishDetection: vi.fn(), summarizeSegments: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("local audio analysis lifecycle", () => {
  it("closes the decoding context when the audio is invalid", async () => {
    const close = vi.fn();
    vi.stubGlobal("AudioContext", class {
      close = close;
      decodeAudioData = async () => { throw new Error("Bad audio"); };
    });
    const { container } = render(<Ear />);
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [{ name: "broken.wav", arrayBuffer: async () => new ArrayBuffer(1) }] } });
    await screen.findByText("Bad audio");
    expect(close).toHaveBeenCalledOnce();
  });

  it("ignores a canceled decode after another file starts", async () => {
    let decode;
    const close = vi.fn();
    vi.stubGlobal("AudioContext", class {
      close = close;
      decodeAudioData = () => new Promise((resolve) => { decode = resolve; });
    });
    const offline = vi.fn();
    vi.stubGlobal("OfflineAudioContext", offline);
    const { container } = render(<Ear />);
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [{ name: "old.wav", arrayBuffer: async () => new ArrayBuffer(1) }] } });
    await waitFor(() => expect(decode).toBeTypeOf("function"));
    const oldDecode = decode;
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [{ name: "new.wav", arrayBuffer: async () => new ArrayBuffer(1) }] } });
    await act(async () => oldDecode({ duration: 10 }));
    expect(offline).not.toHaveBeenCalled();
    expect(screen.getByText("Dropping the needle…")).toBeInTheDocument();
  });
});

it("offers a visible, named native audio file picker for keyboard users", () => {
  render(<Ear />);
  const input = screen.getByLabelText("Choose an audio file");
  expect(input).toBeVisible();
  input.focus();
  expect(input).toHaveFocus();
  expect(input).toHaveAttribute("accept", "audio/*");
});
