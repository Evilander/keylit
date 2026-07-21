// Pure, deterministic progression suggestions for the Write room.
import { flattenDraft } from "./composition.js";
import {
  dominantOf,
  iiOf,
  insertBeforeChord,
  passingDimBetween,
  suggestionsFor,
} from "./suggest.js";
import {
  buildChord,
  chordSymbol,
  diatonicChord,
  harmonicFunction,
  isDominantQuality,
  parseChord,
  qualClass,
  sameChordSound,
} from "./theory.js";
import { rootPositionUpper, smoothUpper } from "./voicing.js";

const TRANSITION = {
  T: { T: 0.5, S: 2.0, D: 1.5, "?": 0 },
  S: { T: 0.5, S: 0.25, D: 2.5, "?": 0 },
  D: { T: 3.0, S: -1.0, D: 0.25, "?": 0 },
  "?": { T: 1.0, S: 0.5, D: 0.5, "?": 0 },
};

const INTENTS = new Set(["next", "lead-in", "between", "turnaround", "contrast"]);
const BEAM_POOL_LIMIT = 12;
const BEAM_WIDTH = 16;
const BEAM_STEPS = 4;
const CONTRAST_LIMIT = 5;

const pc = (value) => ((Number(value) % 12) + 12) % 12;

function cleanKey(key) {
  return {
    tonic: pc(key?.tonic || 0),
    mode: key?.mode === "minor" ? "minor" : "major",
  };
}

function validChord(chord) {
  return Boolean(chord
    && Number.isFinite(chord.rootSemitone)
    && typeof chord.quality === "string"
    && Array.isArray(chord.intervals)
    && chord.intervals.length);
}

function sourceSymbol(chord) {
  if (!validChord(chord)) return "";
  if (typeof chord.raw === "string" && parseChord(chord.raw)) return chord.raw;
  return chordSymbol(chord);
}

function soundKey(chord) {
  if (!validChord(chord)) return "invalid";
  const intervals = [...new Set(chord.intervals.map((interval) => pc(interval)))].sort((a, b) => a - b);
  const bass = chord.bassSemitone == null ? "-" : pc(chord.bassSemitone);
  return `${pc(chord.rootSemitone)}:${intervals.join(",")}:${bass}`;
}

function pathKey(chords) {
  return chords.map(soundKey).join(">");
}

function samePath(a, b) {
  return a.length === b.length && a.every((chord, index) => sameChordSound(chord, b[index]));
}

function parseableChord(chord) {
  if (!validChord(chord)) return null;
  const symbol = sourceSymbol(chord);
  return parseChord(symbol) ? chord : null;
}

export function paletteForKey(key, options = {}) {
  const normalized = cleanKey(key);
  const sevenths = Boolean(options?.sevenths);
  return Array.from({ length: 7 }, (_, degree) => {
    const chord = diatonicChord(normalized.tonic, normalized.mode, degree, sevenths);
    return {
      degree: degree + 1,
      symbol: chordSymbol(chord),
      chord,
      function: harmonicFunction(chord, normalized.tonic, normalized.mode),
    };
  });
}

function pitchClasses(chord) {
  return new Set(chord.intervals.map((interval) => pc(chord.rootSemitone + interval)));
}

function sharedPitchClasses(a, b) {
  if (!validChord(a) || !validChord(b)) return 0;
  const left = pitchClasses(a);
  const right = pitchClasses(b);
  let shared = 0;
  for (const pitch of left) if (right.has(pitch)) shared++;
  return shared;
}

function subsetsOfSize(values, size) {
  const out = [];
  const walk = (start, chosen) => {
    if (chosen.length === size) {
      out.push(chosen);
      return;
    }
    for (let index = start; index <= values.length - (size - chosen.length); index++) {
      walk(index + 1, [...chosen, values[index]]);
    }
  };
  walk(0, []);
  return out;
}

