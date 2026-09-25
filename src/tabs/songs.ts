// Song Catalog Data - 50+ verified songs
// This would normally be loaded from a JSON file

import { Song, DetectionResult, StringTuning, STANDARD_TUNING, NOTE_NAMES, parseChordSymbol } from '../types';
import { playAcousticString, strumChord, AcousticBus } from '../audio/engine';
import { buildChordDefinition, CHORD_PRESETS, CHORD_FORMULAS } from '../chords/definitions';
import { PaneNeck3D } from '../ui/paneNeck3d';
import { findSong, songTimeline, type CatalogSong } from '../songs/catalog';
import { chordIdentity, compileTiming, PITCH_CLASSES, resolveSongNote, transposeSongChord, type SongEvent, type SongTiming, type TimingMode } from '../songs/timing';
import { PerformanceGate, type PracticeTarget } from '../songs/performance';
import { SongTransport } from '../songs/transport';

const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_TO_PC: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** Shift a chord name (root + optional /bass) by N semitones, preserving quality suffix. */
function transposeChordName(name: string, semis: number): string {
  return transposeSongChord(name, semis);
}

/** Escape user-provided text before interpolating into innerHTML (custom songs
 *  are user-authored and persisted, so their title/lyrics/chords are untrusted). */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const SONG_CATALOG: Song[] = [
  {
    id: 'hotel_california',
    title: 'Hotel California',
    movie: 'Hotel California (1976)',
    singer: 'Eagles (Don Henley)',
    music: 'Don Felder, Don Henley, Glenn Frey',
    lyricsBy: 'Don Henley, Glenn Frey',
    key: 'B Minor (Capo 7: Em)',
    bpm: 75,
    strum: 'D - D U - U D U',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ ↑',
    chordsUsed: ['Am', 'E', 'G', 'D', 'F', 'C', 'Dm'],
    lines: [
      {
        section: 'Verse 1',
        text: 'On a dark desert highway, cool wind in my hair',
        chords: [
          { chord: 'Am', word: 'On' },
          { chord: 'E', word: 'highway' },
          { chord: 'G', word: 'cool' },
          { chord: 'D', word: 'hair' },
        ],
        sargam: 'Sa ni Dha Pa | ma ga Re Sa',
        notes: [
          { note: 'B3', sargam: 'Sa', lyric: 'On', string: 2, fret: 0, beats: 1, freq: 246.94 },
          { note: 'E4', sargam: 'Pa', lyric: 'dark', string: 1, fret: 0, beats: 1, freq: 329.63 },
        ],
      },
    ],
  },
  {
    id: 'let_it_be',
    title: 'Let It Be',
    movie: 'Let It Be (1970)',
    singer: 'The Beatles (Paul McCartney)',
    music: 'John Lennon, Paul McCartney',
    lyricsBy: 'Paul McCartney',
    key: 'C Major (Sa = C)',
    bpm: 72,
    strum: 'D - D - D - D -',
    strumPatternVisual: '↓ - ↓ - ↓ - ↓ -',
    chordsUsed: ['C', 'G', 'Am', 'F', 'Em', 'Dm'],
    lines: [
      {
        section: 'Verse 1',
        text: 'When I find myself in times of trouble, Mother Mary comes to me',
        chords: [
          { chord: 'C', word: 'When' },
          { chord: 'G', word: 'trouble' },
          { chord: 'Am', word: 'Mary' },
          { chord: 'F', word: 'me' },
        ],
        sargam: 'Sa Sa Sa Sa Re Re | Re Re Re Re Sa Sa',
        notes: [
          { note: 'C4', sargam: 'Sa', lyric: 'When', string: 2, fret: 1, beats: 1, freq: 261.63 },
          { note: 'G3', sargam: 'Pa', lyric: 'trouble', string: 3, fret: 0, beats: 1, freq: 196.00 },
        ],
      },
    ],
  },
  {
    id: 'wonderwall',
    title: 'Wonderwall',
    movie: "What's the Story Morning Glory (1995)",
    singer: 'Oasis (Liam Gallagher)',
    music: 'Noel Gallagher',
    lyricsBy: 'Noel Gallagher',
    key: 'F# Minor / Capo 2: Em',
    bpm: 86,
    strum: 'D - D - D U D U D - D U',
    strumPatternVisual: '↓ - ↓ - ↓ ↑ ↓ ↑ ↓ - ↓ ↑',
    chordsUsed: ['Em', 'G', 'D', 'A', 'C'],
    lines: [
      {
        section: 'Verse 1',
        text: 'Today is gonna be the day that they\'re gonna throw it back to you',
        chords: [
          { chord: 'Em', word: 'Today' },
          { chord: 'G', word: 'day' },
          { chord: 'D', word: 'throw' },
          { chord: 'A', word: 'you' },
        ],
        sargam: 'Sa Re ga | Re ga Pa | ma ga Re Sa',
        notes: [
          { note: 'E4', sargam: 'Sa', lyric: 'Today', string: 1, fret: 0, beats: 1, freq: 329.63 },
          { note: 'G4', sargam: 'ga', lyric: 'day', string: 1, fret: 3, beats: 1, freq: 392.00 },
        ],
      },
    ],
  },
  {
    id: 'tum_hi_ho',
    title: 'Tum Hi Ho',
    movie: 'Aashiqui 2 (2013)',
    singer: 'Arijit Singh',
    music: 'Mithoon',
    lyricsBy: 'Mithoon',
    key: 'C# Minor / Transposed Em',
    bpm: 88,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['Em', 'Am', 'D', 'C', 'B7'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Hum tere bin ab reh nahi sakte',
        chords: [
          { chord: 'Em', word: 'Hum' },
          { chord: 'Am', word: 'sakte' },
        ],
        sargam: 'Pa ma ga Re Sa | Re ga Re Sa ni',
        notes: [
          { note: 'E4', sargam: 'Pa', lyric: 'Hum', string: 1, fret: 0, beats: 1, freq: 329.63 },
          { note: 'A3', sargam: 'Sa', lyric: 'tere', string: 2, fret: 0, beats: 1, freq: 220.00 },
        ],
      },
    ],
  },
  {
    id: 'kesariya',
    title: 'Kesariya',
    movie: 'Brahmastra (2022)',
    singer: 'Arijit Singh',
    music: 'Pritam',
    lyricsBy: 'Amitabh Bhattacharya',
    key: 'C Major (Sa = C)',
    bpm: 92,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['C', 'F', 'G', 'Am', 'Dm'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Mujhko itna bataye koi',
        chords: [
          { chord: 'C', word: 'Mujhko' },
          { chord: 'F', word: 'koi' },
        ],
        sargam: 'Sa Re Ga | Ga ma Pa',
        notes: [
          { note: 'C4', sargam: 'Sa', lyric: 'Mujhko', string: 2, fret: 1, beats: 1, freq: 261.63 },
          { note: 'F4', sargam: 'ma', lyric: 'koi', string: 1, fret: 1, beats: 1, freq: 349.23 },
        ],
      },
    ],
  },
  {
    id: 'channa_mereya',
    title: 'Channa Mereya',
    movie: 'Ae Dil Hai Mushkil (2016)',
    singer: 'Arijit Singh',
    music: 'Pritam',
    lyricsBy: 'Amitabh Bhattacharya',
    key: 'D Major (Sa = D)',
    bpm: 78,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['D', 'G', 'A', 'Bm', 'Em'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Achha chalta hoon, duaon mein yaad rakhna',
        chords: [
          { chord: 'D', word: 'Achha' },
          { chord: 'G', word: 'rakhna' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Ga',
        notes: [
          { note: 'D4', sargam: 'Sa', lyric: 'Achha', string: 3, fret: 0, beats: 1, freq: 293.66 },
          { note: 'G4', sargam: 'Pa', lyric: 'rakhna', string: 1, fret: 3, beats: 1, freq: 392.00 },
        ],
      },
    ],
  },
  {
    id: 'kal_ho_naa_ho',
    title: 'Kal Ho Naa Ho',
    movie: 'Kal Ho Naa Ho (2003)',
    singer: 'Sonu Nigam',
    music: 'Shankar-Ehsaan-Loy',
    lyricsBy: 'Javed Akhtar',
    key: 'C Major (Sa = C)',
    bpm: 80,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['C', 'Em', 'F', 'G', 'Am'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Har ghadi badal rahi hai roop zindagi',
        chords: [
          { chord: 'C', word: 'Har' },
          { chord: 'Em', word: 'zindagi' },
        ],
        sargam: 'Sa Re Ga Ga Ga Ga Ga | Re Ga ma ma ma ma',
        notes: [
          { note: 'C4', sargam: 'Sa', lyric: 'Har', string: 2, fret: 1, beats: 1, freq: 261.63 },
          { note: 'E4', sargam: 'Ga', lyric: 'ghadi', string: 1, fret: 0, beats: 1, freq: 329.63 },
        ],
      },
    ],
  },
  {
    id: 'perfect',
    title: 'Perfect',
    movie: 'Divide (2017)',
    singer: 'Ed Sheeran',
    music: 'Ed Sheeran',
    lyricsBy: 'Ed Sheeran',
    key: 'G Major (Sa = G)',
    bpm: 63,
    strum: 'D - D - D - (6/8 Ballad)',
    strumPatternVisual: '↓ - ↓ - ↓ -',
    chordsUsed: ['G', 'Em', 'C', 'D'],
    lines: [
      {
        section: 'Verse 1',
        text: 'I found a love for me',
        chords: [
          { chord: 'G', word: 'found' },
          { chord: 'Em', word: 'me' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Sa',
        notes: [
          { note: 'G3', sargam: 'Sa', lyric: 'found', string: 3, fret: 0, beats: 1, freq: 196.00 },
          { note: 'E4', sargam: 'Ga', lyric: 'me', string: 1, fret: 0, beats: 1, freq: 329.63 },
        ],
      },
    ],
  },
  {
    id: 'shape_of_you',
    title: 'Shape of You',
    movie: 'Divide (2017)',
    singer: 'Ed Sheeran',
    music: 'Ed Sheeran',
    lyricsBy: 'Ed Sheeran',
    key: 'C# Minor (Sa = C#)',
    bpm: 96,
    strum: 'D - X U - X D -',
    strumPatternVisual: '↓ - ✕ ↑ - ✕ ↓ -',
    chordsUsed: ['C#m', 'F#m', 'A', 'B'],
    lines: [
      {
        section: 'Verse 1',
        text: 'The club isn\'t the best place to find a lover',
        chords: [
          { chord: 'C#m', word: 'club' },
          { chord: 'F#m', word: 'lover' },
        ],
        sargam: 'ga Re Sa ni | Sa ga Re',
        notes: [
          { note: 'C#4', sargam: 'ga', lyric: 'club', string: 2, fret: 2, beats: 1, freq: 277.18 },
          { note: 'F#4', sargam: 'Sa', lyric: 'lover', string: 1, fret: 2, beats: 1, freq: 369.99 },
        ],
      },
    ],
  },
  {
    id: 'photograph',
    title: 'Photograph',
    movie: 'X (2014)',
    singer: 'Ed Sheeran',
    music: 'Ed Sheeran',
    lyricsBy: 'Ed Sheeran, Johnny McDaid',
    key: 'D Major (Sa = D)',
    bpm: 84,
    strum: 'D - D - D U D U',
    strumPatternVisual: '↓ - ↓ - ↓ ↑ ↓ ↑',
    chordsUsed: ['D', 'Bm', 'A', 'G'],
    lines: [
      {
        section: 'Verse 1',
        text: 'Loving can hurt, loving can hurt sometimes',
        chords: [
          { chord: 'D', word: 'Loving' },
          { chord: 'Bm', word: 'sometimes' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Sa',
        notes: [
          { note: 'D4', sargam: 'Sa', lyric: 'Loving', string: 3, fret: 0, beats: 1, freq: 293.66 },
          { note: 'B3', sargam: 'ma', lyric: 'hurt', string: 2, fret: 0, beats: 1, freq: 246.94 },
        ],
      },
    ],
  },
  {
    id: 'someone_like_you',
    title: 'Someone Like You',
    movie: '21 (2011)',
    singer: 'Adele',
    music: 'Adele, Dan Wilson',
    lyricsBy: 'Adele, Dan Wilson',
    key: 'A Major (Sa = A)',
    bpm: 68,
    strum: 'Arpeggio / D - D - D - D -',
    strumPatternVisual: '🎶 / ↓ - ↓ - ↓ - ↓ -',
    chordsUsed: ['A', 'E', 'F#m', 'D'],
    lines: [
      {
        section: 'Verse 1',
        text: 'I heard that you\'re settled down',
        chords: [
          { chord: 'A', word: 'heard' },
          { chord: 'E', word: 'down' },
        ],
        sargam: 'Sa Ga Pa Sa\' | ni Dha Pa Ga',
        notes: [
          { note: 'A3', sargam: 'Sa', lyric: 'heard', string: 2, fret: 0, beats: 1, freq: 220.00 },
          { note: 'E4', sargam: 'Pa', lyric: 'down', string: 1, fret: 0, beats: 1, freq: 329.63 },
        ],
      },
    ],
  },
  {
    id: 'hallelujah',
    title: 'Hallelujah',
    movie: 'Various / Shrek (1984)',
    singer: 'Leonard Cohen / Jeff Buckley',
    music: 'Leonard Cohen',
    lyricsBy: 'Leonard Cohen',
    key: 'C Major (Sa = C)',
    bpm: 58,
    strum: 'D - D - D - (6/8 Fingerpick)',
    strumPatternVisual: '↓ - ↓ - ↓ -',
    chordsUsed: ['C', 'Am', 'F', 'G', 'E7'],
    lines: [
      {
        section: 'Verse 1',
        text: 'I\'ve heard there was a secret chord',
        chords: [
          { chord: 'C', word: 'heard' },
          { chord: 'Am', word: 'chord' },
        ],
        sargam: 'Sa Ga Pa Pa Pa | Dha Dha Dha Dha',
        notes: [
          { note: 'C4', sargam: 'Sa', lyric: 'heard', string: 2, fret: 1, beats: 1, freq: 261.63 },
          { note: 'E4', sargam: 'Ga', lyric: 'secret', string: 1, fret: 0, beats: 1, freq: 329.63 },
        ],
      },
    ],
  },
  {
    id: 'stand_by_me',
    title: 'Stand By Me',
    movie: "Don't Play That Song! (1961)",
    singer: 'Ben E. King',
    music: 'Ben E. King, Jerry Leiber, Mike Stoller',
    lyricsBy: 'Ben E. King, Jerry Leiber, Mike Stoller',
    key: 'A Major (Sa = A)',
    bpm: 118,
    strum: 'D - X U - U D U',
    strumPatternVisual: '↓ - ✕ ↑ - ↑ ↓ ↑',
    chordsUsed: ['A', 'F#m', 'D', 'E'],
    lines: [
      {
        section: 'Verse 1',
        text: 'When the night has come, and the land is dark',
        chords: [
          { chord: 'A', word: 'When' },
          { chord: 'F#m', word: 'dark' },
        ],
        sargam: 'Sa Sa Sa Ga | Re Sa ni Sa',
        notes: [
          { note: 'A3', sargam: 'Sa', lyric: 'When', string: 2, fret: 0, beats: 1, freq: 220.00 },
          { note: 'F#4', sargam: 'Ga', lyric: 'dark', string: 1, fret: 2, beats: 1, freq: 369.99 },
        ],
      },
    ],
  },
  {
    id: 'knockin_on_heaven',
    title: "Knockin' On Heaven's Door",
    movie: 'Pat Garrett & Billy the Kid (1973)',
    singer: 'Bob Dylan / Guns N\' Roses',
    music: 'Bob Dylan',
    lyricsBy: 'Bob Dylan',
    key: 'G Major (Sa = G)',
    bpm: 68,
    strum: 'D - D - D U D U',
    strumPatternVisual: '↓ - ↓ - ↓ ↑ ↓ ↑',
    chordsUsed: ['G', 'D', 'Am', 'C'],
    lines: [
      {
        section: 'Verse 1',
        text: 'Mama take this badge off of me',
        chords: [
          { chord: 'G', word: 'Mama' },
          { chord: 'D', word: 'me' },
        ],
        sargam: 'Pa ma Ga Re | Ga ma Ga Re Sa',
        notes: [
          { note: 'G3', sargam: 'Pa', lyric: 'Mama', string: 3, fret: 0, beats: 1, freq: 196.00 },
          { note: 'D4', sargam: 'ma', lyric: 'me', string: 3, fret: 0, beats: 1, freq: 293.66 },
        ],
      },
    ],
  },
  {
    id: 'wish_you_were_here',
    title: 'Wish You Were Here',
    movie: 'Wish You Were Here (1975)',
    singer: 'Pink Floyd (David Gilmour)',
    music: 'Roger Waters, David Gilmour',
    lyricsBy: 'Roger Waters, David Gilmour',
    key: 'G Major (Sa = G)',
    bpm: 60,
    strum: 'D - D - D U D U',
    strumPatternVisual: '↓ - ↓ - ↓ ↑ ↓ ↑',
    chordsUsed: ['G', 'Em', 'A', 'C', 'D', 'Am'],
    lines: [
      {
        section: 'Verse 1',
        text: 'So, so you think you can tell heaven from hell',
        chords: [
          { chord: 'G', word: 'So' },
          { chord: 'Em', word: 'hell' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Sa',
        notes: [
          { note: 'G3', sargam: 'Sa', lyric: 'So', string: 3, fret: 0, beats: 1, freq: 196.00 },
          { note: 'E4', sargam: 'ma', lyric: 'hell', string: 1, fret: 0, beats: 1, freq: 329.63 },
        ],
      },
    ],
  },
  {
    id: 'yellow',
    title: 'Yellow',
    movie: 'Parachutes (2000)',
    singer: 'Coldplay (Chris Martin)',
    music: 'Coldplay',
    lyricsBy: 'Chris Martin',
    key: 'B Major (Sa = B)',
    bpm: 88,
    strum: 'D - D - D U D U',
    strumPatternVisual: '↓ - ↓ - ↓ ↑ ↓ ↑',
    chordsUsed: ['B', 'F#', 'E', 'G#m'],
    lines: [
      {
        section: 'Verse 1',
        text: 'Look at the stars, look how they shine for you',
        chords: [
          { chord: 'B', word: 'Look' },
          { chord: 'F#', word: 'you' },
        ],
        sargam: 'Sa Ga Pa Dha | Pa Ga Re Sa',
        notes: [
          { note: 'B3', sargam: 'Sa', lyric: 'Look', string: 2, fret: 4, beats: 1, freq: 246.94 },
          { note: 'F#4', sargam: 'Pa', lyric: 'you', string: 1, fret: 2, beats: 1, freq: 369.99 },
        ],
      },
    ],
  },
  {
    id: 'riptide',
    title: 'Riptide',
    movie: 'Dream Your Life Away (2013)',
    singer: 'Vance Joy',
    music: 'Vance Joy',
    lyricsBy: 'Vance Joy',
    key: 'A Minor / Capo 1 (Sa = A)',
    bpm: 102,
    strum: 'D - D - D U D U',
    strumPatternVisual: '↓ - ↓ - ↓ ↑ ↓ ↑',
    chordsUsed: ['Am', 'G', 'C', 'F'],
    lines: [
      {
        section: 'Verse 1',
        text: 'I was scared of dentists and the dark',
        chords: [
          { chord: 'Am', word: 'scared' },
          { chord: 'G', word: 'dark' },
        ],
        sargam: 'Sa Re ga | ga Re Sa',
        notes: [
          { note: 'A3', sargam: 'Sa', lyric: 'scared', string: 2, fret: 0, beats: 1, freq: 220.00 },
          { note: 'G4', sargam: 'ga', lyric: 'dark', string: 1, fret: 3, beats: 1, freq: 392.00 },
        ],
      },
    ],
  },
  // Bollywood Classics
  {
    id: 'pyaar_hua_iqrar_hua',
    title: 'Pyaar Hua Iqrar Hua',
    movie: 'Shree 420 (1955)',
    singer: 'Manna Dey, Lata Mangeshkar',
    music: 'Shankar-Jaikishan',
    lyricsBy: 'Shailendra',
    key: 'C Major (Sa = C)',
    bpm: 76,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['C', 'F', 'G', 'Am', 'Dm'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Pyaar hua iqrar hua, pyaar se phir kyun darte ho',
        chords: [
          { chord: 'C', word: 'Pyaar' },
          { chord: 'F', word: 'iqrar' },
        ],
        sargam: 'Sa Ga Pa Pa | Dha Dha Dha Dha',
        notes: [
          { note: 'C4', sargam: 'Sa', lyric: 'Pyaar', string: 2, fret: 1, beats: 1, freq: 261.63 },
          { note: 'F4', sargam: 'ma', lyric: 'hua', string: 1, fret: 1, beats: 1, freq: 349.23 },
        ],
      },
    ],
  },
  {
    id: 'lag_ja_gale',
    title: 'Lag Ja Gale',
    movie: 'Woh Kaun Thi (1964)',
    singer: 'Lata Mangeshkar',
    music: 'Madam Mohan',
    lyricsBy: 'Raja Mehdi Ali Khan',
    key: 'Bb Major (Sa = Bb)',
    bpm: 72,
    strum: 'D - D - D U D U',
    strumPatternVisual: '↓ - ↓ - ↓ ↑ ↓ ↑',
    chordsUsed: ['Bb', 'Eb', 'F', 'Gm', 'Cm'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Lag ja gale ke phir ye haseen raat ho na ho',
        chords: [
          { chord: 'Bb', word: 'Lag' },
          { chord: 'Eb', word: 'ho' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Sa',
        notes: [
          { note: 'Bb3', sargam: 'Sa', lyric: 'Lag', string: 3, fret: 1, beats: 1, freq: 233.08 },
          { note: 'Eb4', sargam: 'ma', lyric: 'ho', string: 3, fret: 1, beats: 1, freq: 311.13 },
        ],
      },
    ],
  },
  {
    id: 'tere_bina_zindagi',
    title: 'Tere Bina Zindagi Se',
    movie: 'Aandhi (1975)',
    singer: 'Lata Mangeshkar, Kishore Kumar',
    music: 'R.D. Burman',
    lyricsBy: 'Gulzar',
    key: 'C Major (Sa = C)',
    bpm: 78,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['C', 'F', 'G', 'Am', 'Em', 'Dm'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Tere bina zindagi se koi shikwa to nahi',
        chords: [
          { chord: 'C', word: 'Tere' },
          { chord: 'F', word: 'shikwa' },
        ],
        sargam: 'Sa Ga Pa Pa | Dha Dha Dha Dha',
        notes: [
          { note: 'C4', sargam: 'Sa', lyric: 'Tere', string: 2, fret: 1, beats: 1, freq: 261.63 },
          { note: 'F4', sargam: 'ma', lyric: 'bina', string: 1, fret: 1, beats: 1, freq: 349.23 },
        ],
      },
    ],
  },
  {
    id: 'chura_liya_hai',
    title: 'Chura Liya Hai Tumne',
    movie: 'Yaadon Ki Baaraat (1973)',
    singer: 'Mohammed Rafi, Asha Bhosle',
    music: 'R.D. Burman',
    lyricsBy: 'Majrooh Sultanpuri',
    key: 'D Major (Sa = D)',
    bpm: 90,
    strum: 'D - D U - U D U',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ ↑',
    chordsUsed: ['D', 'G', 'A', 'Bm', 'Em'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Chura liya hai tumne jo dil ko',
        chords: [
          { chord: 'D', word: 'Chura' },
          { chord: 'G', word: 'dil' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Sa',
        notes: [
          { note: 'D4', sargam: 'Sa', lyric: 'Chura', string: 3, fret: 0, beats: 1, freq: 293.66 },
          { note: 'G4', sargam: 'Pa', lyric: 'dil', string: 1, fret: 3, beats: 1, freq: 392.00 },
        ],
      },
    ],
  },
  {
    id: 'ek_laadki_ko_dekha',
    title: 'Ek Ladki Ko Dekha To Aisa Laga',
    movie: '1942: A Love Story (1994)',
    singer: 'Kumar Sanu',
    music: 'R.D. Burman',
    lyricsBy: 'Javed Akhtar',
    key: 'G Major (Sa = G)',
    bpm: 82,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['G', 'C', 'D', 'Em', 'Am'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Ek ladki ko dekha to aisa laga',
        chords: [
          { chord: 'G', word: 'Ek' },
          { chord: 'C', word: 'laga' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Sa',
        notes: [
          { note: 'G3', sargam: 'Sa', lyric: 'Ek', string: 3, fret: 0, beats: 1, freq: 196.00 },
          { note: 'C4', sargam: 'ma', lyric: 'laga', string: 2, fret: 1, beats: 1, freq: 261.63 },
        ],
      },
    ],
  },
  {
    id: 'pehla_nasha',
    title: 'Pehla Nasha',
    movie: 'Jo Jeeta Wohi Sikandar (1992)',
    singer: 'Udit Narayan, Sadhana Sargam',
    music: 'Jatin-Lalit',
    lyricsBy: 'Majrooh Sultanpuri',
    key: 'F Major (Sa = F)',
    bpm: 80,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['F', 'Bb', 'C', 'Dm', 'Gm'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Chaahe tum kuch na kaho, maine sun liya',
        chords: [
          { chord: 'F', word: 'Chaahe' },
          { chord: 'Bb', word: 'liya' },
        ],
        sargam: 'Sa Ga Pa Pa | Dha Dha Dha Dha',
        notes: [
          { note: 'F4', sargam: 'Sa', lyric: 'Chaahe', string: 1, fret: 1, beats: 1, freq: 349.23 },
          { note: 'Bb4', sargam: 'Dha', lyric: 'sun', string: 1, fret: 6, beats: 1, freq: 466.16 },
        ],
      },
    ],
  },
  {
    id: 'tu_hai_mere_dil',
    title: 'Tu Hai Meri Dil',
    movie: 'Dil (1990)',
    singer: 'Udit Narayan, Anuradha Paudwal',
    music: 'Anand-Milind',
    lyricsBy: 'Sameer',
    key: 'D Major (Sa = D)',
    bpm: 94,
    strum: 'D - D - D U D U',
    strumPatternVisual: '↓ - ↓ - ↓ ↑ ↓ ↑',
    chordsUsed: ['D', 'G', 'A', 'Bm', 'Em'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Tu hai meri dil, tu hai meri jaan',
        chords: [
          { chord: 'D', word: 'Tu' },
          { chord: 'G', word: 'jaan' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Sa',
        notes: [
          { note: 'D4', sargam: 'Sa', lyric: 'Tu', string: 3, fret: 0, beats: 1, freq: 293.66 },
          { note: 'G4', sargam: 'Pa', lyric: 'jaan', string: 1, fret: 3, beats: 1, freq: 392.00 },
        ],
      },
    ],
  },
  {
    id: 'dil_diyan_gallan',
    title: 'Dil Diyan Gallan',
    movie: 'Tiger Zinda Hai (2017)',
    singer: 'Atif Aslam',
    music: 'Vishal-Shekhar',
    lyricsBy: 'Irshad Kamil',
    key: 'A Major (Sa = A)',
    bpm: 76,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['A', 'E', 'F#m', 'D', 'Bm'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Dil diyan gallan karange, naal naal beh ke',
        chords: [
          { chord: 'A', word: 'Dil' },
          { chord: 'E', word: 'beh' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Sa',
        notes: [
          { note: 'A3', sargam: 'Sa', lyric: 'Dil', string: 2, fret: 0, beats: 1, freq: 220.00 },
          { note: 'E4', sargam: 'Pa', lyric: 'gallan', string: 1, fret: 0, beats: 1, freq: 329.63 },
        ],
      },
    ],
  },
  {
    id: 'raabta',
    title: 'Raabta',
    movie: 'Agent Vinod (2012)',
    singer: 'Arijit Singh, Joi Barua, Nikhita Gandhi',
    music: 'Pritam',
    lyricsBy: 'Amitabh Bhattacharya',
    key: 'C Major (Sa = C)',
    bpm: 84,
    strum: 'D - D - D U D U',
    strumPatternVisual: '↓ - ↓ - ↓ ↑ ↓ ↑',
    chordsUsed: ['C', 'Am', 'F', 'G', 'Em'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Kehte hain khuda ne iss jahan mein sabhi ke liye',
        chords: [
          { chord: 'C', word: 'Kehte' },
          { chord: 'Am', word: 'liye' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Sa',
        notes: [
          { note: 'C4', sargam: 'Sa', lyric: 'Kehte', string: 2, fret: 1, beats: 1, freq: 261.63 },
          { note: 'A3', sargam: 'ma', lyric: 'hain', string: 2, fret: 0, beats: 1, freq: 220.00 },
        ],
      },
    ],
  },
  {
    id: 'tera_yaar_hoon_main',
    title: 'Tera Yaar Hoon Main',
    movie: 'Sonu Ke Titu Ki Sweety (2018)',
    singer: 'Arijit Singh',
    music: 'Rochak Kohli',
    lyricsBy: 'Kumaar',
    key: 'G Major (Sa = G)',
    bpm: 78,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['G', 'Em', 'C', 'D', 'Bm'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Tu jo rootha toh kaun hansega',
        chords: [
          { chord: 'G', word: 'Tu' },
          { chord: 'Em', word: 'hansega' },
        ],
        sargam: 'Pa Ga Re Sa | Sa Re Ga ma Pa',
        notes: [
          { note: 'G3', sargam: 'Pa', lyric: 'Tu', string: 3, fret: 0, beats: 1, freq: 196.00 },
          { note: 'E4', sargam: 'Ga', lyric: 'rootha', string: 1, fret: 0, beats: 1, freq: 329.63 },
        ],
      },
    ],
  },
  {
    id: 'ilahi',
    title: 'Ilahi',
    movie: 'Yeh Jawaani Hai Deewani (2013)',
    singer: 'Arijit Singh',
    music: 'Pritam',
    lyricsBy: 'Amitabh Bhattacharya',
    key: 'G Major (Sa = G)',
    bpm: 118,
    strum: 'D - D U - U D U',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ ↑',
    chordsUsed: ['G', 'C', 'D', 'Em'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Shaamein malang si, raatein surang si',
        chords: [
          { chord: 'G', word: 'Shaamein' },
          { chord: 'C', word: 'si' },
        ],
        sargam: 'Sa Ga Pa Pa | ma Ga Re Sa',
        notes: [
          { note: 'G3', sargam: 'Sa', lyric: 'Shaamein', string: 3, fret: 0, beats: 1, freq: 196.00 },
          { note: 'C4', sargam: 'ma', lyric: 'malang', string: 2, fret: 1, beats: 1, freq: 261.63 },
        ],
      },
    ],
  },
  {
    id: 'subhanallah',
    title: 'Subhanallah',
    movie: 'Yeh Jawaani Hai Deewani (2013)',
    singer: 'Sreerama Chandra, Shilpa Rao',
    music: 'Pritam',
    lyricsBy: 'Amitabh Bhattacharya',
    key: 'D Major (Sa = D)',
    bpm: 90,
    strum: 'D - D - D U D U',
    strumPatternVisual: '↓ - ↓ - ↓ ↑ ↓ ↑',
    chordsUsed: ['D', 'G', 'A', 'Em'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Ek din kabhi jo khud ko taraashe',
        chords: [
          { chord: 'D', word: 'Ek' },
          { chord: 'G', word: 'taraashe' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Sa',
        notes: [
          { note: 'D4', sargam: 'Sa', lyric: 'Ek', string: 3, fret: 0, beats: 1, freq: 293.66 },
          { note: 'G4', sargam: 'Pa', lyric: 'din', string: 1, fret: 3, beats: 1, freq: 392.00 },
        ],
      },
    ],
  },
  {
    id: 'hawayein',
    title: 'Hawayein',
    movie: 'Jab Harry Met Sejal (2017)',
    singer: 'Arijit Singh',
    music: 'Pritam',
    lyricsBy: 'Irshad Kamil',
    key: 'G Major (Sa = G)',
    bpm: 82,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['G', 'Em', 'C', 'D'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Tujhko... main rakh loon wahaan',
        chords: [
          { chord: 'G', word: 'Tujhko' },
          { chord: 'Em', word: 'wahaan' },
        ],
        sargam: 'Sa Ga Pa Dha Pa | ma Ga Re Ga Sa',
        notes: [
          { note: 'G3', sargam: 'Sa', lyric: 'Tujhko', string: 3, fret: 0, beats: 1, freq: 196.00 },
          { note: 'E4', sargam: 'Ga', lyric: 'main', string: 1, fret: 0, beats: 1, freq: 329.63 },
        ],
      },
    ],
  },
  {
    id: 'tu_hai_kitna_pyaara',
    title: 'Tu Hai Kitna Pyaara',
    movie: 'Balika Vadhu (1976)',
    singer: 'Kishore Kumar',
    music: 'R.D. Burman',
    lyricsBy: 'Anand Bakshi',
    key: 'C Major (Sa = C)',
    bpm: 88,
    strum: 'D - D U - U D -',
    strumPatternVisual: '↓ - ↓ ↑ - ↑ ↓ -',
    chordsUsed: ['C', 'F', 'G', 'Am', 'Dm'],
    lines: [
      {
        section: 'Mukhda',
        text: 'Tu hai kitna pyaara, tu hai kitna pyaara',
        chords: [
          { chord: 'C', word: 'Tu' },
          { chord: 'F', word: 'pyaara' },
        ],
        sargam: 'Sa Re Ga Pa | ma Ga Re Sa',
        notes: [
          { note: 'C4', sargam: 'Sa', lyric: 'Tu', string: 2, fret: 1, beats: 1, freq: 261.63 },
          { note: 'F4', sargam: 'ma', lyric: 'kitna', string: 1, fret: 1, beats: 1, freq: 349.23 },
        ],
      },
    ],
  },
];

// Export for use in main.ts
// Export for use in main.ts
export { SONG_CATALOG as BUILTIN_SONGS };

export class SongStudio {
  private activeSongId = 'original-timing-study';
  private activeSong: CatalogSong | null = null;
  private isPlaying = false;
  private currentLineIdx = 0;
  private currentEventIndex = 0;
  private playMode: 'notes' | 'chords' = 'notes'; // 'notes' (Lead Tabs) vs 'chords' (Rhythm Strum)
  private bpm = 75;
  private isPracticeMicActive = false;
  private practiceScore = 0;
  private tuning: StringTuning[] = STANDARD_TUNING;
  private audioContext: AudioContext | null = null;
  private acousticBus: AcousticBus | null = null;
  private isControlsInitialized = false;
  // Transpose (semitones) + parsed original key for the target-key dropdown
  private transposeSemis = 0;
  private keyTonicPc = 0;
  private keyIsMinor = true;
  private keyKnown = true;
  private timeline: SongTiming | null = null;
  private timingMode: TimingMode = 'song';
  private speed = 1;
  private loop = false;
  private referenceAudio = true;
  private active = false;
  private startGeneration = 0;
  private micGeneration = 0;
  private gate = new PerformanceGate();
  private transport: SongTransport;
  private sources = new Set<AudioBufferSourceNode>();
  private auditionUntil = 0;
  private auditionGeneration = 0;
  private auditionPending = false;
  private capo = 0;
  private neck3d: PaneNeck3D | null = null;
  private displayedChord: string | null = null;
  public onMicStartRequested?: () => Promise<boolean>;
  public onPlayRequested?: () => Promise<void>;

  constructor(private getCatalog: () => CatalogSong[]) {
    this.transport = new SongTransport({
      now: () => this.audioContext?.currentTime ?? 0,
      setTimer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: id => window.clearTimeout(id),
    }, {
      play: (entry, at, end) => this.referenceAudio ? this.playEvent(entry.event, at, end) : () => {},
      target: entry => this.showEvent(entry.index),
      finish: () => { this.isPlaying = false; this.updateTransportUI(); this.status('End of chart. Restart or choose another event.'); },
      stalled: () => this.status('Playback resumed from the next event after a timing interruption.'),
    });
    window.addEventListener('pagehide', () => { this.stopPlayback(); this.onMicrophoneStopped(); });
  }

  setAudio(ctx: AudioContext, bus: AcousticBus): void {
    this.audioContext = ctx;
    this.acousticBus = bus;
  }

  setTuning(tuning: StringTuning[], capo = 0): void {
    this.stopPlayback();
    this.tuning = tuning.map(string => ({ ...string, note: NOTE_NAMES[string.midi % 12] }));
    this.capo = capo;
    this.updateFretboardLabels();
    if (this.displayedChord) this.renderChordOnFretboard(this.displayedChord);
    else this.renderSongFretboard();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) { this.stopPlayback(); this.micGeneration++; }
    this.neck3d?.setActive(active);
  }

  init(): void {
    this.buildSongFretboardUI();
    if (!this.isControlsInitialized) {
      this.initControls();
      this.setupNeck3D();
      this.isControlsInitialized = true;
      this.loadSong(this.activeSongId);
    }
    this.refreshCatalog();
    this.neck3d?.setActive(this.active);
  }

  private setupNeck3D(): void {
    const host = document.getElementById('song-neck-3d');
    if (!host || this.neck3d) return;
    this.neck3d = new PaneNeck3D(
      host,
      {
        toggle3d: document.getElementById('song-neck-view-3d'),
        toggle2d: document.getElementById('song-neck-view-2d'),
        twoD: document.getElementById('song-neck-2d'),
        camera: document.getElementById('song-neck-camera'),
        zoomIn: document.getElementById('song-neck-zoom-in'),
        zoomOut: document.getElementById('song-neck-zoom-out'),
        reset: document.getElementById('song-neck-reset'),
        help: document.getElementById('song-neck-help'),
      },
      (s, f) => { void this.onFretCellClick(s, f); },
      {
        defaultMode: '3d', preferenceKey: 'gcs-song-neck-view',
        help2d: 'Scroll the neck · Tab to a fret, then Enter to play',
      },
    );
  }

  /** Push the current chord voicing (or live lead note) to the optional 3D neck. */
  private updateNeck3D(noteItem: { string: number; fret: number } | null, chordName: string | null): void {
    if (!this.neck3d) return;
    const tuning = this.tuning;
    const empty: (number | null)[] = [null, null, null, null, null, null];
    if (noteItem) {
      const note = this.transposedNote(noteItem);
      if (note) empty[note.s] = note.f;
      this.neck3d.update({ frets: empty, tuning, liveMidi: null, root: note ? NOTE_NAMES[note.midi % 12] : null });
    } else if (chordName) {
      const frets = this.getChordFrets(chordName)?.map(f => f === null || f < 0 ? null : f) || empty;
      const parsed = parseChordSymbol(transposeChordName(chordName, this.capo));
      this.neck3d.update({ frets, tuning, liveMidi: null, root: parsed ? parsed.root : null });
    } else {
      this.neck3d.update({ frets: empty, tuning, liveMidi: null, root: null });
    }
    const caption = document.getElementById('song-neck-caption');
    if (caption) caption.textContent = chordName ? `${chordName} · song voicing${this.capo ? ` · sounds ${transposeChordName(chordName, this.capo)} with capo ${this.capo}` : ''}` : noteItem ? 'Target note · authored string/fret' : this.currentEvent()?.type === 'rest' ? 'Rest · no note to play' : 'Play along';
    const tuningLabel = document.getElementById('song-neck-tuning');
    if (tuningLabel) tuningLabel.textContent = [...tuning].reverse().map(s => s.note).join(' · ');
  }

  buildSongFretboardUI(): void {
    const rowsContainer = document.getElementById('song-fretboard-strings-rows');
    if (!rowsContainer || rowsContainer.children.length > 0) return;
    rowsContainer.innerHTML = '';

    for (let s = 0; s < 6; s++) {
      const strInfo = this.tuning[s] || STANDARD_TUNING[s];
      const row = document.createElement('div');
      row.className = 'guitar-string-row';
      row.id = `song-string-row-${s}`;

      const header = document.createElement('div');
      header.className = 'string-header';
      header.innerHTML = `<span id="song-str-status-${s}" style="width:18px; font-weight:800; color:var(--accent-gold);">-</span><span>${strInfo.note}</span>`;
      row.appendChild(header);

      const cellsContainer = document.createElement('div');
      cellsContainer.className = 'fret-cells-container';

      const wire = document.createElement('div');
      wire.className = `string-wire ${strInfo.gaugeClass || ('str-' + (s + 1))}`;
      wire.id = `song-string-wire-${s}`;
      cellsContainer.appendChild(wire);

      for (let f = 0; f <= 12; f++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'fret-cell';
        cell.id = `song-fret-cell-${s}-${f}`;
        cell.title = `String ${s + 1} (${strInfo.note}), Fret ${f}`;
        cell.setAttribute('aria-label', cell.title);
        cell.onclick = () => this.onFretCellClick(s, f);
        cellsContainer.appendChild(cell);
      }

      row.appendChild(cellsContainer);
      rowsContainer.appendChild(row);
    }
  }

  private updateFretboardLabels(): void {
    for (let s = 0; s < 6; s++) {
      const label = document.querySelector(`#song-string-row-${s} .string-header span:last-child`);
      if (label) label.textContent = this.tuning[s].note;
      for (let f = 0; f <= 12; f++) {
        const cell = document.getElementById(`song-fret-cell-${s}-${f}`);
        if (cell) {
          cell.title = `String ${s + 1} (${this.tuning[s].note}), Fret ${f}`;
          cell.setAttribute('aria-label', cell.title);
        }
      }
    }
  }

  private async onFretCellClick(s: number, f: number): Promise<void> {
    await this.audition({ type: 'note', string: s + 1, fret: f, beats: 1 }, 'down', false);
    if (!this.active) return;
    const wire = document.getElementById(`song-string-wire-${s}`);
    if (wire) {
      wire.classList.add('vibrating');
      setTimeout(() => wire?.classList.remove('vibrating'), 300);
    }
  }

  private initControls(): void {
    const select = document.getElementById('song-selector-select') as HTMLSelectElement;
    if (select) {
      this.refreshCatalog();
      select.onchange = () => this.loadSong(select.value);
    }

    // Transpose (target-key) dropdown
    const transposeSel = document.getElementById('song-transpose-select') as HTMLSelectElement;
    if (transposeSel) {
      this.populateTransposeSelect();
      transposeSel.onchange = () => this.setTranspose(parseInt(transposeSel.value) || 0);
    }

    // Play Mode buttons
    const notesBtn = document.getElementById('btn-mode-notes');
    const chordsBtn = document.getElementById('btn-mode-chords');
    if (notesBtn) notesBtn.onclick = () => this.setPlayMode('notes');
    if (chordsBtn) chordsBtn.onclick = () => this.setPlayMode('chords');

    // Playback buttons
    const playBtn = document.getElementById('btn-song-play');
    if (playBtn) playBtn.onclick = () => this.togglePlayback();

    const restartBtn = document.getElementById('btn-song-restart');
    if (restartBtn) restartBtn.onclick = () => this.restartPlayback();

    const prevBtn = document.getElementById('btn-step-prev');
    if (prevBtn) prevBtn.onclick = () => this.stepPrev();

    const nextBtn = document.getElementById('btn-step-next');
    if (nextBtn) nextBtn.onclick = () => this.stepNext();

    // Tempo slider
    const tempoSlider = document.getElementById('song-tempo-slider') as HTMLInputElement;
    if (tempoSlider) {
      tempoSlider.oninput = (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        this.setTempo(val);
      };
    }

    // Strum buttons for chords mode
    const strumDown = document.getElementById('btn-song-strum-down');
    const strumUp = document.getElementById('btn-song-strum-up');
    const strumPick = document.getElementById('btn-song-strum-pick');
    if (strumDown) strumDown.onclick = () => this.strumActiveChord('down');
    if (strumUp) strumUp.onclick = () => this.strumActiveChord('up');
    if (strumPick) strumPick.onclick = () => this.strumActiveChord('arpeggio');

    // Practice Mic toggle
    const micToggle = document.getElementById('btn-toggle-song-mic');
    if (micToggle) {
      micToggle.onclick = () => { void this.togglePracticeMic(); };
    }
    const mode = document.getElementById('song-timing-mode') as HTMLSelectElement;
    mode.onchange = () => {
      if (mode.value === 'fixed' || mode.value === 'song' || mode.value === 'wait') this.setTimingMode(mode.value);
    };
    const loop = document.getElementById('song-loop') as HTMLInputElement;
    loop.onchange = () => { this.stopPlayback(); this.loop = loop.checked; };
    const reference = document.getElementById('song-reference-audio') as HTMLInputElement;
    reference.onchange = () => { this.stopPlayback(); this.referenceAudio = reference.checked; };
    document.getElementById('btn-song-audition')!.onclick = () => { void this.audition(); };
  }

  refreshCatalog(): void {
    const select = document.getElementById('song-selector-select') as HTMLSelectElement | null;
    if (!select) return;
    try {
      select.replaceChildren();
      for (const song of this.getCatalog()) select.add(new Option(`${song.title} — ${song.artist}${song.isCustom ? ' (Imported)' : ''}`, song.id));
      select.value = this.activeSongId;
    } catch (error) { this.status(error instanceof Error ? error.message : String(error)); }
  }

  loadSong(songId: string, part?: 'notes' | 'chords'): boolean {
    this.stopPlayback();
    this.activeSongId = songId;
    try {
      this.activeSong = findSong(this.getCatalog(), songId);
      this.bpm = this.activeSong.timing?.bpm ?? this.activeSong.bpm;
      this.transposeSemis = 0;
      this.speed = 1;
      this.practiceScore = 0;
      document.getElementById('song-practice-score')!.textContent = '0';
      this.playMode = part ?? (this.activeSong.availability.chords ? 'chords' : 'notes');
      this.timeline = songTimeline(this.activeSong, this.playMode);
      this.parseSongKey();
      this.refreshCatalog();
      this.populateTransposeSelect();
      this.updateSongMetadataUI();
      this.renderChordsPalette();
      this.renderLyricsScrollView();
      this.showEvent(0);
      this.updateTransportUI();
      this.status(this.timeline.events.length ? 'Ready. Choose Song timing, Fixed tempo or Wait for me.' : 'Source/chart only: no supported playable events. Import or edit explicit timing to play.');
      return true;
    } catch (error) {
      this.activeSong = null; this.timeline = null;
      this.currentEventIndex = 0;
      this.renderSongFretboard();
      document.getElementById('song-display-title')!.textContent = 'Song unavailable';
      for (const id of ['song-display-meta', 'song-timing-status', 'song-source-text', 'song-chords-palette', 'lyrics-scroll-box', 'song-current-target']) {
        document.getElementById(id)!.textContent = '';
      }
      this.status(error instanceof Error ? error.message : String(error));
      this.updateTransportUI();
      return false;
    }
  }

  getSongForEditing(): { song: CatalogSong; timing: SongTiming } | null {
    return this.activeSong && this.timeline ? { song: this.activeSong, timing: this.timeline } : null;
  }

  private parseSongKey(): void {
    const key = String(this.activeSong?.key || '');
    const m = key.match(/^([A-G][#b]?)(?:\s|$|m)/);
    this.keyKnown = !!m;
    this.keyTonicPc = m && NOTE_TO_PC[m[1]] !== undefined ? NOTE_TO_PC[m[1]] : 0;
    this.keyIsMinor = /min|minor|\bm\b/i.test(key) || /minor/i.test(key);
  }

  /** Fill the transpose dropdown with the 12 target keys (same modality). */
  private populateTransposeSelect(): void {
    const sel = document.getElementById('song-transpose-select') as HTMLSelectElement | null;
    if (!sel) return;
    const mode = this.keyIsMinor ? 'Minor' : 'Major';
    sel.innerHTML = '';
    for (let semi = 0; semi < 12; semi++) {
      const pc = (this.keyTonicPc + semi) % 12;
      const opt = document.createElement('option');
      opt.value = String(semi);
      opt.textContent = this.keyKnown ? `${PC_NAMES[pc]} ${mode}` + (semi === 0 ? ' (original)' : '')
        : semi === 0 ? 'Original pitch (key unconfirmed)' : `+${semi} semitone${semi === 1 ? '' : 's'}`;
      sel.appendChild(opt);
    }
    sel.value = String(this.transposeSemis);
  }

  setTranspose(semis: number): void {
    this.stopPlayback();
    this.transposeSemis = ((semis % 12) + 12) % 12;
    this.updateSongMetadataUI();
    this.renderChordsPalette();
    this.renderLyricsScrollView();
    this.showEvent(this.currentEventIndex);
  }

  setPlayMode(mode: 'notes' | 'chords'): void {
    if (!this.activeSong || this.activeSong.timing) return;
    this.stopPlayback();
    this.playMode = mode;
    this.timeline = songTimeline(this.activeSong, mode);
    const notesBtn = document.getElementById('btn-mode-notes');
    const chordsBtn = document.getElementById('btn-mode-chords');
    const modeDesc = document.getElementById('song-mode-description');
    const hudNotes = document.getElementById('hud-notes-info');
    const hudChords = document.getElementById('hud-chords-info');
    const strumActions = document.getElementById('song-strum-actions');

    if (notesBtn) notesBtn.classList.toggle('active', mode === 'notes');
    if (chordsBtn) chordsBtn.classList.toggle('active', mode === 'chords');

    if (mode === 'notes') {
      if (modeDesc) modeDesc.textContent = 'Visualizing lead melody note-by-note on 3D guitar neck with exact frets & tabs';
      if (hudNotes) hudNotes.style.display = 'flex';
      if (hudChords) hudChords.style.display = 'none';
      if (strumActions) strumActions.style.display = 'none';
    } else {
      if (modeDesc) modeDesc.textContent = 'Strumming rhythm chord progression along with the song (No lead note plucks)';
      if (hudNotes) hudNotes.style.display = 'none';
      if (hudChords) hudChords.style.display = 'flex';
      if (strumActions) strumActions.style.display = 'flex';
    }

    this.showEvent(0);
    this.updateTransportUI();
  }

  setTempo(val: number): void {
    this.stopPlayback();
    if (this.timingMode === 'fixed') this.bpm = val;
    else this.speed = val / 100;
    this.showEvent(this.currentEventIndex);
    this.updateTransportUI();
  }

  togglePlayback(): void {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  async startPlayback(): Promise<void> {
    this.stopPlayback();
    if (!this.active || !this.timeline?.events.length) return;
    const generation = this.startGeneration;
    this.isPlaying = true;
    this.updateTransportUI();
    this.gate = new PerformanceGate();
    this.showEvent(this.currentEventIndex);
    if (this.timingMode === 'wait') {
      this.status(this.currentEvent()?.type === 'rest' ? 'Rest: take your time, then choose Next.' : 'Wait for me: stay quiet briefly, then play the target. Manual Next is always available.');
      if (!this.isPracticeMicActive) await this.requestPracticeMic();
      return;
    }
    try {
      if (this.onPlayRequested) await this.onPlayRequested();
      if (generation !== this.startGeneration || !this.active || !this.isPlaying) return;
      if (!this.audioContext) throw new Error('Audio is unavailable; try again after allowing browser audio.');
      const entries = compileTiming(this.timeline, this.timingMode, this.bpm, this.speed);
      if (this.referenceAudio) for (const entry of entries) {
        if (entry.event.type === 'note' && !this.transposedNote(entry.event)) throw new Error('A transposed note is outside frets 0–12. Lower transpose or edit the note.');
        if (entry.event.type === 'chord' && !this.getChordFrets(transposeChordName(entry.event.chord, this.transposeSemis))) throw new Error('A chord has no supported voicing in this tuning. Use Standard tuning or edit explicit notes.');
      }
      this.transport.start(entries, this.currentEventIndex, this.loop);
      this.status(this.referenceAudio ? 'Reference playback. Scoring is off while reference audio is enabled; use headphones.' : 'Timed practice. Play each target after a new attack.');
    } catch (error) {
      this.stopPlayback();
      this.status(error instanceof Error ? error.message : String(error));
    }
  }

  stopPlayback(): void {
    this.isPlaying = false;
    this.startGeneration++;
    this.auditionGeneration++;
    this.auditionPending = false;
    this.micGeneration++;
    this.transport.stop();
    this.sources.forEach(source => source.stop());
    this.sources.clear();
    this.auditionUntil = 0;
    this.gate.requireRelease();
    this.updateTransportUI();
  }

  restartPlayback(): void {
    this.stopPlayback();
    this.showEvent(0);
    this.status('Restarted at the first event. Press Play when ready.');
  }

  stepPrev(): void {
    this.seek(Math.max(0, this.currentEventIndex - 1));
  }

  stepNext(): void {
    if (!this.timeline) return;
    if (this.currentEventIndex + 1 >= this.timeline.events.length) {
      if (this.loop) this.seek(0);
      else { this.stopPlayback(); this.status('End of chart. Restart to practice again.'); }
    } else this.seek(this.currentEventIndex + 1);
  }

  private seek(index: number): void {
    const continueWaiting = this.isPlaying && this.timingMode === 'wait';
    this.stopPlayback();
    this.showEvent(index);
    if (continueWaiting) { this.isPlaying = true; this.updateTransportUI(); }
    this.status(this.currentEvent()?.type === 'rest' ? 'Rest: take your time, then choose Next.' : continueWaiting ? 'Play a new performance of this target, or choose Next.' : 'Paused at the selected event. Press Play to continue.');
  }

  private currentEvent(): SongEvent | undefined { return this.timeline?.events[this.currentEventIndex]; }

  private transposedNote(note: { string: number; fret: number }) {
    const position = resolveSongNote({ type: 'note', beats: 1, ...note }, this.tuning, this.transposeSemis);
    return position ? { ...position, freq: 440 * 2 ** ((position.midi - 69) / 12) } : null;
  }

  private showEvent(index: number): void {
    this.currentEventIndex = index;
    this.currentLineIdx = this.currentEvent()?.line ?? -1;
    this.displayedChord = null;
    this.gate.setTarget(this.practiceTarget(), Date.now());
    this.updateActiveStepUI();
  }

  setTimingMode(mode: TimingMode): void {
    this.stopPlayback();
    this.timingMode = mode;
    this.showEvent(this.currentEventIndex);
    this.updateTransportUI();
    this.status(mode === 'wait' ? 'Wait for me has no automatic target audio. Stay quiet briefly, play each target anew, or use Next. Rests need manual Next.' : 'Press Play. Changes restart timing from the selected event.');
  }

  private status(message: string): void {
    const status = document.getElementById('song-transport-status');
    if (status) status.textContent = message;
  }

  private updateTransportUI(): void {
    const play = document.getElementById('btn-song-play') as HTMLButtonElement | null;
    if (play) play.disabled = !this.timeline?.events.length;
    const text = document.getElementById('song-play-text');
    if (text) text.textContent = this.isPlaying ? 'Pause' : this.timingMode === 'wait' ? 'Start waiting' : 'Play';
    const icon = document.getElementById('song-play-icon');
    if (icon) icon.textContent = this.isPlaying ? '⏸' : '▶';
    const mode = document.getElementById('song-timing-mode') as HTMLSelectElement | null;
    if (mode) mode.value = this.timingMode;
    const slider = document.getElementById('song-tempo-slider') as HTMLInputElement | null;
    if (slider) {
      slider.min = this.timingMode === 'fixed' ? '20' : '25';
      slider.max = this.timingMode === 'fixed' ? '400' : '200';
      slider.value = String(this.timingMode === 'fixed' ? this.bpm : this.speed * 100);
      slider.disabled = this.timingMode === 'wait';
      slider.setAttribute('aria-label', this.timingMode === 'fixed' ? 'Fixed beats per minute' : 'Song timing speed percent');
    }
    const readout = document.getElementById('song-tempo-readout');
    if (readout) readout.textContent = this.timingMode === 'fixed' ? `${this.bpm} BPM` : this.timingMode === 'wait' ? 'Self-paced' : `${Math.round(this.speed * 100)}% speed`;
    const reference = document.getElementById('song-reference-audio') as HTMLInputElement | null;
    if (reference) reference.disabled = this.timingMode === 'wait';
    const edit = document.getElementById('song-edit-timing') as HTMLButtonElement | null;
    if (edit) edit.disabled = !this.activeSong;
    const parts = document.getElementById('song-part-selector');
    if (parts) parts.hidden = !!this.activeSong?.timing;
    for (const part of ['notes', 'chords'] as const) {
      const button = document.getElementById(`btn-mode-${part}`) as HTMLButtonElement | null;
      if (button) {
        button.disabled = !!this.activeSong?.timing || !this.activeSong?.availability[part === 'notes' ? 'tabs' : 'chords'];
        button.classList.toggle('active', part === this.playMode);
      }
    }
  }

  private practiceTarget(): PracticeTarget {
    const event = this.currentEvent();
    if (event?.type === 'chord') return { type: 'chord', chord: transposeChordName(event.chord, this.transposeSemis + this.capo) };
    if (event?.type === 'note') {
      const note = this.transposedNote(event);
      if (note) return { type: 'note', midi: note.midi };
    }
    return { type: 'rest' };
  }

  private playEvent(event: SongEvent, start: number, end: number, style: 'down' | 'up' | 'arpeggio' = 'down', transpose = true): () => void {
    const ctx = this.audioContext, bus = this.acousticBus;
    if (!ctx || !bus || event.type === 'rest') return () => {};
    let sources: AudioBufferSourceNode[] = [];
    if (event.type === 'note') {
      const note = resolveSongNote(event, this.tuning, transpose ? this.transposeSemis : 0);
      if (!note) return () => {};
      sources = [playAcousticString(ctx, bus, { freq: 440 * 2 ** ((note.midi - 69) / 12), stringIndex: note.s, startTime: start, endTime: end, velocity: 0.9 })];
    } else {
      const frets = this.getChordFrets(transposeChordName(event.chord, this.transposeSemis));
      if (!frets) return () => {};
      sources = strumChord(ctx, bus, { frets, style, velocity: 0.85, tuning: this.tuning, startTime: start, endTime: end, humanize: false });
    }
    for (const source of sources) {
      this.sources.add(source);
      source.stop(end);
      source.addEventListener('ended', () => { this.sources.delete(source); source.disconnect(); }, { once: true });
    }
    return () => sources.forEach(source => { if (this.sources.delete(source)) source.stop(); });
  }

  async audition(event = this.currentEvent(), style: 'down' | 'up' | 'arpeggio' = 'down', transpose = true): Promise<void> {
    if (!event || event.type === 'rest') { this.status('This event is a rest. Use Next when ready.'); return; }
    if (this.isPlaying && this.timingMode !== 'wait') this.stopPlayback();
    const generation = this.startGeneration;
    const auditionGeneration = ++this.auditionGeneration;
    this.auditionPending = true;
    this.gate.requireRelease();
    try {
      if (this.onPlayRequested) await this.onPlayRequested();
      if (generation !== this.startGeneration || auditionGeneration !== this.auditionGeneration || !this.active || !this.audioContext) return;
      if (event.type === 'note' && !resolveSongNote(event, this.tuning, transpose ? this.transposeSemis : 0)) throw new Error('Transposed note is outside the supported range.');
      if (event.type === 'chord' && !this.getChordFrets(transposeChordName(event.chord, this.transposeSemis))) throw new Error('No supported voicing in this tuning.');
      this.sources.forEach(source => source.stop());
      this.sources.clear();
      this.auditionUntil = this.audioContext.currentTime + 2;
      this.playEvent(event, this.audioContext.currentTime + 0.02, this.auditionUntil, style, transpose);
      this.status('Audition only — not scored. Use headphones; let it finish, stay quiet, then play a new attack.');
    } catch (error) { this.status(`Audition unavailable: ${error instanceof Error ? error.message : String(error)}`); }
    finally { if (auditionGeneration === this.auditionGeneration) this.auditionPending = false; }
  }

  private updateActiveStepUI(): void {
    const event = this.currentEvent();
    const note = event?.type === 'note' ? this.transposedNote(event) : null;
    const chord = event?.type === 'chord' ? transposeChordName(event.chord, this.transposeSemis) : null;
    const entry = this.timeline?.events.length ? compileTiming(this.timeline, this.timingMode === 'fixed' ? 'fixed' : 'song', this.bpm, this.speed)[this.currentEventIndex] : null;
    const target = document.getElementById('song-current-target');
    if (target) target.textContent = !event ? 'No playable target' : `${this.currentEventIndex + 1}/${this.timeline!.events.length} · ${chord || (note ? `${NOTE_NAMES[note.midi % 12]}${Math.floor(note.midi / 12) - 1}` : event.type === 'rest' ? 'Rest' : 'Note out of range')} · ${event.beats} beats${this.timingMode === 'wait' ? ' · waiting for you' : ` · starts at ${entry?.bpm.toFixed(0)} BPM`}${chord && chordIdentity(chord)?.bass ? ' · inversion not graded; use Next' : ''}`;
    if (target && chord && this.capo) target.textContent += ` · sounds ${transposeChordName(chord, this.capo)} (capo ${this.capo})`;
    const hudNotes = document.getElementById('hud-notes-info');
    const hudChords = document.getElementById('hud-chords-info');
    if (hudNotes) hudNotes.style.display = note ? 'flex' : 'none';
    if (hudChords) hudChords.style.display = chord ? 'flex' : 'none';
    if (note) {
      const { s: sIdx, f: fretVal, freq: freqVal } = note;
      const midi = this.tuning[sIdx].midi + fretVal;
      const noteName = NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);


      const westernEl = document.getElementById('lead-active-western');
      const strEl = document.getElementById('lead-active-string');
      const fretEl = document.getElementById('lead-active-fret');
      const hzEl = document.getElementById('lead-active-hz');
      const tabEl = document.getElementById('lead-active-tab');
      const counterEl = document.getElementById('song-note-counter');

      if (westernEl) westernEl.textContent = noteName;
      if (strEl) strEl.textContent = `String ${sIdx + 1} (${NOTE_NAMES[this.tuning[sIdx].midi % 12]})`;
      if (fretEl) fretEl.textContent = fretVal === 0 ? 'Open String' : `Fret ${fretVal}`;
      if (hzEl) hzEl.textContent = `${freqVal.toFixed(1)} Hz`;
      if (tabEl) tabEl.textContent = `${this.tuning[sIdx].note}|--${fretVal}--`;
      if (counterEl) counterEl.textContent = `${this.currentEventIndex + 1} / ${this.timeline?.events.length || 0}`;
    }

    this.renderSongFretboard();

    // Update active line highlighting and scroll
    document.querySelectorAll('.lyric-line-item').forEach((el, idx) => {
      el.classList.toggle('active-line', idx === this.currentLineIdx);
    });
    // Scroll only the lyrics container, not the whole page. Using
    // scrollIntoView here repeatedly scrolled the entire viewport every step
    // and made the page unusable during playback.
    const activeEl = document.getElementById(`lyric-line-${this.currentLineIdx}`) as HTMLElement | null;
    const box = document.getElementById('lyrics-scroll-box');
    if (activeEl && box) {
      box.scrollTop = activeEl.offsetTop - box.clientHeight / 2 + activeEl.clientHeight / 2;
    }

  }

  private currentStepChord(): string | null {
    const event = this.currentEvent();
    return event?.type === 'chord' ? transposeChordName(event.chord, this.transposeSemis) : null;
  }

  private renderSongFretboard(): void {
    this.displayedChord = null;
    // Clear all status labels and fret cells
    for (let s = 0; s < 6; s++) {
      const statusEl = document.getElementById('song-str-status-' + s);
      if (statusEl) {
        statusEl.textContent = '-';
        statusEl.style.color = 'var(--text-muted)';
      }
      for (let f = 0; f <= 12; f++) {
        const cell = document.getElementById(`song-fret-cell-${s}-${f}`);
        if (cell) cell.innerHTML = '';
      }
    }

    const event = this.currentEvent();
    if (!event || event.type === 'rest') {
      this.updateNeck3D(null, null);
      return;
    }
    if (event.type === 'note') {
      const note = this.transposedNote(event);
      if (!note) {
        this.updateNeck3D(null, null);
        return;
      }
      this.updateNeck3D(event, null);
      const { s: sIdx, f: fIdx } = note;
      const midi = this.tuning[sIdx].midi + fIdx;
      const dotLabel = NOTE_NAMES[((midi % 12) + 12) % 12];

      for (let s = 0; s < 6; s++) {
        const statusEl = document.getElementById('song-str-status-' + s);
        if (statusEl) {
          if (s === sIdx) {
            statusEl.textContent = fIdx === 0 ? 'O' : String(fIdx);
            statusEl.style.color = 'var(--accent-gold)';
          } else {
            statusEl.textContent = '-';
            statusEl.style.color = 'var(--text-muted)';
          }
        }
      }

      const activeCell = document.getElementById(`song-fret-cell-${sIdx}-${fIdx}`);
      if (activeCell) {
        const dot = document.createElement('div');
        dot.className = 'finger-dot';
        dot.style.background = 'linear-gradient(135deg, #00e5ff, #0284c7)';
        dot.style.boxShadow = '0 0 16px rgba(0, 229, 255, 0.9)';
        dot.style.color = '#000';
        dot.textContent = dotLabel;
        activeCell.appendChild(dot);
      }
    } else {
      // CHORDS MODE (and stub-song chord playback): show the chord fingering shape
      const chord = this.currentStepChord();
      if (chord) this.renderChordOnFretboard(chord);
      else this.updateNeck3D(null, null);
    }
  }

  private updateSongMetadataUI(): void {
    const song = this.activeSong;
    if (!song) return;

    const titleEl = document.getElementById('song-display-title');
    const metaEl = document.getElementById('song-display-meta');
    const keyEl = document.getElementById('song-pill-key');
    const chordsEl = document.getElementById('song-pill-chords');
    const strumEl = document.getElementById('song-pill-strum');
    const bpmEl = document.getElementById('song-pill-bpm');
    const strumVisual = document.getElementById('song-strum-pattern-visual');

    if (titleEl) titleEl.innerHTML = `🎸 ${esc(song.title)}`;
    const artist = song.artist || song.singer || 'Acoustic';
    const album = song.album || song.movie || '';
    const keyLabel = this.transposeSemis
      ? this.keyKnown ? `${PC_NAMES[(this.keyTonicPc + this.transposeSemis) % 12]} ${this.keyIsMinor ? 'Minor' : 'Major'} (transposed +${this.transposeSemis})`
        : `Unconfirmed key · transposed +${this.transposeSemis} semitones`
      : song.key;
    if (metaEl) metaEl.textContent = `Artist: ${artist}${album ? ' • Album: ' + album : ''} • Key: ${keyLabel}`;
    if (keyEl) keyEl.textContent = keyLabel;
    if (chordsEl) chordsEl.textContent = (song.chordsUsed || []).map((c: string) => transposeChordName(c, this.transposeSemis)).join(', ');
    if (strumEl) strumEl.textContent = song.strum;
    if (bpmEl) bpmEl.textContent = `${song.bpm} BPM`;
    if (strumVisual) strumVisual.textContent = song.strumPatternVisual || song.strum;

    document.getElementById('song-timing-status')!.textContent = [...song.availability.labels, ...song.warnings, song.source, song.versionLabel].filter(Boolean).join(' · ');
    const source = document.getElementById('song-source-text');
    if (source) source.textContent = song.sourceText || 'No source text supplied.';
    document.getElementById('song-mode-description')!.textContent = song.timing ? 'Authored event sequence (chords, notes and rests). Edit timing to change this arrangement.' : 'Choose the available chord chart or melody excerpt. Timings are approximate, not a verified arrangement.';
    this.updateTransportUI();
  }

  private renderChordsPalette(): void {
    const palette = document.getElementById('song-chords-palette');
    if (!palette) return;

    palette.innerHTML = '';
    const chords = this.activeSong?.chordsUsed || [];
    chords.forEach((chord: string) => {
      const t = transposeChordName(chord, this.transposeSemis);
      const chip = document.createElement('button');
      chip.className = 'chord-tag-badge';
      chip.style.cursor = 'pointer';
      chip.innerHTML = `<span>▶️</span> ${esc(t)}`;
      chip.onclick = async () => {
        if (this.isPlaying && this.timingMode !== 'wait') this.stopPlayback();
        if (!this.isPlaying) this.renderChordOnFretboard(t);
        await this.audition({ type: 'chord', chord, beats: 2 });
      };
      palette.appendChild(chip);
    });
  }

  renderChordOnFretboard(chord: string): void {
    this.displayedChord = chord;
    this.updateNeck3D(null, chord);
    const frets = this.getChordFrets(chord);
    const chNameEl = document.getElementById('hud-chord-name');
    const chFretsEl = document.getElementById('hud-chord-frets');
    if (chNameEl) chNameEl.textContent = chord;
    if (chFretsEl && frets) {
      chFretsEl.textContent = frets.map(f => (f === null || f === -1 ? 'x' : String(f))).reverse().join(' ');
    }
    if (!frets) {
      this.updateNeck3D(null, null);
      this.status(`No supported ${chord} voicing in the current tuning/range. Use Standard tuning, explicit note events, or manual Next.`);
    }

    for (let s = 0; s < 6; s++) {
      const fret = frets?.[s] ?? null;
      const statusEl = document.getElementById('song-str-status-' + s);
      if (statusEl) {
        if (fret === -1 || fret === null) {
          statusEl.textContent = 'X';
          statusEl.style.color = '#ef4444';
        } else if (fret === 0) {
          statusEl.textContent = 'O';
          statusEl.style.color = '#34d399';
        } else {
          statusEl.textContent = String(fret);
          statusEl.style.color = 'var(--accent-gold)';
        }
      }
      for (let f = 0; f <= 12; f++) {
        const cell = document.getElementById(`song-fret-cell-${s}-${f}`);
        if (cell) cell.innerHTML = '';
      }
      if (fret !== null && fret >= 0 && fret <= 12) {
        const cell = document.getElementById(`song-fret-cell-${s}-${fret}`);
        if (cell) {
          const dot = document.createElement('div');
          dot.className = 'finger-dot';
          dot.style.background = 'linear-gradient(135deg, #ffb300, #f59e0b)';
          dot.style.boxShadow = '0 0 12px rgba(255, 179, 0, 0.7)';
          const strTuning = this.tuning[s] || STANDARD_TUNING[s];
          const midi = strTuning.midi + fret;
          dot.textContent = NOTE_NAMES[midi % 12];
          cell.appendChild(dot);
        }
      }
    }
  }

  private renderLyricsScrollView(): void {
    const box = document.getElementById('lyrics-scroll-box');
    if (!box) return;

    box.innerHTML = '';
    const lines = this.activeSong?.lines || [];
    lines.forEach((line, idx) => {
      const lineDiv = document.createElement('div');
      lineDiv.className = `lyric-line-item ${idx === this.currentLineIdx ? 'active-line' : ''}`;
      lineDiv.id = `lyric-line-${idx}`;

      let chordsRow = '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:4px;">';
      if (line.chords) {
        line.chords.forEach(c => {
          const tc = transposeChordName(c.chord, this.transposeSemis);
          chordsRow += `<span class="chord-tag-badge">${esc(tc)} <span style="font-size:0.7rem; color:var(--text-muted); font-weight:normal;">(${esc(c.word)})</span></span>`;
        });
      }
      chordsRow += '</div>';

      lineDiv.innerHTML = `
        <div style="font-size:0.75rem; color:var(--accent-gold); font-weight:700; margin-bottom:2px;">${esc(line.section || `Section ${idx + 1}`)}</div>
        ${chordsRow}
        <div style="font-size:0.95rem; color:#fff; font-weight:500;">${esc(line.text)}</div>
      `;

      lineDiv.onclick = () => {
        const index = this.timeline?.events.findIndex(event => event.line === idx) ?? -1;
        if (index >= 0) this.seek(index);
        else this.status('This line has no playable event in the selected part.');
      };

      box.appendChild(lineDiv);
    });
  }

  private async strumActiveChord(style: 'down' | 'up' | 'arpeggio'): Promise<void> {
    await this.audition(this.currentEvent(), style);
  }

  private getChordFrets(chordSymbol: string): (number | null)[] | null {
    const parsed = chordIdentity(chordSymbol);
    if (!parsed) return null;
    const shapeTuning = this.tuning.map(string => ({ ...string, midi: string.midi - this.capo }));
    const def = buildChordDefinition(parsed.root, parsed.quality, shapeTuning);
    const expected = CHORD_FORMULAS[parsed.quality].map(interval => (PITCH_CLASSES[parsed.root] + interval) % 12);
    const candidates = [CHORD_PRESETS[chordSymbol]?.frets, ...def.voicings.map(v => v.frets)];
    return candidates.find(frets => {
      if (!frets || frets.some(f => f !== null && (f < 0 || f > 12))) return false;
      const midis = frets.flatMap((f, s) => f === null ? [] : [shapeTuning[s].midi + f]);
      const pcs = new Set(midis.map(m => m % 12));
      return pcs.size === new Set(expected).size && expected.every(pc => pcs.has(pc)) &&
        (!parsed.bass || Math.min(...midis) % 12 === PITCH_CLASSES[parsed.bass]);
    }) ?? null;
  }

  async togglePracticeMic(): Promise<void> {
    if (this.isPracticeMicActive) { this.onMicrophoneStopped(); return; }
    await this.requestPracticeMic();
  }

  private async requestPracticeMic(): Promise<void> {
    const generation = ++this.micGeneration;
    const label = document.getElementById('song-mic-status-label');
    const button = document.getElementById('btn-toggle-song-mic') as HTMLButtonElement | null;
    if (label) label.textContent = 'Allow access…';
    if (button) button.disabled = true;
    try {
      if (!this.onMicStartRequested) throw new Error('Microphone is unavailable.');
      const started = await this.onMicStartRequested();
      if (generation !== this.micGeneration || !this.active) return;
      this.isPracticeMicActive = started;
      this.gate.requireRelease();
      if (label) label.textContent = started ? 'ON' : 'Retry';
      button?.classList.toggle('active', started);
      this.status(started ? 'Mic ready. Stay quiet briefly, then play a new target performance. Use headphones for auditions.' : 'Microphone unavailable or permission denied. Retry Practice Mic or use manual Next; Wait mode will not skip.');
    } catch (error) {
      this.onMicrophoneStopped();
      this.status(`Microphone unavailable: ${error instanceof Error ? error.message : String(error)}. Retry or use Next.`);
    } finally {
      if (button) button.disabled = false;
      if (generation !== this.micGeneration && !this.isPracticeMicActive && label) label.textContent = 'OFF / Retry';
    }
  }

  onMicrophoneStopped(): void {
    this.micGeneration++;
    this.isPracticeMicActive = false;
    this.gate.requireRelease();
    const label = document.getElementById('song-mic-status-label');
    if (label) label.textContent = 'OFF / Retry';
    document.getElementById('btn-toggle-song-mic')?.classList.remove('active');
    if (this.isPlaying && this.timingMode === 'wait') this.status('Microphone stopped. Retry Practice Mic or use manual Next. Your target is unchanged.');
  }

  evaluatePractice(result: DetectionResult): void {
    if (!this.isPracticeMicActive || !this.isPlaying || !this.active) return;
    if (this.timingMode !== 'wait' && this.referenceAudio) return;
    if (this.auditionPending || (this.audioContext && this.audioContext.currentTime < this.auditionUntil)) { this.gate.requireRelease(); return; }
    if (!this.gate.consume(result)) return;
    this.practiceScore += 10;
    document.getElementById('song-practice-score')!.textContent = String(this.practiceScore);
    document.getElementById('eval-feedback-badge')!.textContent = 'Target matched (+10). Play each new target with a new attack.';
    if (this.timingMode === 'wait') {
      // Keep the accepted performance ID across targets; no frame-level dedupe.
      if (this.timeline && this.currentEventIndex + 1 < this.timeline.events.length) this.showEvent(this.currentEventIndex + 1);
      else if (this.loop) this.showEvent(0);
      else { this.stopPlayback(); this.status('Completed. Restart to practice again.'); }
      if (this.currentEvent()?.type === 'rest' && this.isPlaying) this.status('Rest: take your time, then choose Next.');
      else if (this.isPlaying) this.status('Matched. Play the new target with a new attack, or use Next.');
    }
  }
}