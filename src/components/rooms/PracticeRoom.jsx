// PracticeRoom.jsx — the Practice room, mechanically extracted from App.jsx.
// All state lives in App; this is a dumb receiver of props.
import { QuoteLine } from "../../ui/Bench.jsx";
import Practice from "../Practice.jsx";
import PlayAlong from "../PlayAlong.jsx";
import SessionRoom from "../SessionRoom.jsx";
import Metronome from "../Metronome.jsx";
import MirrorPanel from "../MirrorPanel.jsx";
import PracticeRail from "../PracticeRail.jsx";

export default function PracticeRoom({
  quote, practiceTab, setPracticeTab, arm, ensureAndPlay, loaded, sheet, songKey, soundingView,
  capoShift, transpose, labelForSounding, logPractice, setSection, audio, stopArrangement,
  auditionChords, sendChordsToWrite,
}) {
  return (
    <div className="kl-section practice-room">
      <QuoteLine quote={quote} size={18} style={{ marginBottom: 16 }} />
      <div className="kl-seg practice-tabs" role="tablist" aria-label="Practice area" style={{ marginBottom: 6 }}>
        <button role="tab" aria-selected={practiceTab === "drills"} onClick={() => setPracticeTab("drills")}>Drills</button>
        <button role="tab" aria-selected={practiceTab === "song"} onClick={() => setPracticeTab("song")}>Play the song</button>
        <button role="tab" aria-selected={practiceTab === "session"} onClick={() => setPracticeTab("session")}>The Session</button>
        <button role="tab" aria-selected={practiceTab === "time"} onClick={() => setPracticeTab("time")}>Metronome</button>
        <button role="tab" aria-selected={practiceTab === "mirror"} onClick={() => setPracticeTab("mirror")}>The Mirror</button>
      </div>
      <div className="practice-grid">
      <div>
      {practiceTab === "drills" && (
        <Practice onPlay={(midis) => { arm(); midis.forEach((m, i) => setTimeout(() => ensureAndPlay([m], 0.9), i * 460)); }} />
      )}
      {practiceTab === "song" && (
        <PlayAlong
          title={loaded?.title || (sheet.trim() ? "Your chart" : null)}
          artist={loaded?.artist || null}
          songKey={songKey}
          prog={soundingView.prog}
          rootVoicings={soundingView.rootFull}
          smoothVoicings={soundingView.smoothFull}
          sheet={sheet} tuning={loaded?.tuning} tuningRaw={loaded?.tuningRaw}
          capo={capoShift} shift={transpose}
          labelFor={labelForSounding}
          onPlay={(midis, dur) => { arm(); ensureAndPlay(midis, dur); }}
          onScore={logPractice}
          onPickSong={() => setSection("library")}
        />
      )}
      {practiceTab === "session" && (
        <SessionRoom prog={soundingView.prog} labelFor={labelForSounding}
          audio={audio} onClaimStage={stopArrangement} />
      )}
      {practiceTab === "time" && (
        <div style={{ marginTop: 12 }}>
          <Metronome />
        </div>
      )}
      {practiceTab === "mirror" && (
        <MirrorPanel onAudition={auditionChords}
          onTakeToDesk={(chords) => sendChordsToWrite(chords, "Mirror idea")} />
      )}
      </div>
      <PracticeRail refreshKey={practiceTab} onOpenClock={() => setPracticeTab("time")} />
      </div>
    </div>
  );
}