function alignedVoiceMotion(previousNotes, nextNotes) {
  if (!previousNotes.length || !nextNotes.length) return 0;
  const count = Math.min(previousNotes.length, nextNotes.length);
  const previousChoices = previousNotes.length === count
    ? [previousNotes]
    : subsetsOfSize(previousNotes, count);
  const nextChoices = nextNotes.length === count
    ? [nextNotes]
    : subsetsOfSize(nextNotes, count);
  let best = Infinity;
  for (const previous of previousChoices) {
    for (const next of nextChoices) {
      const motion = previous.reduce((sum, note, index) => sum + Math.abs(note - next[index]), 0);
      if (motion < best) best = motion;
    }
  }
  return Number.isFinite(best) ? best : 0;
}

function voiceLeadingCost(previous, candidate) {
  if (!validChord(previous) || !validChord(candidate)) return 0;
  const previousUpper = rootPositionUpper(previous);
  const candidateUpper = smoothUpper(candidate, previousUpper);
  return alignedVoiceMotion(previousUpper, candidateUpper);
}

function effectiveBass(chord) {
  if (!validChord(chord)) return null;
  return pc(chord.bassSemitone == null ? chord.rootSemitone : chord.bassSemitone);
}

function bassMotion(previous, candidate) {
  const from = effectiveBass(previous);
  const to = effectiveBass(candidate);
  if (from == null || to == null) return 0;
  const distance = Math.abs(from - to);
  return Math.min(distance, 12 - distance);
}

function recentSameSoundCount(candidate, contextChords) {
  return (contextChords || []).filter((chord) => sameChordSound(chord, candidate)).length;
}

function targetPath(candidatePath, target) {
  const path = (candidatePath || []).filter(validChord);
  if (validChord(target) && (!path.length || !sameChordSound(path[path.length - 1], target))) {
    return [...path, target];
  }
  return path;
}

function isAppliedDominant(chord, target) {
  return validChord(chord)
    && validChord(target)
    && isDominantQuality(chord.quality)
    && pc(chord.rootSemitone) === pc(target.rootSemitone + 7);
}

function isIiForTarget(chord, target) {
  if (!validChord(chord) || !validChord(target)) return false;
  const minorTarget = ["min", "dim"].includes(qualClass(target.quality));
  return sameChordSound(chord, iiOf(target.rootSemitone, minorTarget));
}

function hasIiVInto(path, target) {
  const full = targetPath(path, target);
  if (full.length < 3) return false;
  const landing = full[full.length - 1];
  const dominant = full[full.length - 2];
  const supertonic = full[full.length - 3];
  return sameChordSound(landing, target)
    && isIiForTarget(supertonic, target)
    && isAppliedDominant(dominant, target);
}

function isPassingDiminished(chord, left, right) {
  if (!validChord(chord) || !validChord(left) || !validChord(right)) return false;
  const expected = passingDimBetween(left, right);
  return Boolean(expected)
    && pc(chord.rootSemitone) === pc(expected.rootSemitone)
    && qualClass(chord.quality) === "dim";
}

function hasPassingDiminishedInto(path, target) {
  const full = targetPath(path, target);
  if (full.length < 3) return false;
  return isPassingDiminished(
    full[full.length - 2],
    full[full.length - 3],
    full[full.length - 1],
  );
}

function diatonicSounds(key) {
  return [
    ...paletteForKey(key).map((item) => item.chord),
    ...paletteForKey(key, { sevenths: true }).map((item) => item.chord),
  ];
}

function isDiatonicSound(chord, key) {
  return diatonicSounds(key).some((choice) => sameChordSound(choice, chord));
}

function functionalApproach(path, target, key) {
  const full = targetPath(path, target);
  if (full.length < 2) return false;
  const approach = full[full.length - 2];
  const landing = full[full.length - 1];
  if (!sameChordSound(landing, target)
    || !isDiatonicSound(approach, key)
    || !isDiatonicSound(landing, key)) return false;
  const normalized = cleanKey(key);
  const from = harmonicFunction(approach, normalized.tonic, normalized.mode);
  const to = harmonicFunction(landing, normalized.tonic, normalized.mode);
  return (from === "D" && to === "T") || (from === "S" && to === "D");
}

function resolvesToTarget(candidatePath, target, key) {
  if (!validChord(target)) return false;
  const full = targetPath(candidatePath, target);
  if (full.length < 2) return false;
  const approach = full[full.length - 2];
  return isAppliedDominant(approach, target)
    || hasIiVInto(full, target)
    || hasPassingDiminishedInto(full, target)
    || functionalApproach(full, target, key);
}

