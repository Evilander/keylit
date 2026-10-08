// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render.js";
import { userSongbook } from "../storage.js";
import { buildUserSong } from "../lib/usersong.js";
import AddSong from "./AddSong.jsx";

beforeEach(() => localStorage.clear());
function fill(title = "Song!") {
  fireEvent.change(screen.getByLabelText("artist"), { target: { value: "Artist" } });
  fireEvent.change(screen.getByLabelText("title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("chart or tab"), { target: { value: "G" } });
  fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
}
it("returns the saved legacy ID to its caller for an exact-name edit", () => {
  userSongbook.save({ id: "legacy-song", artist: "Artist", title: "Song!", body: "C" });
  const onSaved = vi.fn();
  render(<AddSong onSaved={onSaved} />);
  fill();
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "legacy-song", body: "G" }));
  expect(userSongbook.all()).toHaveLength(1);
});
it("stores a punctuation variant separately from the legacy song", () => {
  userSongbook.save({ id: "user--artist--song", artist: "Artist", title: "Song", body: "C" });
  render(<AddSong />);
  fill();
  expect(userSongbook.all()).toHaveLength(2);
  expect(userSongbook.get("user--artist--song").body).toBe("C");
});
it("shows an honest identity-conflict error and retains the chart", () => {
  const targetId = buildUserSong({ artist: "Artist", title: "Song!", body: "C" }).song.id;
  userSongbook.replaceAll([{ id: targetId, artist: "Other", title: "Different", body: "C" }]);
  const onSaved = vi.fn();
  render(<AddSong onSaved={onSaved} />);
  fill();
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(/different song already uses this ID/);
  expect(screen.getByRole("alert")).not.toHaveTextContent(/Storage is full/);
  expect(screen.getByLabelText("chart or tab")).toHaveValue("G");
  expect(userSongbook.get(targetId).body).toBe("C");
});
