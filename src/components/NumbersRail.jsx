// NumbersRail.jsx — the signature: one progression shown in three aligned
// notations at once. Nashville (Tyler's native dialect) / Roman / real notes,
// column-locked per chord, tinted by harmonic function. Change the key and the
// number rows hold still while the notes move — "the numbers stay, the key moves."
import { nashville, romanNumeral, displaySymbol, harmonicFunction } from "../lib/theory.js";
import { C, FUNCTION_COLOR, FUNCTION_LABEL, MONO } from "../ui/theme.js";

const ROWS = [
  { key: "nash", eng: "nashville", get: (ch, k) => nashville(ch, k.tonic) },
  { key: "roman", eng: "roman", get: (ch, k) => romanNumeral(ch, k.tonic) },
  { key: "notes", eng: "notes", get: (ch, k, t) => displaySymbol(ch, t) },
];

export default function NumbersRail({ prog, activeKey, currentIdx, transpose = 0, onSelect, hideRow = null, compact = false }) {
  if (!prog || !prog.length) return null;

  return (
    <div>
      <div className="flex" style={{ gap: 0 }}>
        {/* row labels gutter */}
        <div style={{ flexShrink: 0, paddingRight: 10, display: "grid", gridTemplateRows: "auto 1fr 1fr 1fr", gap: 4 }}>
          <div style={{ height: 14 }} />
          {ROWS.map((r) => (
            <div key={r.key} className="engraved" style={{ display: "flex", alignItems: "center", height: compact ? 24 : 30, fontSize: 9 }}>
              {hideRow === r.key ? "?" : r.eng}
            </div>
          ))}
        </div>

        {/* chord columns */}
        <div style={{ overflowX: "auto", flex: 1, minWidth: 0 }}>
          <div className="flex" style={{ gap: 5, paddingBottom: 6, minWidth: "min-content" }}>
            {prog.map((ch, i) => {
              const active = i === currentIdx;
              const fn = harmonicFunction(ch, activeKey.tonic, activeKey.mode);
              const fnColor = FUNCTION_COLOR[fn] || C.faint;
              const showSection = i === 0 || prog[i - 1].section !== ch.section;
              return (
                <div key={i} className="flex" style={{ alignItems: "stretch", gap: 5 }}>
                  {showSection && ch.section && i !== 0 && (
                    <div style={{ width: 1, alignSelf: "stretch", background: C.line, margin: "0 3px" }} />
                  )}
                  <button onClick={() => onSelect?.(i)} title={`${FUNCTION_LABEL[fn]} function`}
                    aria-current={active}
                    style={{
                      display: "grid", gridTemplateRows: "auto 1fr 1fr 1fr", gap: 4,
                      background: active ? "rgba(240,180,41,0.10)" : "transparent",
                      border: `1px solid ${active ? C.root : "transparent"}`,
                      borderRadius: 9, padding: "4px 6px", cursor: "pointer", minWidth: compact ? 40 : 52,
                      transition: "background 130ms ease, border-color 130ms ease",
                    }}>
                    {/* section tick / playhead */}
                    <div style={{ height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ width: active ? 14 : 4, height: 4, borderRadius: 2, background: active ? C.root : fnColor, boxShadow: active ? `0 0 8px ${C.root}` : "none", transition: "all 160ms ease" }} />
                    </div>
                    {ROWS.map((r) => {
                      const hidden = hideRow === r.key;
                      const val = r.get(ch, activeKey, transpose);
                      const isNotes = r.key === "notes";
                      return (
                        <div key={r.key} style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          height: compact ? 24 : 30,
                          fontFamily: MONO,
                          fontSize: r.key === "nash" ? (compact ? 14 : 16) : (compact ? 12 : 13),
                          fontWeight: r.key === "nash" ? 700 : 600,
                          color: hidden ? C.faint : isNotes ? (active ? C.ink : C.muted) : fnColor,
                          opacity: hidden ? 0.35 : 1,
                          letterSpacing: "-0.01em", whiteSpace: "nowrap",
                        }}>
                          {hidden ? "·" : isNotes ? <span key={val} className="kl-noteswap">{val}</span> : val}
                        </div>
                      );
                    })}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