function cadenceStrength(candidatePath, target, key) {
  if (!validChord(target)) return 0;
  const full = targetPath(candidatePath, target);
  if (hasIiVInto(full, target)) return 3;
  const approach = full[full.length - 2];
  if (isAppliedDominant(approach, target)) return 3;
  if (hasPassingDiminishedInto(full, target)) return 2.25;
  if (!functionalApproach(full, target, key)) return 0;
  const normalized = cleanKey(key);
  const from = harmonicFunction(approach, normalized.tonic, normalized.mode);
  const to = harmonicFunction(target, normalized.tonic, normalized.mode);
  return from === "D" && to === "T" ? 2.5 : 1.5;
}

function metric(value) {
  return String(Number(Number(value).toFixed(8)));
}

export function scoreCandidate({ contextChords = [], candidatePath = [], target = null, key } = {}) {
  const normalized = cleanKey(key);
  const context = contextChords.filter(validChord);
  const candidates = candidatePath.filter(validChord);
  const previous = context[context.length - 1] || null;
  const candidate = candidates[0] || null;
  const previousFn = previous
    ? harmonicFunction(previous, normalized.tonic, normalized.mode)
    : "?";
  const candidateFn = candidate
    ? harmonicFunction(candidate, normalized.tonic, normalized.mode)
    : "?";
  const cadence = cadenceStrength(previous ? [previous, ...candidates] : candidates, target, normalized);
  const voiceCost = voiceLeadingCost(previous, candidate);
  const bassDistance = bassMotion(previous, candidate);
  const terms = {
    functionMotion: candidate ? (TRANSITION[previousFn]?.[candidateFn] ?? 0) : 0,
    commonTones: candidate ? sharedPitchClasses(previous, candidate) * 0.35 : 0,
    cadence: cadence * 1.25,
    voiceLeading: -voiceCost * 0.08,
    bassMotion: -bassDistance * 0.06,
    repetition: candidate ? -recentSameSoundCount(candidate, context) * 1.25 : 0,
    targetResolution: resolvesToTarget(
      previous ? [previous, ...candidates] : candidates,
      target,
      normalized,
    ) ? 4 : 0,
  };
  return {
    score: Object.values(terms).reduce((sum, value) => sum + value, 0),
    terms,
    evidence: [
      `cadence:${metric(cadence)}`,
      `voice-leading:${metric(voiceCost)}`,
      `bass-motion:${metric(bassDistance)}`,
    ],
  };
}

function normalizedProfile(chords, key) {
  const counts = { T: 0, S: 0, D: 0 };
  const normalized = cleanKey(key);
  for (const chord of chords.filter(validChord)) {
    const fn = harmonicFunction(chord, normalized.tonic, normalized.mode);
    if (fn in counts) counts[fn]++;
  }
  const total = counts.T + counts.S + counts.D;
  if (!total) return { T: 0, S: 0, D: 0 };
  return { T: counts.T / total, S: counts.S / total, D: counts.D / total };
}

function borrowedFromMode(chord, key, borrowedMode) {
  const normalized = cleanKey(key);
  if (!["major", "minor"].includes(borrowedMode) || borrowedMode === normalized.mode) return false;
  const borrowedKey = { ...normalized, mode: borrowedMode };
  return isDiatonicSound(chord, borrowedKey) && !isDiatonicSound(chord, normalized);
}

function isRotation(source, seed) {
  if (source.length !== seed.length || source.length < 2) return false;
  for (let shift = 1; shift < source.length; shift++) {
    const rotated = source.map((_, index) => source[(index + shift) % source.length]);
    if (samePath(rotated, seed)) return true;
  }
  return false;
}

function isReversal(source, seed) {
  if (source.length !== seed.length) return false;
  const reversed = [...source].reverse();
  if (samePath(reversed, seed)) return true;
  for (let shift = 1; shift < reversed.length; shift++) {
    const rotated = reversed.map((_, index) => reversed[(index + shift) % reversed.length]);
    if (samePath(rotated, seed)) return true;
  }
  return false;
}

