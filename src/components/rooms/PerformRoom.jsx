// PerformRoom.jsx — the Perform room, mechanically extracted from App.jsx.
// All state lives in App; this is a dumb receiver of props.
import { rootPositionFull } from "../../lib/voicing.js";
import { allNotesOff } from "../../webmidi.js";
import Perform from "../Perform.jsx";

export default function PerformRoom({
  performRun, displaySheet, retabTag, loaded, keyNameFull, readingKey, readingShift, readingView,
  currentIdx, selectIdx, isPlaying, togglePlay, tempo, setTempo, roleForKeyboard, flash, playSingleKey,
  setlistCtx, openSong, setSection, requestPerformSetPage, updatePerformSetPageSetup,
  performRunRef, setPerformRun, arm, ensureAndPlay, midiOutRef,
}) {
  return (
    <Perform
      run={performRun}
      singleSong={performRun ? null : {
        sheet: displaySheet,
        retabTag,
        loaded,
        keyName: keyNameFull,
        activeKey: readingKey,
        transpose: readingShift,
        prog: readingView.prog,
        currentIdx,
        onSelectIdx: selectIdx,
        isPlaying,
        onTogglePlay: togglePlay,
        tempo,
        onTempo: setTempo,
        roleFor: roleForKeyboard,
        flash,
        onKeyPress: playSingleKey,
        setlistCtx,
        onOpenSetlistSong: openSong,
        onPickSong: () => setSection("library"),
      }}
      onRequestPage={requestPerformSetPage}
      onSetupChange={updatePerformSetPageSetup}
      onExitSet={() => {
        performRunRef.current = null;
        setPerformRun(null);
        setSection("setlists");
      }}
      onPickSong={() => setSection("library")}
      onPlayPageChord={({ chord }) => {
        arm();
        ensureAndPlay(rootPositionFull(chord), Math.max(0.4, tempo / 1000 * 0.8));
      }}
      onStopPageWalk={() => {
        try { allNotesOff(midiOutRef.current); } catch { /* output may have disconnected */ }
      }}
      tempo={tempo}
    />
  );
}
