// ChordBook.jsx — the guitar chord bible as a room, not a scan. Pick a root
// and a quality (or look one up by name) and the book derives every playable
// grip live via chordShapes — which is why this bible reopens correctly in
// whatever tuning the Guitar setup says is in your hands. Selecting a grip
// lights the SAME notes on the piano below: one chord, two instruments.
// Audio + naming preferences come from App; no state leaks back out.
import { useEffect, useMemo, useState } from "react";
import { Guitar, Piano, Search } from "lucide-react";
import { CHORD_FAMILIES, qualityLabel, bookChord, findInBook } from "../lib/chordbook.js";
import { chordShapes, shapeFingerString } from "../lib/chordShapes.js";
import { getTuning } from "../lib/tuning.js";
import { parseChord } from "../lib/theory.js";
import { spellChord, spellPc } from "../lib/spelling.js";
import { rootPositionFull } from "../lib/voicing.js";
import ChordDiagram from "./ChordDiagram.jsx";
import Keyboard from "./Keyboard.jsx";
import { Faceplate, EngLabel, RoomTitle } from "../ui/Bench.jsx";
import { C, MONO } from "../ui/theme.js";

const pcOf = (m) => ((m % 12) + 12) % 12;

export default function ChordBook({ tuningId = "standard", spelling = "sharps", onStrum, onPlay }) {
  const [rootPc, setRootPc] = useState(4); // E — the first chord anyone learns
  const [familyId, setFamilyId] = useState("major");
  const [qKey, setQKey] = useState("");
  const [sel, setSel] = useState(0);
  const [query, setQuery] = useState("");
  const [lookupNote, setLookupNote] = useState(null);

  const tuning = useMemo(() => getTuning(tuningId), [tuningId]);
  const family = CHORD_FAMILIES.find((f) => f.id === familyId) || CHORD_FAMILIES[0];
  const chord = useMemo(() => bookChord(rootPc, qKey), [rootPc, qKey]);
  const shapes = useMemo(
    () => (chord ? chordShapes(chord, { tuning: tuning.notes, limit: 8 }) : []),
    [chord, tuning]
  );
  useEffect(() => { setSel(0); }, [chord, tuning]);
  const shape = shapes[Math.min(sel, Math.max(0, shapes.length - 1))] || null;

  const nameCtx = { tonic: rootPc, mode: "major", spelling };
  const label = chord ? spellChord(chord, nameCtx) : "";
  const pianoLabel = chord ? spellChord(chord, { tonic: rootPc, mode: "major" }) : "";
  const chordPcs = useMemo(
    () => new Set(chord ? chord.intervals.map((iv) => pcOf(chord.rootSemitone + iv)) : []),
    [chord]
  );
  const toneNames = chord
    ? [...new Set(chord.intervals.map((iv) => pcOf(chord.rootSemitone + iv)))].map((pc) => spellPc(pc, nameCtx))
    : [];

  // The selected grip's exact notes light solid (this grip IS these keys);
  // the chord's other octaves ghost, so the pitch classes read as one idea.
  const litMidis = useMemo(() => new Set(shape ? shape.midi : []), [shape]);
  const roleFor = (midi) => {
    const pc = pcOf(midi);
    if (litMidis.has(midi)) {
      return { role: pc === pcOf(chord.rootSemitone) ? "root" : "tone", label: spellPc(pc, nameCtx) };
    }
    if (chordPcs.has(pc)) return { role: pc === pcOf(chord.rootSemitone) ? "root" : "tone", ghost: true };
    return null;
  };

  const pickFamily = (id) => {
    const f = CHORD_FAMILIES.find((x) => x.id === id);
    setFamilyId(id);
    if (f && !f.keys.includes(qKey)) setQKey(f.keys[0]);
  };

  const lookup = (e) => {
    e?.preventDefault?.();
    const parsed = parseChord(query.trim());
    if (!parsed) { setLookupNote(query.trim() ? "that doesn't read as a chord symbol" : null); return; }
    const page = findInBook(parsed);
    if (!page) { setLookupNote(`no ${parsed.quality} page in this book yet`); return; }
    setRootPc(pcOf(parsed.rootSemitone));
    setFamilyId(page.familyId);
    setQKey(page.key);
    setLookupNote(parsed.bassSemitone != null ? "slash basses are the player's call — showing the plain chord" : null);
  };

  const strumShape = (s) => { if (s) onStrum?.(s.midi); };
  const noteLabelsFor = (s) =>
    s.frets.map((f, i) => (f == null ? null : spellPc(pcOf(tuning.notes[i] + f), nameCtx)));

  const chipStyle = (on) => ({
    fontFamily: MONO, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    padding: "5px 10px", borderRadius: 8, color: on ? C.ink : C.muted,
    background: on ? C.panel2 : "transparent",
    border: `1px solid ${on ? C.toneUi : C.line}`,
  });

  return (
    <div className="kl-section">
      <RoomTitle kicker="the bible" title="Chordbook"
        sub={<>Every grip on these pages is <em>derived</em>, not printed — searched fresh on the fretboard of
          the guitar in your hands ({tuning.name} · {tuning.spelling}), then ranked the way a campfire ranks
          them. Pick a grip and the piano lights the exact same notes.</>} />

      <Faceplate label="Find a chord" style={{ marginBottom: 16 }}
        right={
          <form onSubmit={lookup} className="flex items-center" style={{ gap: 6 }}>
            <input value={query} onChange={(e) => { setQuery(e.target.value); setLookupNote(null); }}
              placeholder="look up… F#m7" aria-label="look up a chord by name" spellCheck={false}
              style={{ width: 120, fontFamily: MONO, fontSize: 12.5, color: C.ink, background: C.panel2,
                border: `1px solid ${C.line}`, borderRadius: 8, padding: "5px 9px", outline: "none" }} />
            <button type="submit" className="bench-btn" style={{ padding: "5px 9px" }} aria-label="look it up">
              <Search size={13} />
            </button>
          </form>
        }>
        <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
          <EngLabel style={{ marginRight: 4 }}>root</EngLabel>
          <div role="radiogroup" aria-label="Chord root" className="flex items-center" style={{ gap: 5, flexWrap: "wrap" }}>
            {Array.from({ length: 12 }, (_, i) => (
              <button key={i} role="radio" aria-checked={rootPc === i} style={chipStyle(rootPc === i)}
                onClick={() => setRootPc(i)}>
                {spellPc(i, { tonic: i, mode: "major", spelling })}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <div className="kl-seg" role="tablist" aria-label="Chord family">
            {CHORD_FAMILIES.map((f) => (
              <button key={f.id} role="tab" aria-selected={familyId === f.id} onClick={() => pickFamily(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Chord quality" className="flex items-center" style={{ gap: 5, flexWrap: "wrap" }}>
            {family.keys.map((k) => (
              <button key={k || "maj"} role="radio" aria-checked={qKey === k} style={chipStyle(qKey === k)}
                onClick={() => setQKey(k)}>
                {qualityLabel(k)}
              </button>
            ))}
          </div>
        </div>
        {lookupNote && <p style={{ margin: "8px 0 0", fontSize: 12, color: C.bassText }}>{lookupNote}</p>}
      </Faceplate>

      <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 250px", gap: 18, alignItems: "start" }}>
        <div>
          {shapes.length ? (
            <div className="flex" style={{ gap: 12, flexWrap: "wrap" }}>
              {shapes.map((s, i) => {
                const on = i === Math.min(sel, shapes.length - 1);
                return (
                  <button key={i} onClick={() => { setSel(i); strumShape(s); }}
                    aria-pressed={on} aria-label={`${label} grip ${i + 1}: ${shapeFingerString(s)} — click to hear it`}
                    title="click to hear this grip"
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      padding: "8px 10px 6px", borderRadius: 11, cursor: "pointer",
                      background: on ? C.panel2 : C.panel,
                      border: `1px solid ${on ? C.toneUi : C.line}`,
                    }}>
                    <ChordDiagram shape={s} tuning={tuning.notes} rootPc={pcOf(chord.rootSemitone)}
                      noteLabels={noteLabelsFor(s)} width={104} />
                    <span style={{ fontFamily: MONO, fontSize: 11.5, color: on ? C.ink : C.muted, letterSpacing: "0.06em" }}>
                      {shapeFingerString(s)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p style={{ color: C.muted, fontSize: 13.5 }}>
              No comfortable grip for this one in {tuning.name} — a fine excuse to play it on the keys below.
            </p>
          )}
        </div>

        <div className="readout" style={{ padding: "14px 16px" }}>
          <div key={label} className="kl-noteswap" style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>
            {label}
          </div>
          {pianoLabel !== label && (
            <div className="flex items-center" style={{ gap: 5, marginTop: 3, fontFamily: MONO, fontSize: 12, color: C.muted }}>
              <Piano size={12} aria-hidden="true" /> piano says <b style={{ color: C.ink }}>{pianoLabel}</b>
            </div>
          )}
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12.5, color: C.toneText }}>
            {toneNames.join(" · ")}
          </div>
          <div className="flex items-center" style={{ gap: 7, marginTop: 12, flexWrap: "wrap" }}>
            <button className="bench-btn primary" onClick={() => strumShape(shape)} disabled={!shape}
              title="roll the selected grip, low string to high">
              <Guitar size={13} /> strum
            </button>
            <button className="bench-btn" onClick={() => chord && onPlay?.(rootPositionFull(chord), 1.4)}
              title="hear the piano voicing">
              <Piano size={13} /> piano
            </button>
          </div>
          {shapes.length > 0 && (
            <p style={{ margin: "12px 0 0", fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
              {shapes.length} grip{shapes.length === 1 ? "" : "s"}, best first — open strings, low frets and
              full strums win. Grip {Math.min(sel, shapes.length - 1) + 1} is on the piano below.
            </p>
          )}
        </div>
      </div>

      <div className="deck" style={{ padding: "14px 12px", marginTop: 18 }}>
        <div className="key-felt" style={{ padding: "12px 10px 8px" }}>
          <Keyboard roleFor={chord ? roleFor : null} onKey={(m) => onPlay?.([m], 1.0)}
            ariaLabel="piano keyboard — the selected guitar grip is lit, other octaves ghosted" />
        </div>
      </div>
    </div>
  );
}