export function contrastEvidence(sourceChords = [], seedChords = [], key) {
  const source = sourceChords.filter(validChord);
  const seed = seedChords.filter(validChord);
  const sourceSounds = new Set(source.map(soundKey));
  const seedSounds = new Set(seed.map(soundKey));
  const union = new Set([...sourceSounds, ...seedSounds]);
  let intersection = 0;
  for (const sound of sourceSounds) if (seedSounds.has(sound)) intersection++;
  const jaccard = union.size ? intersection / union.size : 1;
  const sourceProfile = normalizedProfile(source, key);
  const seedProfile = normalizedProfile(seed, key);
  const profileDistance = ["T", "S", "D"]
    .reduce((sum, fn) => sum + Math.abs(sourceProfile[fn] - seedProfile[fn]), 0);

  let rejectedReason = null;
  if (samePath(source, seed)) rejectedReason = "identity";
  else if (isRotation(source, seed)) rejectedReason = "rotation";
  else if (isReversal(source, seed)) rejectedReason = "reversal";

  const groups = [];
  if (!source.length
    || !seed.length
    || !sameChordSound(source[0], seed[0])
    || harmonicFunction(source[0], cleanKey(key).tonic, cleanKey(key).mode)
      !== harmonicFunction(seed[0], cleanKey(key).tonic, cleanKey(key).mode)) {
    groups.push("opening");
  }
  const hasVerifiedNewColor = seed.some((chord) =>
    !source.some((sourceChord) => sameChordSound(sourceChord, chord))
    && borrowedFromMode(chord, key, cleanKey(key).mode === "major" ? "minor" : "major"));
  if (jaccard <= 0.5 || hasVerifiedNewColor) groups.push("vocabulary");
  if (profileDistance >= 0.5) groups.push("trajectory");

  if (!rejectedReason && groups.length < 2) rejectedReason = "insufficient-contrast";
  return { groups, jaccard, profileDistance, rejectedReason };
}

function sectionContext({ draft, sectionId, chordId, gapIndex } = {}) {
  const key = cleanKey(draft?.key);
  const all = flattenDraft(draft).filter((entry) => entry.sectionId === sectionId && validChord(entry.chord));
  const selectedIndex = all.findIndex((entry) => entry.chordId === chordId);
  const requestedGap = Number.isInteger(gapIndex) ? gapIndex : null;
  const gap = requestedGap == null ? null : Math.max(0, Math.min(requestedGap, all.length));
  return { key, entries: all, chords: all.map((entry) => entry.chord), selectedIndex, gap };
}

function contextForIntent(context, intent) {
  const base = sectionContext(context);
  const { chords, selectedIndex, gap, key } = base;
  if (intent === "lead-in") {
    const targetIndex = selectedIndex >= 0 ? selectedIndex : (gap ?? 0);
    const target = chords[targetIndex] || chords[0] || paletteForKey(key)[0].chord;
    return { ...base, target, previous: chords[targetIndex - 1] || null, contextChords: chords.slice(0, targetIndex) };
  }
  if (intent === "between") {
    const insertion = gap ?? (selectedIndex >= 0 ? selectedIndex : 1);
    const target = chords[insertion] || chords[selectedIndex] || null;
    return {
      ...base,
      target,
      previous: chords[insertion - 1] || null,
      contextChords: chords.slice(0, insertion),
    };
  }
  if (intent === "turnaround") {
    const target = chords[0] || paletteForKey(key)[0].chord;
    return { ...base, target, previous: chords[chords.length - 1] || null, contextChords: chords };
  }
  if (intent === "contrast") {
    return {
      ...base,
      target: null,
      previous: chords[chords.length - 1] || null,
      contextChords: chords,
    };
  }
  const anchorIndex = selectedIndex >= 0
    ? selectedIndex
    : (gap == null ? chords.length - 1 : Math.max(0, gap - 1));
  return {
    ...base,
    target: chords[anchorIndex + 1] || null,
    previous: chords[anchorIndex] || null,
    contextChords: chords.slice(0, anchorIndex + 1),
  };
}

