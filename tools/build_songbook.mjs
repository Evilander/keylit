// build_songbook.mjs — generates the PUBLIC DOMAIN SONGBOOK: traditional and
// pre-1930 songs authored as Keylit charts. Unlike public/corpus (scraped,
// personal-use only, never shipped), everything here is public-domain and
// SHIPS with the public build. Run from repo root:
//   node tools/build_songbook.mjs
// Writes public/songbook/<id>.json + public/songbook/manifest.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "songbook");

const ALBUM = "The Public Domain Songbook";
const FETCHED = "2026-07-02";

// Every chart: guitar-friendly key, correct traditional changes, a couple of
// verses of the traditional words, and (on several) a simple first-position
// tab figure derived mechanically from the chord shapes — so the tab→piano
// player and its fingering suggestions light up on the public site.
const SONGS = [
  {
    id: "traditional--house-of-the-rising-sun",
    artist: "Traditional", title: "House of the Rising Sun", key: "Am", format: "tab",
    body: `Key: A minor · 6/8 — let each arpeggio ring into the next

[Intro — pick through the shapes, low string first]
e|--------0--------|--------0--------|--------2--------|--------1--------|
B|-----1-----1-----|-----1-----1-----|-----3-----3-----|-----1-----1-----|
G|--2-----------2--|--0-----------0--|--2-----------2--|--2-----------2--|
D|-----------------|-----------------|-----------------|--3--------------|
A|--0--------------|--3--------------|-----------------|-----------------|
E|-----------------|-----------------|--2--------------|-----------------|
     Am                C                 D/F#              F

[Verse 1]
Am        C         D         F
There is a house in New Orleans
Am        C        E
They call the Rising Sun
Am           C          D            F
And it's been the ruin of many a poor boy
Am       E         Am
And God, I know I'm one

[Verse 2]
Am       C        D          F
My mother was a tailor
Am           C            E
She sewed my new blue jeans
Am        C        D        F
My father was a gambling man
Am      E        Am
Down in New Orleans

[Outro]
Am   C   D   F   Am   E   Am`,
  },
  {
    id: "traditional--in-the-pines",
    artist: "Traditional", title: "In the Pines", key: "E", format: "chords",
    body: `Key: E major · slow and lonesome — the Lead Belly way

[Chorus]
E                 E7
In the pines, in the pines
          A            E
Where the sun never shines
    E                      B7        E
And shivered when the cold wind blows

[Verse 1]
E                      E7
Little girl, little girl, where'd you sleep last night
A                    E
Not even your mother knows
E                    B7                E
In the pines, in the pines, where the sun never shines
E            B7           E
I shivered the whole night through

[Verse 2]
E                E7
My husband was a railroad man
A                     E
Killed a mile and a half from here
E                     B7            E
His head was found in a driver's wheel
E              B7        E
His body never was found`,
  },
  {
    id: "traditional--man-of-constant-sorrow",
    artist: "Traditional", title: "Man of Constant Sorrow", key: "G", format: "chords",
    body: `Key: G major · steady bluegrass pulse — capo 2 to sing it higher

[Verse 1]
G
I am a man of constant sorrow
       C              D        G
I've seen trouble all my days
G
I bid farewell to old Kentucky
     C                 D       G
The place where I was born and raised

[Verse 2]
G
For six long years I've been in trouble
    C            D          G
No pleasure here on earth I find
G
For in this world I'm bound to ramble
   C           D         G
I have no friends to help me now

[Refrain]
       C                 D
(He's a man of constant sorrow
       D            G
He's seen trouble all his days)`,
  },
  {
    id: "traditional--wayfaring-stranger",
    artist: "Traditional", title: "Wayfaring Stranger", key: "Dm", format: "tab",
    body: `Key: D minor · unhurried — thumb keeps the low D sounding

[Intro — picked from the Dm shape]
e|--------1--------|--------1--------|--------0--------|--------1--------|
B|-----3-----3-----|-----3-----3-----|-----2-----2-----|-----3-----3-----|
G|--2-----------2--|--2-----------2--|--0-----------0--|--2-----------2--|
D|--0--------------|--0--------------|--2--------------|--0--------------|
A|-----------------|-----------------|--0--------------|-----------------|
E|-----------------|-----------------|-----------------|-----------------|
     Dm                Dm                A7                Dm

[Verse 1]
Dm                     Gm        Dm
I'm just a poor wayfaring stranger
Dm             Gm     A7
Traveling through this world of woe
Dm                    Gm       Dm
Yet there's no sickness, toil or danger
Dm            A7         Dm
In that bright land to which I go

[Chorus]
F                 Bb
I'm going there to see my father
F                    A7
I'm going there no more to roam
Dm                  Gm      Dm
I'm only going over Jordan
Dm          A7        Dm
I'm only going over home`,
  },
  {
    id: "traditional--shady-grove",
    artist: "Traditional", title: "Shady Grove", key: "Dm", format: "tab",
    body: `Key: D minor (mountain modal) · driving — hammer the third when it feels right

[Figure — the two shapes that carry the whole song]
e|--1--1--1--1--|--0--0--0--0--|--1--1--1--1--|--1-----1-----|
B|--3--3--3--3--|--1--1--1--1--|--3--3--3--3--|--3-----3-----|
G|--2--2--2--2--|--0--0--0--0--|--2--2--2--2--|--2-----2-----|
D|--0--0--0--0--|--2--2--2--2--|--0--0--0--0--|--0-----0-----|
A|--------------|--3--3--3--3--|--------------|--------------|
E|--------------|--------------|--------------|--------------|
     Dm             C              Dm             Dm

[Chorus]
Dm            C
Shady Grove, my little love
Dm
Shady Grove I say
Dm            C
Shady Grove, my little love
Dm      C     Dm
I'm bound to go away

[Verse 1]
Dm                C
Cheeks as red as a blooming rose
Dm
Eyes of the prettiest brown
Dm              C
She's the darling of my heart
Dm       C      Dm
Sweetest girl in town`,
  },
  {
    id: "traditional--the-water-is-wide",
    artist: "Traditional", title: "The Water Is Wide", key: "G", format: "chords",
    body: `Key: G major · gentle 4/4 — let the bass walk between chords

[Verse 1]
G          C          G
The water is wide, I cannot get o'er
G         Em       Am        D7
And neither have I wings to fly
G        Bm       C         G
Give me a boat that can carry two
G        C      D7      G
And both shall row, my love and I

[Verse 2]
G           C            G
A ship there is, and she sails the sea
G          Em      Am        D7
She's loaded deep as deep can be
G        Bm       C        G
But not so deep as the love I'm in
G       C       D7       G
I know not if I sink or swim`,
  },
  {
    id: "traditional--shenandoah",
    artist: "Traditional", title: "Shenandoah", key: "G", format: "chords",
    body: `Key: G major · rubato — sing it like the river moves

[Verse 1]
G                       C       G
Oh Shenandoah, I long to hear you
Em            C         G      D
Away, you rolling river
G                        C      G
Oh Shenandoah, I long to hear you
Em       C     D      G
Away, I'm bound away
       C          D        G
'Cross the wide Missouri

[Verse 2]
G                     C      G
Oh Shenandoah, I love your daughter
Em            C         G      D
Away, you rolling river
G                          C    G
For her I'd cross your roaming waters
Em       C     D      G
Away, I'm bound away
       C          D        G
'Cross the wide Missouri`,
  },
  {
    id: "traditional--wildwood-flower",
    artist: "Traditional", title: "Wildwood Flower", key: "C", format: "tab",
    body: `Key: C major · Carter-family boom-chick — bass note, then brush the chord

[Figure — bass-strum from the C and G7 shapes]
e|--------0--------0--|--------1--------1--|--------0--------0--|--------0--------0--|
B|--------1--------1--|--------0--------0--|--------1--------1--|--------1--------1--|
G|--------0--------0--|--------0--------0--|--------0--------0--|--------0--------0--|
D|--------2--------2--|--------0--------0--|--------2--------2--|--------2--------2--|
A|--3-----------------|--------------------|--3-----------------|--3-----------------|
E|-----------3--------|--3--------3--------|-----------3--------|-----------3--------|
      C                    G7                   C                    C

[Verse 1]
C                       G7          C
Oh, I'll twine with my mingles and waving black hair
C                        G7        C
With the roses so red and the lilies so fair
C                     F          C
And the myrtle so bright with the emerald dew
C                    G7          C
The pale and the leader and eyes look like blue

[Verse 2]
C                       G7            C
Oh I'll dance, I will sing and my laugh shall be gay
C                        G7           C
I will charm every heart, in his crown I will sway
C                       F           C
When I woke from my dreaming, my idol was clay
C                     G7            C
All portion of love had all flown away`,
  },
  {
    id: "traditional--john-henry",
    artist: "Traditional", title: "John Henry", key: "E", format: "chords",
    body: `Key: E major · hammer-swing — heavy downbeat, like steel on stone

[Verse 1]
E
When John Henry was a little baby
                          A         E
Sitting on his daddy's knee
E                                    A
He picked up a hammer and a little piece of steel
         E              B7            E
Said "Hammer's gonna be the death of me, Lord, Lord
E           B7           E
Hammer's gonna be the death of me"

[Verse 2]
E
John Henry said to his captain
                            A       E
"A man ain't nothing but a man
E                                       A
But before I let your steam drill beat me down
     E          B7          E
I'd die with a hammer in my hand, Lord, Lord
E        B7             E
I'd die with a hammer in my hand"`,
  },
  {
    id: "traditional--pretty-polly",
    artist: "Traditional", title: "Pretty Polly", key: "Em", format: "chords",
    body: `Key: E minor (modal) · dark and steady — mostly one chord, that's the point

[Verse 1]
Em
Oh Polly, pretty Polly, come go along with me
D                 Em
Polly, pretty Polly, come go along with me
Em                                  D            Em
Before we get married some pleasure to see

[Verse 2]
Em
He led her over mountains and valleys so deep
D              Em
Led her over hills and valleys so deep
Em                              D           Em
Pretty Polly mistrusted and then began to weep`,
  },
  {
    id: "traditional--red-river-valley",
    artist: "Traditional", title: "Red River Valley", key: "G", format: "chords",
    body: `Key: G major · easy waltz of the plains

[Verse 1]
G                        D7
From this valley they say you are going
G                    D7
We will miss your bright eyes and sweet smile
G          G7         C
For they say you are taking the sunshine
G              D7        G
That has brightened our pathway a while

[Chorus]
G                     D7
Come and sit by my side if you love me
G                      D7
Do not hasten to bid me adieu
G          G7          C
But remember the Red River Valley
G             D7          G
And the cowboy who loved you so true`,
  },
  {
    id: "traditional--down-in-the-valley",
    artist: "Traditional", title: "Down in the Valley", key: "G", format: "chords",
    body: `Key: G major · 3/4 — two chords, all feel

[Verse 1]
G
Down in the valley, the valley so low
                              D7
Hang your head over, hear the wind blow
D7
Hear the wind blow, dear, hear the wind blow
                          G
Hang your head over, hear the wind blow

[Verse 2]
G
Roses love sunshine, violets love dew
                                D7
Angels in heaven know I love you
D7
Know I love you, dear, know I love you
                        G
Angels in heaven know I love you`,
  },
  {
    id: "traditional--careless-love",
    artist: "Traditional", title: "Careless Love", key: "C", format: "chords",
    body: `Key: C major · slow blues lean — bend into the C7

[Verse 1]
C        G7        C
Love, oh love, oh careless love
C                  G7
Love, oh love, oh careless love
C        C7         F
Love, oh love, oh careless love
C              G7            C
See what careless love has done

[Verse 2]
C            G7       C
Once I wore my apron low
C                    G7
Once I wore my apron low
C          C7        F
Once I wore my apron low
C            G7              C
Couldn't keep you from my door`,
  },
  {
    id: "stephen-foster--hard-times-come-again-no-more",
    artist: "Stephen Foster", title: "Hard Times Come Again No More", key: "C", format: "chords",
    body: `Key: C major · parlor hymn feel — 1854, and it still lands

[Verse 1]
C                 F        C
Let us pause in life's pleasures and count its many tears
C            F         C        G
While we all sup sorrow with the poor
C                  F           C
There's a song that will linger forever in our ears
C          F       G7       C
Oh, hard times come again no more

[Chorus]
C                          F      C
'Tis the song, the sigh of the weary
Am              F           C       G
Hard times, hard times, come again no more
C                    F                C
Many days you have lingered around my cabin door
C          F       G7       C
Oh, hard times come again no more`,
  },
  {
    id: "traditional--greensleeves",
    artist: "Traditional", title: "Greensleeves", key: "Em", format: "tab",
    body: `Key: E minor · 6/8 — old as the hills, pretty as ever

[Intro — rolled from the Em and D shapes]
e|--------0--------|--------2--------|--------0--------|--------2--------|
B|-----0-----0-----|-----3-----3-----|-----0-----0-----|-----0-----0-----|
G|--0-----------0--|--2-----------2--|--0-----------0--|--2-----------2--|
D|--2--------------|--0--------------|--2--------------|--1--------------|
A|--2--------------|-----------------|--2--------------|--2--------------|
E|--0--------------|-----------------|--0--------------|-----------------|
     Em                D                 Em                B7

[Verse 1]
Em                D
Alas, my love, you do me wrong
Em                    B7
To cast me off discourteously
Em               D
For I have loved you well and long
Em          B7        Em
Delighting in your company

[Chorus]
G                D
Greensleeves was all my joy
Em                  B7
Greensleeves was my delight
G                  D
Greensleeves was my heart of gold
Em         B7       Em
And who but my lady Greensleeves`,
  },
  {
    id: "traditional--scarborough-fair",
    artist: "Traditional", title: "Scarborough Fair", key: "Am", format: "tab",
    body: `Key: A minor (Dorian) · 3/4 — the old ballad, plain and haunted

[Intro — picked from Am, G, and back]
e|--------0--------|--------3--------|--------0--------|--------0--------|
B|-----1-----1-----|-----0-----0-----|-----1-----1-----|-----1-----1-----|
G|--2-----------2--|--0-----------0--|--2-----------2--|--2-----------2--|
D|--2--------------|--0--------------|--2--------------|--2--------------|
A|--0--------------|--2--------------|--0--------------|--0--------------|
E|-----------------|--3--------------|-----------------|-----------------|
     Am                G                 Am                Am

[Verse 1]
Am                     G       Am
Are you going to Scarborough Fair?
C        Am         D         Am
Parsley, sage, rosemary and thyme
Am         C                 G
Remember me to one who lives there
Am            G            Am
She once was a true love of mine

[Verse 2]
Am                        G        Am
Tell her to make me a cambric shirt
C        Am         D         Am
Parsley, sage, rosemary and thyme
Am            C              G
Without no seam nor needlework
Am           G            Am
Then she'll be a true love of mine`,
  },
  {
    id: "traditional--amazing-grace",
    artist: "Traditional", title: "Amazing Grace", key: "G", format: "chords",
    body: `Key: G major · 3/4 — everyone's first hymn for a reason

[Verse 1]
G            G7         C       G
Amazing grace, how sweet the sound
G                       D
That saved a wretch like me
G           G7        C      G
I once was lost, but now am found
G         D         G
Was blind, but now I see

[Verse 2]
G             G7          C       G
'Twas grace that taught my heart to fear
G                     D
And grace my fears relieved
G            G7           C        G
How precious did that grace appear
G         D          G
The hour I first believed`,
  },
  {
    id: "frederic-weatherly--danny-boy",
    artist: "Frederic Weatherly", title: "Danny Boy", key: "C", format: "chords",
    body: `Key: C major · rubato — 1913; take the high line only if you mean it

[Verse 1]
C          C7            F          C
Oh Danny boy, the pipes, the pipes are calling
C            Am         Dm      G7
From glen to glen, and down the mountain side
C            C7           F           C
The summer's gone, and all the roses falling
C          Am        Dm    G7      C
'Tis you, 'tis you must go and I must bide

[Chorus]
F                 C
But come ye back when summer's in the meadow
C          Am           D7          G7
Or when the valley's hushed and white with snow
C        C7          F        C
'Tis I'll be here in sunshine or in shadow
C          Am      G7           C
Oh Danny boy, oh Danny boy, I love you so`,
  },
];

fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const s of SONGS) {
  const rec = {
    id: s.id, artist: s.artist, title: s.title,
    album: ALBUM, albumOrder: 1,
    source: "songbook", sourceUrl: null,
    tuning: "standard", tuningRaw: "Standard",
    capo: null, key: s.key, format: s.format,
    transcriber: "Keylit", fetchedAt: FETCHED,
    body: s.body,
  };
  fs.writeFileSync(path.join(OUT, `${s.id}.json`), JSON.stringify(rec), "utf8");
  const { body, ...row } = rec;
  manifest.push({ ...row, tuningId: "standard", tuningName: "Standard" });
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest), "utf8");
console.log(`songbook: wrote ${SONGS.length} songs + manifest to public/songbook/`);
