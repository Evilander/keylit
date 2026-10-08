// LibraryRoom.jsx — the Library room, mechanically extracted from App.jsx.
// All state lives in App; this is a dumb receiver of props.
import Library from "../Library.jsx";

export default function LibraryRoom({
  onOpen, onSetlist, onPerform, quote, potd, arm, auditionChords, sendChordsToWrite,
  setSection, setImportTarget, setImportOpen, setLoaded, loadSheet, defaultSheet,
}) {
  return (
    <Library onOpen={onOpen}
      quote={quote}
      potd={potd}
      onPotd={(action) => {
        arm();
        if (action === "hear") { auditionChords(potd.chords); return; }
        sendChordsToWrite(potd.chords, `${potd.name} · ${potd.keyName}`);
      }}
      onSetlist={onSetlist || (() => setSection("setlists"))}
      onPerform={onPerform}
      onPaste={() => { setSection("song"); setImportTarget("song"); setImportOpen(true); }}
      onDemo={() => { setLoaded(null); loadSheet(defaultSheet); setSection("song"); }}
      onHeard={(sheetText, title) => {
        setLoaded({ title: title || "Heard from audio", artist: null, source: "ear" });
        loadSheet(sheetText);
        setSection("song");
      }} />
  );
}