function modeColors(key) {
  const normalized = cleanKey(key);
  const colors = normalized.mode === "major"
    ? [
      { chord: buildChord(normalized.tonic + 5, "m"), style: "pop", boldness: 0.55 },
      { chord: buildChord(normalized.tonic + 8, ""), style: "cinematic", boldness: 0.7 },
      { chord: buildChord(normalized.tonic + 10, ""), style: "rock", boldness: 0.65 },
    ]
    : [
      { chord: buildChord(normalized.tonic, ""), style: "cinematic", boldness: 0.7 },
      { chord: buildChord(normalized.tonic + 5, ""), style: "pop", boldness: 0.55 },
      { chord: buildChord(normalized.tonic + 2, "m"), style: "indie", boldness: 0.6 },
    ];
  return colors.filter(({ chord }) => parseChord(chordSymbol(chord)));
}

function descriptor(chords, options = {}) {
  return {
    chords: chords.filter(parseableChord),
    style: options.style || "any",
    boldness: Number.isFinite(options.boldness) ? options.boldness : 0.5,
  };
}

function descriptorsFromSuggestions(suggestions) {
  return (suggestions || []).map((suggestion) => descriptor(suggestion.chords || [], suggestion));
}

function diatonicDescriptors(key) {
  return [false, true].flatMap((sevenths) =>
    paletteForKey(key, { sevenths }).map((item) => descriptor([item.chord], {
      style: "any",
      boldness: sevenths ? 0.3 : 0.15,
    })));
}

function uniqueDescriptors(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item.chords.length || item.chords.some((chord) => !parseableChord(chord))) continue;
    const key = pathKey(item.chords);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function aroundChord(chord, key) {
  if (!validChord(chord)) return [];
  const normalized = cleanKey(key);
  const groups = suggestionsFor(chord, {
    tonic: normalized.tonic,
    mode: normalized.mode,
    style: "any",
    maxPerKind: 8,
    boldnessBias: 0.5,
  });
  return [groups.replace, groups.insertBefore, groups.insertAfter]
    .flatMap(descriptorsFromSuggestions);
}

function regularCandidates(intent, resolved) {
  const { key, previous, target } = resolved;
  const colors = modeColors(key).map((item) => descriptor([item.chord], item));
  const diatonic = diatonicDescriptors(key);
  if (intent === "lead-in" || intent === "turnaround") {
    const approaches = descriptorsFromSuggestions(insertBeforeChord(target, key));
    return uniqueDescriptors([
      ...approaches,
      ...aroundChord(target, key),
      ...diatonic,
      ...colors,
    ]);
  }
  if (intent === "between") {
    const passing = validChord(previous) && validChord(target)
      ? passingDimBetween(previous, target)
      : null;
    return uniqueDescriptors([
      ...(passing ? [descriptor([passing], { style: "jazz", boldness: 0.45 })] : []),
      ...descriptorsFromSuggestions(validChord(target) ? insertBeforeChord(target, key) : []),
      ...aroundChord(previous, key),
      ...aroundChord(target, key),
      ...diatonic,
      ...colors,
    ]);
  }
  return uniqueDescriptors([
    ...aroundChord(previous, key),
    ...aroundChord(target, key),
    ...diatonic,
    ...colors,
  ]);
}

function partialContrastScore(path, source, key) {
  const candidate = path[path.length - 1];
  const previous = path[path.length - 2] || source[source.length - 1] || null;
  const normalized = cleanKey(key);
  const from = previous ? harmonicFunction(previous, normalized.tonic, normalized.mode) : "?";
  const to = harmonicFunction(candidate, normalized.tonic, normalized.mode);
  const transition = TRANSITION[from]?.[to] ?? 0;
  const novel = source.some((chord) => sameChordSound(chord, candidate)) ? 0 : 1.5;
  const repeated = path.slice(0, -1).some((chord) => sameChordSound(chord, candidate)) ? -1.25 : 0;
  return transition + novel + repeated;
}

