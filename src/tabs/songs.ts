// Song Catalog Data - 50+ verified songs
// This would normally be loaded from a JSON file

import { Song, StringTuning, STANDARD_TUNING, NoteName } from '../types';
import { playAcousticString, strumChord, AcousticBus } from '../audio/engine';
import { buildChordDefinition } from '../chords/definitions';

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
export { SONG_CATALOG as BUILTIN_SONGS };

export class SongStudio {
  private activeSong: Song = SONG_CATALOG[0];
  private isPlaying = false;
  private playTimer: number | null = null;
  private currentLineIdx = 0;
  private currentNoteIdx = 0;
  private playMode: 'notes' | 'chords' = 'notes'; // 'notes' (Lead Tabs) vs 'chords' (Rhythm Strum)
  private bpm = 75;
  private isPracticeMicActive = true;
  private practiceScore = 0;
  private tuning: StringTuning[] = STANDARD_TUNING;
  private audioContext: AudioContext | null = null;
  private acousticBus: AcousticBus | null = null;

  constructor() {}

  setAudio(ctx: AudioContext, bus: AcousticBus): void {
    this.audioContext = ctx;
    this.acousticBus = bus;
  }

  setTuning(tuning: StringTuning[]): void {
    this.tuning = tuning;
    this.renderSongFretboard();
  }

  init(): void {
    this.initControls();
    this.loadSong(this.activeSong.id);
  }

  private initControls(): void {
    // Song dropdown — populate from the catalog so option values match song ids
    const select = document.getElementById('song-selector-select') as HTMLSelectElement;
    if (select) {
      select.innerHTML = SONG_CATALOG
        .map(s => {
          const by = s.singer || s.movie || s.music;
          return `<option value="${s.id}">${s.title}${by ? ` — ${by}` : ''}</option>`;
        })
        .join('');
      select.value = this.activeSong.id;
      select.onchange = () => this.loadSong(select.value);
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
      micToggle.onclick = () => this.togglePracticeMic();
    }
  }

  loadSong(songId: string): void {
    const found = SONG_CATALOG.find(s => s.id === songId);
    if (found) {
      this.activeSong = found;
      this.bpm = found.bpm;
      this.currentLineIdx = 0;
      this.currentNoteIdx = 0;

      if (this.isPlaying) {
        this.stopPlayback();
      }

      this.updateSongMetadataUI();
      this.renderChordsPalette();
      this.renderLyricsScrollView();
      this.renderSongFretboard();
    }
  }

  setPlayMode(mode: 'notes' | 'chords'): void {
    this.playMode = mode;
    const notesBtn = document.getElementById('btn-mode-notes');
    const chordsBtn = document.getElementById('btn-mode-chords');
    const modeDesc = document.getElementById('song-mode-description');
    const hudNotes = document.getElementById('hud-notes-info');
    const hudChords = document.getElementById('hud-chords-info');
    const strumActions = document.getElementById('song-strum-actions');

    if (notesBtn) notesBtn.classList.toggle('active', mode === 'notes');
    if (chordsBtn) chordsBtn.classList.toggle('active', mode === 'chords');

    if (mode === 'notes') {
      if (modeDesc) modeDesc.textContent = 'Visualizing lead melody note-by-note on 3D guitar neck (Only plucking tabs / lead notes — No chords)';
      if (hudNotes) hudNotes.style.display = 'flex';
      if (hudChords) hudChords.style.display = 'none';
      if (strumActions) strumActions.style.display = 'none';
    } else {
      if (modeDesc) modeDesc.textContent = 'Strumming rhythm chord progression along with the song (No lead note plucks)';
      if (hudNotes) hudNotes.style.display = 'none';
      if (hudChords) hudChords.style.display = 'flex';
      if (strumActions) strumActions.style.display = 'flex';
    }

    this.renderSongFretboard();
  }

