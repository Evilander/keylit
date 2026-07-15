// MirrorPanel.jsx — the Dialect Mirror's face. It SPEAKS — serif sentences
// about your actual habits, counted from the sketches you kept and the songs
// you chose — then offers exactly one adjacent-possible door, playable now.
// No dashboards, no badges: a mirror, not a report card. (lib/mirror.js)
import { useMemo } from "react";
import { Play, ArrowRight } from "lucide-react";
import { parseSheet, detectKey } from "../lib/theory.js";
import { spellChord } from "../lib/spelling.js";
import { fingerprint, adjacentPossible, mirrorLines } from "../lib/mirror.js";
import { library, userSongbook, benchBook } from "../storage.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

function gatherEvidence() {
  const works = [];
  const consider = (text) => {
    if (!text?.trim()) return;
    const { progression } = parseSheet(text);
    if (progression.length < 3) return;
    const k = detectKey(progression);
    works.push({ progression, key: { tonic: k.tonic, mode: k.mode } });
  };
  for (const s of library.list()) consider(s.sheet);            // Write-desk sketches
  for (const s of userSongbook.all()) consider(s.body);         // songs he chose to keep
  const log = benchBook.log();
  let practice = null;
  if (log.length) {
    const byKey = new Map();
    for (const e of log) {
      const k = e.songKey || "?";
      byKey.set(k, { title: e.title || k, count: (byKey.get(k)?.count || 0) + 1 });
    }
    const top = [...byKey.values()].sort((a, b) => b.count - a.count)[0];
    practice = { count: log.length, topTitle: top?.title, topCount: top?.count };
  }
  return { works, practice };
}

export default function MirrorPanel({ onAudition, onTakeToDesk }) {
  const { fp, lines, door, evidence } = useMemo(() => {
    const { works, practice } = gatherEvidence();
    const fp = fingerprint(works);
    return { fp, lines: mirrorLines(fp, practice), door: adjacentPossible(fp), evidence: works.length };
  }, []);

  if (!fp) {
    return (
      <div style={{ maxWidth: 560, marginTop: 8 }}>
        <div className="kl-eyebrow">The mirror</div>
        <h2 className="kl-h2" style={{ marginTop: 8 }}>It can't see you yet.</h2>
        <p className="kl-prose" style={{ color: C.muted, marginTop: 10 }}>
          The mirror reads what you KEEP — sketches from the Write desk, songs you save to your
          songbook, nights in the practice log. Twenty chords of your own ink and it starts talking:
          the keys you live in, the moves you lean on, and — the part no teacher can see — the
          doors you've never once opened.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 660, marginTop: 8 }}>
      <div className="kl-eyebrow">The mirror</div>
      <div style={{ marginTop: 6 }}>
        {lines.map((l, i) => (
          <p key={i} style={{ fontFamily: DISPLAY, fontSize: 18.5, lineHeight: 1.45, color: C.ink, margin: 0, padding: "12px 0", borderBottom: `1px solid ${C.line}` }}>
            {l}
          </p>
        ))}
      </div>

      {door && (
        <div className="faceplate hero" style={{ marginTop: 20 }}>
          <div className="kl-eyebrow" style={{ color: C.rootText }}>A door you haven't opened · {door.name}</div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: C.ink, margin: "10px 0 0", maxWidth: 540 }}>{door.line}</p>
          <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, margin: "12px 0 0", color: C.toneText, letterSpacing: "0.04em" }}>
            {door.chords.map((ch) => spellChord(ch, null) || ch.raw).join("  →  ")}
            <span className="kl-meta" style={{ color: C.faint, marginLeft: 10 }}>in your {door.keyName}</span>
          </div>
          <div className="flex items-center" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button className="bench-btn primary" onClick={() => onAudition?.(door.chords)}>
              <Play size={14} /> Hear the move
            </button>
            <button className="bench-btn" onClick={() => onTakeToDesk?.(door.chords)}>
              take it to the desk <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      <p style={{ fontSize: 11.5, color: C.faint, marginTop: 14, lineHeight: 1.5 }}>
        Reflecting {evidence} kept piece{evidence === 1 ? "" : "s"} · {fp.total} chords of your own ink ·
        one door at a time, always in your home key. Placing you among the writers on your shelf is the
        named next step — it needs honest per-artist signatures, not vibes.
      </p>
    </div>
  );
}