function contrastSeeds(source, key) {
  const pool = uniqueDescriptors([
    ...diatonicDescriptors(key).filter((_, index) => index < 7),
    ...modeColors(key).map((item) => descriptor([item.chord], item)),
    ...diatonicDescriptors(key).filter((_, index) => index >= 7),
  ])
    .map((item) => item.chords[0])
    .slice(0, BEAM_POOL_LIMIT);
  let beam = [{ path: [], rank: 0 }];
  for (let step = 0; step < BEAM_STEPS; step++) {
    const expanded = [];
    for (const state of beam) {
      for (const chord of pool) {
        if (state.path.length && sameChordSound(state.path[state.path.length - 1], chord)) continue;
        const path = [...state.path, chord];
        expanded.push({ path, rank: state.rank + partialContrastScore(path, source, key) });
      }
    }
    const unique = new Map();
    for (const state of expanded) {
      const keyForPath = pathKey(state.path);
      const current = unique.get(keyForPath);
      if (!current || state.rank > current.rank) unique.set(keyForPath, state);
    }
    beam = [...unique.values()]
      .sort((a, b) => b.rank - a.rank || pathKey(a.path).localeCompare(pathKey(b.path)))
      .slice(0, BEAM_WIDTH);
  }
  return beam
    .map((state) => ({ ...state, contrast: contrastEvidence(source, state.path, key) }))
    .filter((state) => !state.contrast.rejectedReason && state.contrast.groups.length >= 2)
    .sort((a, b) => b.contrast.groups.length - a.contrast.groups.length
      || b.contrast.profileDistance - a.contrast.profileDistance
      || a.contrast.jaccard - b.contrast.jaccard
      || b.rank - a.rank
      || pathKey(a.path).localeCompare(pathKey(b.path)))
    .slice(0, CONTRAST_LIMIT)
    .map((state) => descriptor(state.path, { style: "any", boldness: 0.7 }));
}

function sequenceForFunction(intent, chords, resolved) {
  const addUnlessSame = (sequence, chord) => {
    if (validChord(chord) && (!sequence.length || !sameChordSound(sequence[sequence.length - 1], chord))) {
      sequence.push(chord);
    }
  };
  const sequence = [];
  if (intent === "next" || intent === "between") addUnlessSame(sequence, resolved.previous);
  chords.forEach((chord) => addUnlessSame(sequence, chord));
  if (["next", "lead-in", "between", "turnaround"].includes(intent)) {
    addUnlessSame(sequence, resolved.target);
  }
  return sequence;
}

function functionEvidence(intent, chords, resolved) {
  const { key } = resolved;
  const path = sequenceForFunction(intent, chords, resolved)
    .map((chord) => harmonicFunction(chord, key.tonic, key.mode));
  return path.length ? `function:${path.join(">")}` : null;
}

function namedEvidence(intent, chords, resolved) {
  const evidence = [];
  const { key, previous, target } = resolved;
  const namedPath = validChord(previous) ? [previous, ...chords] : [...chords];
  if (validChord(target)) {
    if (hasIiVInto(namedPath, target)) evidence.push(`ii-V:${sourceSymbol(target)}`);
    const landingPath = targetPath(namedPath, target);
    const approach = landingPath[landingPath.length - 2];
    if (isAppliedDominant(approach, target)) {
      evidence.push(`secondary-dominant:${sourceSymbol(target)}`);
    }
    const diminished = chords.find((chord) => isPassingDiminished(chord, previous, target));
    if (diminished) {
      evidence.push(`passing-diminished:${sourceSymbol(previous)}:${sourceSymbol(target)}`);
    }
  }
  const parallelMode = key.mode === "major" ? "minor" : "major";
  if (chords.some((chord) => borrowedFromMode(chord, key, parallelMode))) {
    evidence.push(`modal-borrowing:${parallelMode}`);
  }
  if ((intent === "lead-in" || intent === "turnaround") && validChord(target)) {
    evidence.push(`target:${sourceSymbol(target)}`);
  }
  return evidence;
}

