// tunings.js — editorial reference data for alternate guitar tunings.
//
// This file is PURE CONTENT: names, note spellings (as text), family, lore, and
// cited artist/song usage. It owns no audio or MIDI logic and is safe to import
// anywhere (UI copy, tooltips, a tunings browser, etc.).
//
// The actual playable engine — the MIDI note arrays the keyboard/voicing code
// uses to render or audition a tuning — lives in `src/lib/tuning.js`, keyed by
// the same `id` used here. If you add an entry to TUNINGS_REFERENCE, add the
// matching MIDI array there too (or the entry is reference-only/decorative).
//
// Sourcing notes (read before trusting a claim blindly):
// - Every entry was checked against at least one independent source (artist
//   interview, an artist's own official site, a guitar-publication explainer,
//   or a community tuning database cross-checked against a second source).
//   Fan-submitted tab sites (Ultimate-Guitar, gtdb.org, pavetabs, etc.) are the
//   best evidence available for some songs — they are flagged as such in the
//   `description` where the attribution is contested or thin.
// - `CGCGCD` and `openCsus2` are, intentionally, the exact same six notes
//   (C G C G C D) — they're kept as separate entries because they come from
//   different lineages (English-folk "C Modal" vs. the modern "Open C" family)
//   and the engine's canonical id list calls for both. Same story for
//   `doubleDropD` and `DADGBD`: identical notes, split to carry two different
//   artist lineages (rock vs. Nick Drake/Elliott Smith).
//
// Last verified: 2026-06-30.

