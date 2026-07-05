// Shed.jsx — the practice library (Practice room). Method books, technique
// routines, theory, references, magazines: the shelf BESIDE the songbook.
// Charts live in the Library; the stuff that makes you better lives here.
// Data: public/corpus/shed/index.json (tools/build_shed.mjs). Small text
// lessons and extracted EPUB chapters read in-app; everything else shows
// its shelf path with one-tap copy (the file opens in your own reader).
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Copy, Check, ChevronRight, FileText } from "lucide-react";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const KIND_ORDER = ["method", "technique", "lesson", "exercises", "theory", "reference", "magazine"];
const KIND_LABEL = {
  method: "Methods", technique: "Technique", lesson: "Lessons",
  exercises: "The finger gym", theory: "Theory", reference: "Reference", magazine: "The magazine rack",
};

export default function Shed() {
  const [shelf, setShelf] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [reading, setReading] = useState(null); // { title, text }
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    let on = true;
    fetch("corpus/shed/index.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (on) setShelf(rows); })
      .catch(() => { if (on) setShelf([]); });
    return () => { on = false; };
  }, []);

  const groups = useMemo(() => {
    const by = new Map();
    for (const item of shelf || []) {
      if (!by.has(item.kind)) by.set(item.kind, []);
      by.get(item.kind).push(item);
    }
    return KIND_ORDER.filter((k) => by.has(k)).map((k) => ({ kind: k, items: by.get(k) }));
  }, [shelf]);

  const readText = async (title, textFile) => {
    try {
      const r = await fetch(`corpus/shed/${textFile}`);
      setReading({ title, text: r.ok ? await r.text() : "Couldn't load this one." });
    } catch {
      setReading({ title, text: "Couldn't load this one." });
    }
  };

  const copyPath = async (p) => {
    try { await navigator.clipboard.writeText(p); setCopied(p); setTimeout(() => setCopied(null), 1400); } catch { /* clipboard denied */ }
  };

  if (shelf === null) return <p style={{ color: C.muted, marginTop: 18 }}>Opening the shed…</p>;
  if (!shelf.length) {
    return (
      <div style={{ marginTop: 18, color: C.muted, fontSize: 14, maxWidth: 560 }}>
        <p style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 19, color: C.ink }}>The shed is empty.</p>
        <p style={{ marginTop: 8 }}>Run <code style={{ fontFamily: MONO }}>node tools/build_shed.mjs</code> after pointing it at your method books.</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div className="kl-eyebrow">The shed</div>
      <h2 className="kl-title" style={{ marginTop: 4, fontSize: 26 }}>Woodshedding material</h2>
      <p style={{ color: C.muted, fontSize: 13.5, maxWidth: 640, margin: "8px 0 16px", lineHeight: 1.5 }}>
        Songs live in the Library; the books that make your hands better live here. Text lessons read
        in-app — the heavier books open from your own shelf.
      </p>

      <div className="bench-cols" style={{ display: "grid", gridTemplateColumns: reading ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)", gap: 20, alignItems: "start" }}>
        <div>
          {groups.map(({ kind, items }) => (
            <div key={kind} className="faceplate" style={{ padding: 16, marginBottom: 14 }}>
              <span className="kl-eyebrow">{KIND_LABEL[kind]}</span>
              {items.map((item) => {
                const open = openId === item.id;
                return (
                  <div key={item.id} style={{ borderTop: `1px solid ${C.line}`, marginTop: 8, paddingTop: 8 }}>
                    <button onClick={() => setOpenId(open ? null : item.id)} aria-expanded={open}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, background: "transparent", border: 0, cursor: "pointer", textAlign: "left", padding: "2px 0" }}>
                      <ChevronRight size={14} style={{ color: C.faint, transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms ease", flex: "0 0 auto" }} />
                      <span style={{ fontSize: 14, color: C.ink, fontWeight: 600, flex: 1, minWidth: 0 }}>{item.title}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>{item.instrument}</span>
                      {(item.textFile || item.chapters) && <BookOpen size={13} style={{ color: C.toneText }} title="readable in-app" />}
                    </button>
                    {open && (
                      <div style={{ padding: "6px 0 4px 23px" }}>
                        <p style={{ margin: 0, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{item.note}</p>
                        <div className="flex items-center" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          {item.textFile && (
                            <button className="bench-btn" style={{ padding: "5px 11px", fontSize: 12 }}
                              onClick={() => readText(item.title, item.textFile)}>
                              <FileText size={13} /> read it here
                            </button>
                          )}
                          <button className="bench-btn" style={{ padding: "5px 11px", fontSize: 12 }} onClick={() => copyPath(item.path)}
                            title={item.path}>
                            {copied === item.path ? <Check size={13} /> : <Copy size={13} />} copy shelf path
                          </button>
                        </div>
                        {item.chapters && (
                          <div style={{ marginTop: 10, maxHeight: 200, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 9 }}>
                            {item.chapters.map((ch, i) => (
                              <button key={i} onClick={() => readText(`${item.title} — ${ch.name}`, ch.textFile)}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 10px", fontSize: 12.5, color: C.ink, background: "transparent", border: 0, borderTop: i ? `1px solid ${C.line}` : 0, cursor: "pointer" }}>
                                {ch.name}
                              </button>
                            ))}
                          </div>
                        )}
                        {item.contents && (
                          <div style={{ marginTop: 10, maxHeight: 160, overflowY: "auto" }}>
                            {item.contents.map((f, i) => (
                              <div key={i} className="flex items-center" style={{ gap: 8, padding: "3px 0" }}>
                                <span style={{ fontSize: 12.5, color: C.muted, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
                                <button onClick={() => copyPath(f.path)} title={f.path}
                                  style={{ background: "transparent", border: 0, color: C.faint, cursor: "pointer", display: "inline-flex" }}>
                                  {copied === f.path ? <Check size={12} /> : <Copy size={12} />}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {reading && (
          <div className="faceplate" style={{ padding: 16, position: "sticky", top: 12 }}>
            <div className="flex items-center justify-between" style={{ gap: 10, marginBottom: 10 }}>
              <span className="kl-eyebrow" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reading.title}</span>
              <button className="bench-btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setReading(null)}>close</button>
            </div>
            <pre style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.55, color: C.ink, whiteSpace: "pre-wrap", margin: 0, maxHeight: "70vh", overflowY: "auto" }}>
              {reading.text}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