function whyFromEvidence(symbols, evidence) {
  const iiV = evidence.find((flag) => flag.startsWith("ii-V:"));
  if (iiV) {
    const target = iiV.slice("ii-V:".length);
    return `${symbols.join("–")} pulls into ${target} through its verified ii–V; ranking also checks voice leading and bass motion.`;
  }
  const dominant = evidence.find((flag) => flag.startsWith("secondary-dominant:"));
  if (dominant) {
    const target = dominant.slice("secondary-dominant:".length);
    return `${symbols.join("–")} contains the verified applied dominant of ${target}; ranking also checks voice leading and bass motion.`;
  }
  const passing = evidence.find((flag) => flag.startsWith("passing-diminished:"));
  if (passing) {
    const [, left, right] = passing.split(":");
    return `${symbols.join("–")} is the verified diminished passing step from ${left} to ${right}, ranked with measured voice leading.`;
  }
  const borrowing = evidence.find((flag) => flag.startsWith("modal-borrowing:"));
  if (borrowing) {
    const mode = borrowing.slice("modal-borrowing:".length);
    return `${symbols.join("–")} is verified vocabulary from the parallel ${mode}, ranked with measured voice leading and bass motion.`;
  }
  const contrasts = evidence
    .filter((flag) => flag.startsWith("contrast:"))
    .map((flag) => flag.slice("contrast:".length));
  if (contrasts.length) {
    return `${symbols.join("–")} changes the section through verified ${contrasts.join(" and ")} contrast, with deterministic motion scoring.`;
  }
  const fn = evidence.find((flag) => flag.startsWith("function:"));
  const path = fn ? fn.slice("function:".length) : "?";
  return `${symbols.join("–")} follows the verified ${path} function path, ranked by measured cadence, voice leading, and bass motion.`;
}

function kindForIntent(intent) {
  if (intent === "next" || intent === "turnaround") return "insertAfter";
  if (intent === "contrast") return "newSection";
  return "insertBefore";
}

function makeItem(intent, candidate, resolved, context) {
  const chords = candidate.chords.filter(validChord);
  const symbols = chords.map(chordSymbol);
  const scored = scoreCandidate({
    contextChords: resolved.contextChords,
    candidatePath: chords,
    target: resolved.target,
    key: resolved.key,
  });
  const evidence = [...scored.evidence];
  const fn = functionEvidence(intent, chords, resolved);
  if (fn) evidence.push(fn);
  evidence.push(...namedEvidence(intent, chords, resolved));
  if (intent === "contrast") {
    const contrast = contrastEvidence(resolved.chords, chords, resolved.key);
    evidence.push(...contrast.groups.map((group) => `contrast:${group}`));
  }
  const uniqueEvidence = [...new Set(evidence)];
  const item = {
    id: `offline:${intent}:${pathKey(chords)}`,
    intent,
    kind: kindForIntent(intent),
    symbols,
    chords,
    why: whyFromEvidence(symbols, uniqueEvidence),
    evidence: uniqueEvidence,
    score: scored.score,
    source: "offline",
  };
  return validateSuggestionEvidence(item, context).ok ? item : null;
}

function evidenceTarget(flag) {
  const separator = flag.indexOf(":");
  return separator < 0 ? null : parseChord(flag.slice(separator + 1));
}

function pathForNamedTarget(chords, target) {
  return targetPath(chords, target);
}

function scoreInputsForSuggestion(suggestion, context) {
  const intent = INTENTS.has(suggestion?.intent) ? suggestion.intent : "next";
  const resolved = contextForIntent(context, intent);
  const chords = suggestionChords(suggestion);
  return { intent, resolved, chords };
}

function suggestionChords(suggestion) {
  if (Array.isArray(suggestion?.chords) && suggestion.chords.every(validChord)) {
    return suggestion.chords;
  }
  if (Array.isArray(suggestion?.symbols)) return suggestion.symbols.map(parseChord).filter(Boolean);
  return [];
}

function functionsForSuggestion(suggestion, resolved, chords) {
  const sequence = INTENTS.has(suggestion?.intent)
    ? sequenceForFunction(suggestion.intent, chords, resolved)
    : chords;
  return sequence
    .map((chord) => harmonicFunction(chord, resolved.key.tonic, resolved.key.mode))
    .join(">");
}