export const TUNINGS_REFERENCE = [
  // ---------------------------------------------------------------------
  // Canonical baseline + drop tunings
  // ---------------------------------------------------------------------
  {
    id: "standard",
    name: "Standard",
    strings: "E A D G B E",
    intervalsFromStandard: "EADGBE → EADGBE",
    family: "standard",
    description:
      "The default. Everything else in this file is a deliberate departure from it. Nick Drake actually played most of his best-known songs — \"River Man,\" \"Time Has Told Me,\" \"Day Is Done\" — in plain standard tuning, despite his reputation as an alternate-tuning obsessive.",
    artists: [
      { name: "Nick Drake", songs: ["River Man", "Time Has Told Me", "Day Is Done", "Things Behind the Sun"] },
    ],
    sources: ["https://nickhealey.com/chndtabs/tunings.htm"],
  },
  {
    id: "dropD",
    name: "Drop D",
    strings: "D A D G B E",
    intervalsFromStandard: "EADGBE → DADGBE",
    family: "drop",
    description:
      "Only the low E drops a whole step to D, turning the bottom string into a one-finger power-chord/drone root while the rest of the neck stays familiar. The gateway alternate tuning — cheap to learn, huge payoff for riffs and droning fingerstyle alike.",
    artists: [
      { name: "The Beatles", songs: ["Dear Prudence"] },
      { name: "Soundgarden", songs: ["Black Hole Sun", "Outshined"] },
      { name: "Pavement", songs: ["Brain Gallop", "Senator", "Spazz"] },
    ],
    sources: [
      "https://www.ethanhein.com/wp/2020/dear-prudence/",
      "https://bravewords.com/news/soundgarden-guitarist-kim-thayil-talks-riffs-gear-and-tuning-heavy-metal-and-drop-d-is-a-match-made-in-heaven-it-just-works",
      "https://sites.google.com/site/pavetabs/home/tunings",
    ],
  },
  {
    id: "doubleDropD",
    name: "Double Drop D",
    strings: "D A D G B D",
    intervalsFromStandard: "EADGBE → DADGBD",
    family: "drop",
    description:
      "Drop D plus the high E also dropped a whole step to D, so a fifth (D–A) is fretable with one finger on both the bass and treble side at once. Neil Young calls it \"D modal\" and is its best-known practitioner.",
    artists: [
      { name: "Neil Young", songs: ["Cinnamon Girl", "Cortez the Killer", "The Loner", "Ohio"] },
      { name: "Crosby, Stills, Nash & Young", songs: ["Find the Cost of Freedom"] },
    ],
    sources: ["https://acousticguitar.com/explore-double-dropped-d/"],
  },
  {
    id: "dropC",
    name: "Drop C",
    strings: "C G C F A D",
    intervalsFromStandard: "EADGBE → CGCFAD",
    family: "drop",
    description:
      "Drop D, transposed down a further whole step — a whole-step-down Drop D shape, basically. The heavy-riff workhorse of nu-metal/alt-metal: thick and crisp at once because most riffs sit on the top two strings while the dropped low string carries the chug.",
    artists: [
      { name: "System of a Down", songs: ["Chop Suey!", "Toxicity"] },
      { name: "Deftones", songs: ["Digital Bath", "Change (In the House of Flies)"] },
    ],
    sources: [
      "https://www.fatpick.com/songs/system-of-a-down-chop-suey-i12xy/tabs/106-strings",
      "https://www.electrikjam.com/deftones-songs-in-drop-d-a-complete-list/",
    ],
  },
  {
    id: "dropCsharp",
    name: "Drop C#",
    strings: "C# G# C# F# A# D#",
    intervalsFromStandard: "EADGBE → C#G#C#F#A#D#",
    family: "drop",
    description:
      "Exactly halfway between Drop D and Drop C — heavier than Drop D, looser-feeling than Drop C. System of a Down moved most of Mezmerize/Hypnotize here after writing Toxicity-era material in plain Drop C.",
    artists: [
      { name: "Alice in Chains", songs: ["Them Bones"] },
      { name: "System of a Down", songs: ["B.Y.O.B."] },
    ],
    sources: ["https://www.tunedstrings.com/tutorials/drop-c-sharp-guitar-tuning"],
  },

  // ---------------------------------------------------------------------
  // Open tunings
  // ---------------------------------------------------------------------
  {
    id: "openD",
    name: "Open D",
    strings: "D A D F# A D",
    intervalsFromStandard: "EADGBE → DADF#AD",
    family: "open",
    description:
      "Strum it open and you get a full D major chord — bar straight across any fret for an instant major chord anywhere on the neck. A blues/slide and singer-songwriter staple; Stephen Malkmus used it constantly across early Pavement.",
    artists: [
      { name: "The Black Crowes", songs: ["She Talks to Angels"] },
      { name: "Joni Mitchell", songs: ["Big Yellow Taxi (capo'd variant)"] },
      { name: "Pavement", songs: ["(Do Not Feed The) Oyster", "Houston Hades"] },
    ],
    sources: [
      "https://littlecornerofamusiclover.com/open-d-tuning-songs/",
      "https://sites.google.com/site/pavetabs/home/tunings",
    ],
  },
  {
    id: "openE",
    name: "Open E",
    strings: "E B E G# B E",
    intervalsFromStandard: "EADGBE → EBEG#BE",
    family: "open",
    description:
      "Open D raised a whole step — same shape, brighter and tenser. The definitive slide-guitar tuning for Southern blues-rock; Joni Mitchell reaches the same pitch safely by tuning to Open D and capoing the 2nd fret rather than cranking three strings up from concert pitch.",
    capoNote: "Capo 2 on Open D reaches Open E pitch without over-tensioning the top strings (Joni Mitchell's preferred method for \"Big Yellow Taxi\" and \"Both Sides, Now\").",
    artists: [
      { name: "Duane Allman", songs: ["Statesboro Blues"] },
      { name: "Derek Trucks", songs: ["Midnight in Harlem"] },
      { name: "Joni Mitchell", songs: ["Big Yellow Taxi"] },
    ],
    sources: [
      "https://en.wikipedia.org/wiki/Open_E_tuning",
      "https://jonimitchell.com/music/transcription.cfm?id=250",
    ],
  },
  {
    id: "openG",
    name: "Open G",
    strings: "D G D G B D",
    intervalsFromStandard: "EADGBE → DGDGBD",
    family: "open",
    description:
      "Open G strummed bare gives a full G major chord. Keith Richards' signature tuning, usually played on a 5-string guitar with the low string removed entirely so the open G becomes the lowest note — \"five strings, three notes, two fingers and one asshole,\" as he puts it.",
    artists: [
      { name: "Keith Richards / The Rolling Stones", songs: ["Start Me Up", "Brown Sugar", "Honky Tonk Women"] },
      { name: "Joni Mitchell", songs: ["Marcie", "Nathan La Franeer"] },
    ],
    sources: [
      "https://www.fundamental-changes.com/how-keith-richards-plays-in-open-g-tuning/",
      "https://jonimitchell.com/music/tuningpatterns.cfm",
    ],
  },
  {
    id: "openA",
    name: "Open A",
    strings: "E A E A C# E",
    intervalsFromStandard: "EADGBE → EAEAC#E",
    family: "open",
    description:
      "Open G raised a whole step (same shape, two frets up in pitch-feel terms): strings 4, 3, and 2 each go up a whole step, 1/5/6 stay put. Favored for slide because barring any fret gives a clean major triad.",
    artists: [
      { name: "Jimmy Page", songs: ["In My Time of Dying"] },
      { name: "Jack White / The White Stripes", songs: ["Seven Nation Army"] },
    ],
    sources: ["https://www.guitarplayer.com/news/jack-white-seven-nation-army-origins"],
  },
  {
    id: "openC",
    name: "Open C",
    strings: "C G C G C E",
    intervalsFromStandard: "EADGBE → CGCGCE",
    family: "open",
    description:
      "A full C major chord rings out on the open strings, with the bass dropped a full fourth below standard for extra low-end weight. The deep-C low string makes it a favorite for drop-tuned heavier playing as well as ambient fingerstyle.",
    artists: [{ name: "Devin Townsend", songs: ["solo/Strapping Young Lad material"] }],
    sources: ["https://en.wikipedia.org/wiki/List_of_guitar_tunings"],
  },
  {
    id: "openCsus2",
    name: "Open C sus2",
    strings: "C G C G C D",
    intervalsFromStandard: "EADGBE → CGCGCD",
    family: "open",
    description:
      "Open C with the major 3rd (E) swapped for a major 2nd (D) — the same six notes as the \"C Modal\" / CGCGCD entry below, just reached via the Open C family rather than the English-folk lineage. Strumming it open gives an unresolved, ambient Csus2 rather than a settled major triad — no chord ever quite \"lands.\"",
    artists: [{ name: "Ani DiFranco", songs: ["Falling Is Like This"] }],
    sources: ["https://www.guitar-chord.org/articles/cgdgcd-tuning.html"],
  },

  // ---------------------------------------------------------------------
  // Modal / suspended tunings
  // ---------------------------------------------------------------------
  {
    id: "DADGAD",
    name: "DADGAD",
    strings: "D A D G A D",
    intervalsFromStandard: "EADGBE → DADGAD",
    family: "modal",
    description:
      "Davey Graham's invention (by way of hearing an oud player in Morocco): an ambiguous Dsus4, neither major nor minor, that rings with droning open strings under almost any fretted shape. Jimmy Page confirmed directly (in It Might Get Loud) that \"Kashmir\" came from noodling in this tuning; Mark Kozelek leans on it constantly for Sun Kil Moon's fingerpicked songs.",
    capoNote: "Sun Kil Moon's \"Carry Me Ohio\" is DADGAD with a capo on the 4th fret; \"Garden of Lavender\" is DADGAD with no capo.",
    artists: [
      { name: "Jimmy Page / Led Zeppelin", songs: ["Kashmir", "Black Mountain Side"] },
      { name: "Pierre Bensusan", songs: ["DADGAD repertoire generally"] },
      { name: "Mark Kozelek / Sun Kil Moon", songs: ["Carry Me Ohio", "Garden of Lavender"] },
      { name: "Pavement", songs: ["Black Book"] },
    ],
    sources: [
      "https://www.guitarplayer.com/players/watch-jimmy-pages-kashmir-acoustic-demonstration",
      "https://tabs.ultimate-guitar.com/tab/sun-kil-moon/carry-me-ohio-tabs-1071040",
      "https://sites.google.com/site/pavetabs/home/tunings",
    ],
  },
  {
    id: "CGCGCD",
    name: "C Modal",
    strings: "C G C G C D",
    intervalsFromStandard: "EADGBE → CGCGCD",
    family: "modal",
    description:
      "The English-folk cousin of DADGAD: three strings on the root (C), two on the fifth (G), one odd string out on the 2nd (D) instead of DADGAD's 4th. Nic Jones popularized it on Penguin Eggs; he and Martin Carthy both built fingerstyle vocabularies around its \"harp interval\" ringing fifths. Physically identical to the Open C sus2 entry above.",
    artists: [
      { name: "Nic Jones", songs: ["Canadee-I-O"] },
      { name: "Ani DiFranco", songs: ["Falling Is Like This"] },
    ],
    sources: [
      "https://frettingphysicist.wordpress.com/2017/04/08/deriving-nic-jones-open-c-tuning/",
      "https://gtdb.org/cgcgcd/artists/nic-jones/61/tab/185",
    ],
  },
  {
    id: "DADGBD",
    name: "D A D G B D (Bryter Layter tuning)",
    strings: "D A D G B D",
    intervalsFromStandard: "EADGBE → DADGBD",
    family: "drop",
    description:
      "Note-for-note the same tuning as Double Drop D above — kept as its own entry because the use case is different: this is the spelling under which it shows up in Nick Drake's and Elliott Smith's singer-songwriter catalogs rather than Neil Young's rock one.",
    artists: [
      { name: "Nick Drake", songs: ["Bryter Layter"] },
      { name: "Elliott Smith", songs: ["Satellite"] },
    ],
    sources: ["https://boblit.co.uk/chords/nickdrake_tunings.html"],
  },
  {
    id: "EADEAE",
    name: "Pipe Tuning",
    strings: "E A D E A E",
    intervalsFromStandard: "EADGBE → EADEAE",
    family: "modal",
    description:
      "English folk guitarist Martin Carthy built this by taking DADGAD, dropping it a fourth and shifting it over a string (\"DADEAE… then I dropped the bottom E to D and put an E on top\"). He calls it the \"A tuning\" since the open A string reads as the tonic; Davey Graham and John Renbourn both picked it up from him and called it \"pipe tuning.\" The same six notes resurfaced decades later, independently rediscovered, in the midwest-emo/math-rock scene.",
    artists: [
      { name: "Martin Carthy", songs: ["traditional Irish/English tune sets, e.g. \"The Banks of the Bann\""] },
      { name: "Tiny Moving Parts", songs: ["various — guitarist Dylan Mattheisen cites this family of tunings as a formative influence"] },
    ],
    sources: [
      "https://carthyonline.wordpress.com/interviews/1992-acoustic-guitar-magazine/",
      "https://www.pegheadnation.com/string-school/courses/alternate-tunings-fingerstyle-guitar/eadeae-tuning-part-1-chords/",
    ],
  },

  // ---------------------------------------------------------------------
  // Nick Drake's other catalog tunings
  // ---------------------------------------------------------------------
  {
    id: "nickDrakeOpenCadd4",
    name: "Open C add4 (Nick Drake)",
    strings: "C G C F C E",
    intervalsFromStandard: "EADGBE → CGCFCE",
    family: "open",
    description:
      "Drake's most-used alternate tuning — the bed for most of Pink Moon. An open C chord with a 4th (F) folded in, giving the close, woody, slightly unresolved fingerpicked sound that defines the album.",
    artists: [
      { name: "Nick Drake", songs: ["Pink Moon", "Hazey Jane I", "Hazey Jane II", "Introduction", "Which Will", "Parasite", "Hanging on a Star"] },
    ],
    sources: ["https://boblit.co.uk/chords/nickdrake_tunings.html", "https://nickhealey.com/chndtabs/tunings.htm"],
  },
  {
    id: "nickDrakeOpenE5",
    name: "Open E5 (Nick Drake)",
    strings: "B E B E B E",
    intervalsFromStandard: "EADGBE → BEBEBE",
    family: "modal",
    description:
      "A power-chord-like E5 with no 3rd anywhere — three doubled E's around a low B. Gives the open, droning, major-or-minor-ambiguous bed under several of Drake's most covered songs.",
    artists: [
      { name: "Nick Drake", songs: ["Northern Sky", "Fly", "From the Morning", "At the Chime of a City Clock", "Man in a Shed"] },
    ],
    sources: ["https://boblit.co.uk/chords/nickdrake_tunings.html", "https://nickhealey.com/chndtabs/tunings.htm"],
  },
  {
    id: "nickDrakeLute",
    name: "Lute Tuning (Nick Drake)",
    strings: "E A D F# B E",
    intervalsFromStandard: "EADGBE → EADF#BE",
    family: "modal",
    description:
      "Drake's own term for it (per catalogers of his tunings) — named for its resemblance to a lute/renaissance-guitar string relationship. Used for two of his most orchestrally arranged songs.",
    artists: [{ name: "Nick Drake", songs: ["Cello Song", "Thoughts of Mary Jane"] }],
    sources: ["https://boblit.co.uk/chords/nickdrake_tunings.html"],
  },
  {
    id: "nickDrakePlaceToBe",
    name: "C G C F G E (Place to Be)",
    strings: "C G C F G E",
    intervalsFromStandard: "EADGBE → CGCFGE",
    family: "open",
    description:
      "A one-song tuning, built for the opening track of Pink Moon — close kin to the Open C add4 tuning above but with the 5th (G) restored on the 3rd string instead of doubling the root.",
    artists: [{ name: "Nick Drake", songs: ["Place to Be"] }],
    sources: ["https://boblit.co.uk/chords/nickdrake_tunings.html", "https://nickhealey.com/chndtabs/tunings.htm"],
  },
  {
    id: "nickDrakeThreeHours",
    name: "B B D G B E (Three Hours)",
    strings: "B B D G B E",
    intervalsFromStandard: "EADGBE → BBDGBE",
    family: "modal",
    description:
      "An irregular, modal cluster tuning (doubled B's under a fretted-standard-ish top) built for two of Drake's most fingerpicking-intensive, hypnotic tracks.",
    artists: [{ name: "Nick Drake", songs: ["Three Hours", "Fruit Tree"] }],
    sources: ["https://boblit.co.uk/chords/nickdrake_tunings.html"],
  },
  {
    id: "nickDrakeBlackEyedDog",
    name: "G G D G B D (Black Eyed Dog)",
    strings: "G G D G B D",
    intervalsFromStandard: "EADGBE → GGDGBD",
    family: "open",
    description:
      "A doubled-G open-G-family tuning that carries some of Drake's bleakest late recordings, including the song widely read as his last.",
    artists: [{ name: "Nick Drake", songs: ["Black Eyed Dog", "Rider on the Wheel", "Tow the Line"] }],
    sources: ["https://nickhealey.com/chndtabs/tunings.htm"],
  },

  // ---------------------------------------------------------------------
  // Mark Kozelek / Sun Kil Moon / Red House Painters
  // ---------------------------------------------------------------------
  {
    id: "kozelekDADEBCsharp",
    name: "D A D E B C# (Kozelek signature)",
    strings: "D A D E B C#",
    intervalsFromStandard: "EADGBE → DADEBC#",
    family: "modal",
    description:
      "Mark Kozelek's other go-to alongside DADGAD: a Dsus2/Dmaj9(add6)-type cluster with no 3rd in the open strings, built for dreamy, suspended, almost Lydian-sounding fingerpicking. Per Kozelek's own habit (noted by tabbers), he often detunes a full step first, then retunes into this shape — so capo positions you see on tabs vary song to song.",
    artists: [
      { name: "Mark Kozelek / Sun Kil Moon", songs: ["Trucker's Atlas", "Katy Song", "Moorestown"] },
    ],
    sources: ["https://gtdb.org/dadebcs"],
  },

  // ---------------------------------------------------------------------
  // Pavement / Stephen Malkmus
  // ---------------------------------------------------------------------
  {
    id: "pavementDADABE",
    name: "D A D A B E (Malkmus signature)",
    strings: "D A D A B E",
    intervalsFromStandard: "EADGBE → DADABE",
    family: "modal",
    description:
      "Stephen Malkmus's most-used tuning by a wide margin (documented across roughly 70 Pavement/Jicks songs by fan tabbers cross-referencing bootlegs and studio recordings) — an irregular cluster rather than a clean open chord, well-suited to his loose, off-kilter chord voicings.",
    artists: [
      { name: "Pavement", songs: ["Gold Soundz", "AT&T", "All My Friends"] },
    ],
    sources: ["https://sites.google.com/site/pavetabs/home/tunings"],
  },
  {
    id: "pavementCGDABE",
    name: "C G D A B E (Cut Your Hair tuning)",
    strings: "C G D A B E",
    intervalsFromStandard: "EADGBE → CGDABE",
    family: "modal",
    description:
      "The low strings dropped into a C-G-D stack (fifths) under a near-standard top end — the tuning behind Pavement's breakout single.",
    artists: [
      { name: "Pavement", songs: ["Cut Your Hair", "Dark Ages", "Fillmore Jive"] },
    ],
    sources: ["https://sites.google.com/site/pavetabs/home/tunings"],
  },
  {
    id: "pavementCGDGBE",
    name: "C G D G B E",
    strings: "C G D G B E",
    intervalsFromStandard: "EADGBE → CGDGBE",
    family: "modal",
    description:
      "Documented across the largest single block of the Pavement/Jicks catalog (100+ songs per fan-tab cataloging) — close enough to standard on top that it reads as \"detuned standard\" rather than a true open chord.",
    artists: [
      { name: "Pavement", songs: ["Elevate Me Later", "In the Mouth a Desert", "Zurich Is Stained"] },
    ],
    sources: ["https://sites.google.com/site/pavetabs/home/tunings"],
  },

  // ---------------------------------------------------------------------
  // Kurt Vile
  // ---------------------------------------------------------------------
  {
    id: "halfStepDown",
    name: "Half-Step Down (Eb Standard)",
    strings: "Eb Ab Db Gb Bb Eb",
    intervalsFromStandard: "EADGBE → EbAbDbGbBbEb",
    family: "standard",
    description:
      "Every string down one semitone — same fingerings and intervals as standard, just looser and a half-step lower in pitch. Classic-rock and blues-rock staple (Hendrix, SRV) for easier bends and a fatter tone; Kurt Vile keeps a guitar permanently in this tuning for live use.",
    artists: [
      { name: "Jimi Hendrix", songs: ["most of his recorded catalog"] },
      { name: "Stevie Ray Vaughan", songs: ["catalog-wide, to ease bending heavy-gauge strings"] },
      { name: "Kurt Vile", songs: ["Wakin on a Pretty Day (live)"] },
    ],
    sources: ["https://www.premierguitar.com/artists/kurt-vile-and-steve-gunn-into-the-mystic"],
  },
  {
    id: "kurtVileHalfStepUp",
    name: "Half-Step Up",
    strings: "F Bb Eb Ab C F",
    intervalsFromStandard: "EADGBE → FBbEbAbCF",
    family: "raised",
    description:
      "The mirror image of half-step-down: standard tuning's shapes and intervals, transposed a semitone sharp instead of flat. Vile keeps a dedicated Silvertone tuned this way for one specific song.",
    artists: [{ name: "Kurt Vile", songs: ["Wild Imagination"] }],
    sources: ["https://www.premierguitar.com/artists/kurt-vile-and-steve-gunn-into-the-mystic"],
  },

  // ---------------------------------------------------------------------
  // Grizzly Bear / Daniel Rossen
  // ---------------------------------------------------------------------
  {
    id: "grizzlyBearSleepingUte",
    name: "E A C# F# A C# (Sleeping Ute)",
    strings: "E A C# F# A C#",
    intervalsFromStandard: "EADGBE → EAC#F#AC#",
    family: "open",
    description:
      "An open A6-type chord (A–C#–E with an added F#/6th) reverse-engineered by tabbers from Daniel Rossen's live performances of Grizzly Bear's Shields opener. Flagged uncertain: some tab sources transcribe the song in plain standard tuning instead, and there's no tuning confirmation directly from Rossen — treat this one as the best available guess, not a confirmed fact.",
    artists: [{ name: "Daniel Rossen / Grizzly Bear", songs: ["Sleeping Ute"] }],
    sources: ["https://gtdb.org/eacsfsacs", "https://www.tdpri.com/threads/grizzly-bear-sleeping-ute.989845/"],
  },

  // ---------------------------------------------------------------------
  // Joni Mitchell (referenced by name in several entries above; this is
  // her other foundational, well-documented original)
  // ---------------------------------------------------------------------
  {
    id: "joniMitchellOpenCadd9",
    name: "C G D F C E (Mitchell's Open C add9,11)",
    strings: "C G D F C E",
    intervalsFromStandard: "EADGBE → CGDFCE",
    family: "open",
    description:
      "Documented on Mitchell's own official site as the tuning behind two of her early-70s songs — a C major chord with a 9th (D) and an 11th (F) folded into the open strings, letting complex-sounding chords fall out of simple one- or two-finger shapes.",
    capoNote: "Both transcriptions on jonimitchell.com call for capo 2.",
    artists: [
      { name: "Joni Mitchell", songs: ["Sisotowbell Lane", "Ladies of the Canyon"] },
    ],
    sources: [
      "https://jonimitchell.com/music/transcription.cfm?id=123",
      "https://jonimitchell.com/music/transcription_bytuning.cfm?id=1&y=CGDFCE",
    ],
  },
];