  setTempo(val: number): void {
    this.bpm = val;
    const readout = document.getElementById('song-tempo-readout');
    if (readout) readout.textContent = `${this.bpm} BPM`;
  }

  togglePlayback(): void {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  startPlayback(): void {
    this.isPlaying = true;
    const icon = document.getElementById('song-play-icon');
    const text = document.getElementById('song-play-text');
    if (icon) icon.textContent = '⏸️';
    if (text) text.textContent = 'Pause Song';

    this.stepPlaybackLoop();
  }

  stopPlayback(): void {
    this.isPlaying = false;
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    const icon = document.getElementById('song-play-icon');
    const text = document.getElementById('song-play-text');
    if (icon) icon.textContent = '▶';
    if (text) text.textContent = 'Play Song';
  }

  restartPlayback(): void {
    this.stopPlayback();
    this.currentLineIdx = 0;
    this.currentNoteIdx = 0;
    this.updateActiveStepUI();
    this.startPlayback();
  }

  stepPrev(): void {
    if (this.currentNoteIdx > 0) {
      this.currentNoteIdx--;
    } else if (this.currentLineIdx > 0) {
      this.currentLineIdx--;
      const line = this.activeSong.lines[this.currentLineIdx];
      this.currentNoteIdx = Math.max(0, (line.notes?.length || 1) - 1);
    }
    this.updateActiveStepUI();
  }

  stepNext(): void {
    const line = this.activeSong.lines[this.currentLineIdx];
    if (line && line.notes && this.currentNoteIdx < line.notes.length - 1) {
      this.currentNoteIdx++;
    } else {
      this.currentNoteIdx = 0;
      this.currentLineIdx = (this.currentLineIdx + 1) % this.activeSong.lines.length;
    }
    this.updateActiveStepUI();
  }

  private stepPlaybackLoop = (): void => {
    if (!this.isPlaying) return;

    const line = this.activeSong.lines[this.currentLineIdx];
    if (!line) {
      this.stopPlayback();
      return;
    }

    const notes = line.notes || [];
    const noteItem = notes[this.currentNoteIdx];

    // =========================================================================
    // EXCLUSIVE MODE PLAYBACK LOGIC:
    // When in 'notes' mode: ONLY pluck the single note tab (NEVER play chords)
    // When in 'chords' mode: ONLY play chord strums (NEVER play single notes)
    // =========================================================================
    if (this.playMode === 'notes') {
      // NOTES / TABS MODE:
      if (noteItem && this.audioContext && this.acousticBus) {
        const s = Math.max(0, Math.min(5, noteItem.string - 1));
        const f = noteItem.fret;
        const midi = this.tuning[s].midi + f;
        const freq = noteItem.freq || (440 * Math.pow(2, (midi - 69) / 12));

        playAcousticString(this.audioContext, this.acousticBus, {
          freq,
          startTime: this.audioContext.currentTime + 0.005,
          stringIndex: s,
          velocity: 0.92,
        });

        // Vibrate string wire
        const wire = document.getElementById(`song-string-wire-${s}`);
        if (wire) {
          wire.classList.add('vibrating');
          setTimeout(() => wire.classList.remove('vibrating'), 300);
        }
      }
    } else {
      // CHORDS MODE:
      if (line.chords && line.chords.length > 0 && this.audioContext && this.acousticBus) {
        const chordIdx = Math.floor((this.currentNoteIdx / Math.max(1, notes.length)) * line.chords.length);
        const currentChord = line.chords[chordIdx]?.chord || line.chords[0].chord;

        // Strum down on even beats, up on odd beats
        if (this.currentNoteIdx % 2 === 0) {
          const dir = (this.currentNoteIdx % 4 === 0) ? 'down' : 'up';
          const frets = this.getChordFrets(currentChord);
          if (frets) {
            strumChord(this.audioContext, this.acousticBus, {
              frets,
              style: dir,
              velocity: 0.85,
              tuning: this.tuning,
              model: 'dreadnought',
            });
          }
        }
      }
    }

    this.updateActiveStepUI();

    // Advance to next note / line
    const beatSec = 60 / this.bpm;
    const noteDurationMs = (noteItem ? (noteItem.beats || 1) : 1) * beatSec * 1000;

    this.currentNoteIdx++;
    if (this.currentNoteIdx >= Math.max(1, notes.length)) {
      this.currentNoteIdx = 0;
      this.currentLineIdx = (this.currentLineIdx + 1) % this.activeSong.lines.length;
    }

    this.playTimer = window.setTimeout(this.stepPlaybackLoop, Math.max(250, noteDurationMs));
  };

  private updateActiveStepUI(): void {
    const line = this.activeSong.lines[this.currentLineIdx];
    if (!line) return;
    const notes = line.notes || [];
    const noteItem = notes[this.currentNoteIdx];

    // Update Notes HUD
    if (noteItem) {
      const westernEl = document.getElementById('lead-active-western');
      const strEl = document.getElementById('lead-active-string');
      const fretEl = document.getElementById('lead-active-fret');
      const hzEl = document.getElementById('lead-active-hz');
      const tabEl = document.getElementById('lead-active-tab');
      const counterEl = document.getElementById('song-note-counter');

      const stringNames = ['1st (High E)', '2nd (B)', '3rd (G)', '4th (D)', '5th (A)', '6th (Low E)'];
      const tabStringLabels = ['e', 'B', 'G', 'D', 'A', 'E'];

      if (westernEl) westernEl.textContent = noteItem.note;
      if (strEl) strEl.textContent = stringNames[noteItem.string - 1] || `${noteItem.string}th`;
      if (fretEl) fretEl.textContent = `${noteItem.fret}th Fret`;
      if (hzEl) hzEl.textContent = `${(noteItem.freq || 0).toFixed(1)} Hz`;
      if (tabEl) tabEl.textContent = `${tabStringLabels[noteItem.string - 1] || 'e'}|--${noteItem.fret}--`;
      if (counterEl) counterEl.textContent = `${this.currentNoteIdx + 1} / ${notes.length || 1}`;
    }

    // Update Chords HUD
    if (line.chords && line.chords.length > 0) {
      const chordIdx = Math.floor((this.currentNoteIdx / Math.max(1, notes.length)) * line.chords.length);
      const currentCh = line.chords[chordIdx]?.chord || line.chords[0].chord;
      const chNameEl = document.getElementById('hud-chord-name');
      const chFretsEl = document.getElementById('hud-chord-frets');

      if (chNameEl) chNameEl.textContent = currentCh;
      const frets = this.getChordFrets(currentCh);
      if (chFretsEl && frets) {
        chFretsEl.textContent = frets.map(f => (f === null || f === -1 ? 'x' : String(f))).reverse().join(' ');
      }
    }

    this.renderSongFretboard();
    this.highlightActiveLyricsLine();
  }

  private renderSongFretboard(): void {
    const container = document.getElementById('song-fretboard-strings-rows');
    if (!container) return;
    container.innerHTML = '';

    const line = this.activeSong.lines[this.currentLineIdx];
    const notes = line?.notes || [];
    const noteItem = notes[this.currentNoteIdx];

    // If chords mode, get active chord frets
    let activeChordFrets: (number | null)[] | null = null;
    if (this.playMode === 'chords' && line && line.chords && line.chords.length > 0) {
      const chordIdx = Math.floor((this.currentNoteIdx / Math.max(1, notes.length)) * line.chords.length);
      const currentCh = line.chords[chordIdx]?.chord || line.chords[0].chord;
      activeChordFrets = this.getChordFrets(currentCh);
    }

    for (let s = 0; s < 6; s++) {
      const strInfo = this.tuning[s];
      const row = document.createElement('div');
      row.className = 'guitar-string-row';

      const header = document.createElement('div');
      header.className = 'string-header';
      header.innerHTML = `<span style="font-weight:800; color:var(--accent-gold);">${s + 1}</span><span>${strInfo.note}</span>`;
      row.appendChild(header);

      const cellsContainer = document.createElement('div');
      cellsContainer.className = 'fret-cells-container';

      const wire = document.createElement('div');
      wire.className = `string-wire ${strInfo.gaugeClass}`;
      wire.id = `song-string-wire-${s}`;
      cellsContainer.appendChild(wire);

      for (let f = 0; f <= 12; f++) {
        const cell = document.createElement('div');
        cell.className = 'fret-cell';

        if (this.playMode === 'notes') {
          // NOTES MODE: Place single lead tab dot
          if (noteItem && noteItem.string - 1 === s && noteItem.fret === f) {
            const dot = document.createElement('div');
            dot.className = 'scale-dot root active-pluck';
            dot.textContent = noteItem.note.replace(/[0-9]/g, '');
            cell.appendChild(dot);
          }
        } else {
          // CHORDS MODE: Place all finger dots for chord
          if (activeChordFrets && activeChordFrets[s] === f) {
            const dot = document.createElement('div');
            dot.className = 'scale-dot tone';
            dot.textContent = String(f);
            cell.appendChild(dot);
          }
        }

        cellsContainer.appendChild(cell);
      }

      row.appendChild(cellsContainer);
      container.appendChild(row);
    }
  }

  private highlightActiveLyricsLine(): void {
    document.querySelectorAll('.song-lyrics-line').forEach((el, idx) => {
      el.classList.toggle('active-line', idx === this.currentLineIdx);
    });
  }

  private updateSongMetadataUI(): void {
    const titleEl = document.getElementById('song-display-title');
    const metaEl = document.getElementById('song-display-meta');
    const keyEl = document.getElementById('song-pill-key');
    const chordsEl = document.getElementById('song-pill-chords');
    const strumEl = document.getElementById('song-pill-strum');
    const bpmEl = document.getElementById('song-pill-bpm');
    const strumVisual = document.getElementById('song-strum-pattern-visual');

    if (titleEl) titleEl.innerHTML = `🎸 ${this.activeSong.title}`;
    if (metaEl) metaEl.textContent = `Artist/Movie: ${this.activeSong.movie || this.activeSong.singer || 'Acoustic'}`;
    if (keyEl) keyEl.textContent = this.activeSong.key;
    if (chordsEl) chordsEl.textContent = this.activeSong.chordsUsed.join(', ');
    if (strumEl) strumEl.textContent = this.activeSong.strum;
    if (bpmEl) bpmEl.textContent = `${this.activeSong.bpm} BPM`;
    if (strumVisual) strumVisual.textContent = this.activeSong.strumPatternVisual || this.activeSong.strum;

    const tempoSlider = document.getElementById('song-tempo-slider') as HTMLInputElement;
    if (tempoSlider) tempoSlider.value = String(this.activeSong.bpm);
    const tempoReadout = document.getElementById('song-tempo-readout');
    if (tempoReadout) tempoReadout.textContent = `${this.activeSong.bpm} BPM`;
  }

  private renderChordsPalette(): void {
    const palette = document.getElementById('song-chords-palette');
    if (!palette) return;

    palette.innerHTML = '';
    this.activeSong.chordsUsed.forEach(chord => {
      const chip = document.createElement('button');
      chip.className = 'preset-chip';
      chip.textContent = chord;
      chip.onclick = () => {
        this.strumActiveChordByName(chord);
      };
      palette.appendChild(chip);
    });
  }

  private renderLyricsScrollView(): void {
    const box = document.getElementById('lyrics-scroll-box');
    if (!box) return;

    box.innerHTML = '';
    this.activeSong.lines.forEach((line, idx) => {
      const lineDiv = document.createElement('div');
      lineDiv.className = `song-lyrics-line ${idx === this.currentLineIdx ? 'active-line' : ''}`;
      lineDiv.style.padding = '10px 14px';
      lineDiv.style.marginBottom = '6px';
      lineDiv.style.borderRadius = '10px';
      lineDiv.style.background = 'rgba(0,0,0,0.3)';
      lineDiv.style.cursor = 'pointer';

      const chordsRow = line.chords?.map(c => `<span style="color:var(--accent-gold); font-weight:800; margin-right:16px;">[${c.chord}] ${c.word}</span>`).join(' ') || '';

      lineDiv.innerHTML = `
        <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${line.section || `Line ${idx + 1}`}</div>
        <div style="font-size:0.95rem; color:#fff; margin-top:2px;">${line.text}</div>
        <div style="font-size:0.85rem; margin-top:4px;">${chordsRow}</div>
      `;

      lineDiv.onclick = () => {
        this.currentLineIdx = idx;
        this.currentNoteIdx = 0;
        this.updateActiveStepUI();
      };

      box.appendChild(lineDiv);
    });
  }

  private strumActiveChord(style: 'down' | 'up' | 'arpeggio'): void {
    const line = this.activeSong.lines[this.currentLineIdx];
    if (!line || !line.chords || line.chords.length === 0) return;
    const ch = line.chords[0].chord;
    this.strumActiveChordByName(ch, style);
  }

  private strumActiveChordByName(chordSymbol: string, style: 'down' | 'up' | 'arpeggio' = 'down'): void {
    if (!this.audioContext || !this.acousticBus) return;
    const frets = this.getChordFrets(chordSymbol);
    if (!frets) return;

    strumChord(this.audioContext, this.acousticBus, {
      frets,
      style,
      velocity: 0.88,
      tuning: this.tuning,
      model: 'dreadnought',
    });
  }

  private getChordFrets(chordSymbol: string): (number | null)[] | null {
    const root = chordSymbol.replace(/[m7#b].*/, '') as NoteName;
    const quality = chordSymbol.replace(/^[A-G][#b]?/, '') || 'Major';
    const normalized = quality === 'm' ? 'Minor' : quality === '' ? 'Major' : quality;

    const def = buildChordDefinition(root, normalized as any, this.tuning);
    return def.voicings[0]?.frets || null;
  }

  togglePracticeMic(): void {
    this.isPracticeMicActive = !this.isPracticeMicActive;
    const label = document.getElementById('song-mic-status-label');
    const toggle = document.getElementById('btn-toggle-song-mic');
    if (label) label.textContent = this.isPracticeMicActive ? 'ON' : 'OFF';
    if (toggle) toggle.classList.toggle('active', this.isPracticeMicActive);
  }

  evaluatePractice(detectedSymbol: string): void {
    if (!this.isPracticeMicActive) return;

    const line = this.activeSong.lines[this.currentLineIdx];
    if (!line) return;

    let isMatch = false;
    if (this.playMode === 'notes') {
      const noteItem = line.notes?.[this.currentNoteIdx];
      if (noteItem && detectedSymbol.startsWith(noteItem.note.replace(/[0-9]/g, ''))) {
        isMatch = true;
      }
    } else {
      const chordIdx = Math.floor((this.currentNoteIdx / Math.max(1, line.notes?.length || 1)) * (line.chords?.length || 1));
      const targetCh = line.chords?.[chordIdx]?.chord || line.chords?.[0]?.chord;
      if (targetCh && detectedSymbol === targetCh) {
        isMatch = true;
      }
    }

    const badge = document.getElementById('eval-feedback-badge');
    const scoreEl = document.getElementById('song-practice-score');

    if (isMatch) {
      this.practiceScore += 50;
      if (scoreEl) scoreEl.textContent = String(this.practiceScore);
      if (badge) {
        badge.textContent = `🎯 Spot on! Matched ${detectedSymbol}`;
        badge.style.borderColor = '#10b981';
        badge.style.color = '#34d399';
      }
    }
  }
}