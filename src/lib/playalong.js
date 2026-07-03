// playalong.js — the wait-mode matching core for "Keylit hears YOU".
// Pure: held-note sets in, verdicts out. The MIDI/browser side lives in
// src/webmidi.js; the UI walker in components/PlayAlong.jsx.
//
// Rules this module owns:
//  - a step completes only on an ATTACK (a fresh press) that satisfies it —
//    releases never advance, so repeated chords demand a real re-strike;
//  - any wrong note observed while a step is open taints it (clean=false),
//    and the taint travels into the results, not the next step;
//  - octaveStrict matches exact keys, otherwise pitch classes cover doublings.

const pc = (m) => ((m % 12) + 12) % 12;

export function matchStep(held, target, { octaveStrict = true, allowExtra = false } = {}) {
  const heldArr = [...held];
  if (octaveStrict) {
    const t = new Set(target);
    const h = new Set(heldArr);
    const missing = target.filter((n) => !h.has(n));
    const wrong = heldArr.filter((n) => !t.has(n));
    const ok = missing.length === 0 && (allowExtra || wrong.length === 0);
    return { ok, missing, wrong };
  }
  const tpcs = new Set(target.map(pc));
  const hpcs = new Set(heldArr.map(pc));
  const missing = [...tpcs].filter((p) => !hpcs.has(p));
  const wrong = heldArr.filter((n) => !tpcs.has(pc(n)));
  const ok = missing.length === 0 && (allowExtra || wrong.length === 0);
  return { ok, missing, wrong };
}

export function createRun(rawSteps, opts = {}) {
  const steps = (rawSteps || []).filter((s) => s.notes && s.notes.length);
  const run = {
    steps,
    i: 0,
    done: steps.length === 0,
    results: [],
    wrongSeen: false,
    observe(held, { attack = true } = {}) {
      if (run.done) return { advanced: false, done: true, ok: true, wrong: [], missing: [] };
      const step = steps[run.i];
      const m = matchStep(held, step.notes, opts);
      if (m.wrong.length) run.wrongSeen = true;
      let advanced = false;
      if (attack && m.ok) {
        run.results.push({ clean: !run.wrongSeen });
        run.wrongSeen = false;
        run.i += 1;
        advanced = true;
        if (run.i >= steps.length) run.done = true;
      }
      return { advanced, done: run.done, ok: m.ok, wrong: m.wrong, missing: m.missing };
    },
    skip() {
      if (run.done) return { advanced: false, done: true };
      run.results.push({ clean: false });
      run.wrongSeen = false;
      run.i += 1;
      if (run.i >= steps.length) run.done = true;
      return { advanced: true, done: run.done };
    },
    reset() {
      run.i = 0;
      run.done = steps.length === 0;
      run.results = [];
      run.wrongSeen = false;
    },
  };
  return run;
}

export function summarize(run) {
  const total = run.results.length;
  const clean = run.results.filter((r) => r.clean).length;
  const bySection = [];
  const idx = new Map();
  run.results.forEach((r, k) => {
    const section = run.steps[k]?.section || "";
    if (!idx.has(section)) { idx.set(section, bySection.length); bySection.push({ section, total: 0, clean: 0 }); }
    const b = bySection[idx.get(section)];
    b.total += 1;
    if (r.clean) b.clean += 1;
  });
  return { total, clean, accuracy: total ? clean / total : 0, bySection };
}

/* ---- step builders: song material → wait-mode steps -------------------- */

// Chord mode: one step per progression chord, notes = its voicing.
// labelFor is injected (the app passes its display speller) so this module
// stays ignorant of spelling contexts.
export function buildChordSteps(prog, voicings, labelFor) {
  const steps = [];
  for (let i = 0; i < prog.length; i++) {
    const notes = voicings[i] || [];
    if (!notes.length) continue;
    steps.push({ notes: [...notes], label: labelFor ? labelFor(prog[i], i) : null, section: prog[i].section || null });
  }
  return steps;
}

// Tab mode: one step per fingering event (the exact fretted notes).
export function buildTabSteps(events) {
  const steps = [];
  for (const e of events || []) {
    if (!e.notes || !e.notes.length) continue;
    steps.push({ notes: e.notes.map((n) => n.midi), label: null, section: null });
  }
  return steps;
}