export function validateSuggestionEvidence(suggestion, context = {}) {
  const errors = [];
  const { intent, resolved, chords } = scoreInputsForSuggestion(suggestion, context);
  const symbols = Array.isArray(suggestion?.symbols) ? suggestion.symbols : [];
  if (!chords.length) errors.push("suggestion needs parseable chords");
  if (symbols.length && (symbols.length !== chords.length
    || symbols.some((symbol, index) => {
      const parsed = parseChord(symbol);
      return !parsed || !sameChordSound(parsed, chords[index]);
    }))) {
    errors.push("symbols do not match chords");
  }
  if (!Array.isArray(suggestion?.evidence) || !suggestion.evidence.length) {
    errors.push("suggestion needs evidence");
    return { ok: false, errors };
  }

  const scored = scoreCandidate({
    contextChords: resolved.contextChords,
    candidatePath: chords,
    target: resolved.target,
    key: resolved.key,
  });
  const machineEvidence = new Set(scored.evidence);
  const source = resolved.chords;
  const contrast = intent === "contrast" ? contrastEvidence(source, chords, resolved.key) : null;

  for (const flag of suggestion.evidence) {
    if (/^(cadence|voice-leading|bass-motion):/.test(flag)) {
      if (!machineEvidence.has(flag)) errors.push(`unverified ${flag}`);
      continue;
    }
    if (flag.startsWith("target:")) {
      const target = evidenceTarget(flag);
      const suggestedDestination = chords[chords.length - 1] || null;
      const present = validChord(target)
        && ((validChord(suggestedDestination) && sameChordSound(suggestedDestination, target))
          || (validChord(resolved.target) && sameChordSound(resolved.target, target)));
      if (!present) errors.push(`unverified ${flag}`);
      continue;
    }
    if (flag.startsWith("secondary-dominant:")) {
      const target = evidenceTarget(flag);
      const path = pathForNamedTarget(chords, target);
      const approach = path[path.length - 2];
      if (!isAppliedDominant(approach, target)) errors.push(`unverified ${flag}`);
      continue;
    }
    if (flag.startsWith("ii-V:")) {
      const target = evidenceTarget(flag);
      if (!hasIiVInto(chords, target)) errors.push(`unverified ${flag}`);
      continue;
    }
    if (flag.startsWith("modal-borrowing:")) {
      const mode = flag.slice("modal-borrowing:".length);
      if (!chords.some((chord) => borrowedFromMode(chord, resolved.key, mode))) {
        errors.push(`unverified ${flag}`);
      }
      continue;
    }
    if (flag.startsWith("passing-diminished:")) {
      const parts = flag.split(":");
      const left = parseChord(parts[1] || "");
      const right = parseChord(parts[2] || "");
      if (!left || !right || !chords.some((chord) => isPassingDiminished(chord, left, right))) {
        errors.push(`unverified ${flag}`);
      }
      continue;
    }
    if (flag.startsWith("function:")) {
      const expected = flag.slice("function:".length);
      if (functionsForSuggestion(suggestion, resolved, chords) !== expected) {
        errors.push(`unverified ${flag}`);
      }
      continue;
    }
    if (flag.startsWith("contrast:")) {
      const group = flag.slice("contrast:".length);
      if (!contrast || contrast.rejectedReason || !contrast.groups.includes(group)) {
        errors.push(`unverified ${flag}`);
      }
      continue;
    }
    errors.push(`unknown evidence ${flag}`);
  }

  if (Number.isFinite(suggestion?.score) && Math.abs(suggestion.score - scored.score) > 1e-8) {
    errors.push("score does not match evidence");
  }
  return { ok: errors.length === 0, errors };
}

export function suggestForIntent({
  intent,
  draft,
  sectionId,
  chordId,
  gapIndex,
  style = "any",
  boldness = 0.5,
} = {}) {
  if (!INTENTS.has(intent)) return [];
  const context = { draft, sectionId, chordId, gapIndex };
  const resolved = contextForIntent(context, intent);
  const requestedStyle = typeof style === "string" ? style : "any";
  const boldnessBias = Math.max(0, Math.min(1, Number.isFinite(boldness) ? boldness : 0.5));
  const candidates = intent === "contrast"
    ? contrastSeeds(resolved.chords, resolved.key)
    : regularCandidates(intent, resolved);
  return candidates
    .filter((candidate) => requestedStyle === "any"
      || candidate.style === "any"
      || candidate.style === requestedStyle)
    .map((candidate) => ({
      candidate,
      item: makeItem(intent, candidate, resolved, context),
      biasDistance: Math.abs(candidate.boldness - boldnessBias),
    }))
    .filter(({ item }) => item)
    .sort((a, b) => b.item.score - a.item.score
      || a.biasDistance - b.biasDistance
      || a.item.id.localeCompare(b.item.id))
    .slice(0, intent === "contrast" ? CONTRAST_LIMIT : 6)
    .map(({ item }) => item);
}
