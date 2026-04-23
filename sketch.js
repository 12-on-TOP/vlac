/* -------------------------------------------------------
   CONSTANTS / GLOBALS
------------------------------------------------------- */

const SERVER = "https://vlac.onrender.com";

let pianoY;
let tempo = 120;
let notes = [];
let blocks = [];
let sampler;
let SPACING = 500;

let audioStarted = false;
let keyColors = {}; // pitch -> p5.Color or null

const FIRST_MIDI = 0;
const LAST_MIDI = 127;
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

let WHITE_WIDTH;
let BLACK_WIDTH;
const WHITE_HEIGHT = 200;
const BLACK_HEIGHT = 120;
let mp3Player = null;
let mp3Buffer = null;



/* -------------------------------------------------------
   UPLOAD + PARSE MIDI (CLIENT-SIDE)
------------------------------------------------------- */

document.getElementById("uploadBtn").onclick = async () => {
  const fileInput = document.getElementById("midiFile");
  const file = fileInput.files[0];

  if (!file) {
    document.getElementById("status").textContent = "Choose a file first";
    return;
  }

  const formData = new FormData();
  formData.append("midi", file);

  document.getElementById("status").textContent = "Uploading…";

  // Upload to Render
  const res = await fetch(`${SERVER}/upload`, {
    method: "POST",
    mode: "cors",
    body: formData
  });

  const json = await res.json();
  document.getElementById("status").textContent = json.message;

  // Fetch saved MIDI file
  const midiRes = await fetch(`${SERVER}/midi.mid`, { mode: "cors" });
  const midiArrayBuffer = await midiRes.arrayBuffer();

  // Parse with Tone.Midi
  const midi = new Midi(midiArrayBuffer);
  console.log("Parsed MIDI:", midi);

  tempo = extractTempoFromToneMidi(midi);
  Tone.Transport.bpm.value = tempo;

  notes = toneMidiToPairs(midi);
  buildBlocks(notes);
  scheduleNotes(notes);

  document.getElementById("status").textContent = "MIDI loaded and scheduled";
};


/* -------------------------------------------------------
   TEMPO EXTRACTION (Tone.Midi)
------------------------------------------------------- */

function extractTempoFromToneMidi(midi) {
  if (midi.header.tempos && midi.header.tempos.length > 0) {
    return midi.header.tempos[0].bpm;
  }
  return 120;
}


/* -------------------------------------------------------
   Tone.Midi → NOTE PAIRS
   Output format:
   - single note: [pitch, lengthBeats, startBeats]
   - chord: [[pitch, lengthBeats, startBeats], ...]
------------------------------------------------------- */

function toneMidiToPairs(midi) {
  const events = [];

  midi.tracks.forEach(track => {
    track.notes.forEach(n => {
      events.push({
        pitch: n.midi,
        startBeats: n.ticks / midi.header.ppq,
        lengthBeats: n.durationTicks / midi.header.ppq
      });
    });
  });

  events.sort((a, b) => a.startBeats - b.startBeats);

  const grouped = [];
  if (events.length === 0) return grouped;

  let group = [events[0]];

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];

    if (Math.abs(curr.startBeats - prev.startBeats) < 0.01) {
      group.push(curr);
    } else {
      grouped.push(group);
      group = [curr];
    }
  }
  grouped.push(group);

  return grouped.map(g => {
    if (g.length === 1) {
      const n = g[0];
      return [n.pitch, n.lengthBeats, n.startBeats];
    }
    return g.map(n => [n.pitch, n.lengthBeats, n.startBeats]);
  });
}


/* -------------------------------------------------------
   KEYBOARD HELPERS
------------------------------------------------------- */

function isWhite(pitch) {
  return WHITE_KEYS.includes(pitch % 12);
}

function midiToWhiteIndex(pitch) {
  let count = 0;
  for (let p = FIRST_MIDI; p <= pitch; p++) {
    if (isWhite(p)) count++;
  }
  return count - 1;
}

function countWhiteKeys() {
  let c = 0;
  for (let p = FIRST_MIDI; p <= LAST_MIDI; p++) {
    if (isWhite(p)) c++;
  }
  return c;
}


/* -------------------------------------------------------
   DRAW KEYBOARD
------------------------------------------------------- */

function drawKeyboard() {
  let whiteIndex = 0;

  // white keys
  for (let p = FIRST_MIDI; p <= LAST_MIDI; p++) {
    if (isWhite(p)) {
      let x = whiteIndex * WHITE_WIDTH;

      if (keyColors[p]) fill(keyColors[p]);
      else fill(255);

      stroke(0);
      rect(x, pianoY, WHITE_WIDTH, WHITE_HEIGHT);
      whiteIndex++;
    }
  }

  // black keys
  for (let p = FIRST_MIDI; p <= LAST_MIDI; p++) {
    if (!isWhite(p)) {
      let leftWhiteIndex = midiToWhiteIndex(p - 1);
      let x = leftWhiteIndex * WHITE_WIDTH + (WHITE_WIDTH - BLACK_WIDTH / 2);

      if (keyColors[p]) fill(keyColors[p]);
      else fill(0);

      noStroke();
      rect(x, pianoY, BLACK_WIDTH, BLACK_HEIGHT);
    }
  }
}


/* -------------------------------------------------------
   GET TRANSPORT BEATS (perfect sync)
------------------------------------------------------- */

function getTransportBeats() {
  const [bars, beats, six] = Tone.Transport.position.split(":").map(Number);
  return bars * 4 + beats + six / 4;
}


/* -------------------------------------------------------
   SETUP
------------------------------------------------------- */

function setup() {
  createCanvas(windowWidth, windowHeight);
  pianoY = windowHeight * 0.8;

  const totalWhite = countWhiteKeys();
  WHITE_WIDTH = width / totalWhite;
  BLACK_WIDTH = WHITE_WIDTH * 0.65;

  for (let p = FIRST_MIDI; p <= LAST_MIDI; p++) {
    keyColors[p] = null;
  }

  const btn = createButton("Start Audio");
  btn.position(20, 20);
  btn.mousePressed(async () => {
    await Tone.start();
    Tone.Transport.start();
    audioStarted = true;
    btn.remove();
  });

  sampler = new Tone.Sampler({
    urls: { C4: "piano01.ogg" },
    baseUrl: "./",
  }).toDestination();

  Tone.Transport.bpm.value = tempo;
}


/* -------------------------------------------------------
   DRAW LOOP
------------------------------------------------------- */

function draw() {
  background(0);

  let currentBeat = audioStarted ? getTransportBeats() : 0;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const n = blocks[i];
    n.update(currentBeat);

    if (n.yBottom >= pianoY && n.yTop < pianoY) {
      keyColors[n.pitch] = isWhite(n.pitch)
        ? color(255, 150, 200)
        : color(200, 50, 120);
    }

    if (n.yTop >= pianoY) {
      keyColors[n.pitch] = null;
      blocks.splice(i, 1);
    } else {
      n.display();
    }
  }

  drawKeyboard();
}


/* -------------------------------------------------------
   BUILD VISUAL BLOCKS
------------------------------------------------------- */

function buildBlocks(notes) {
  blocks = [];
  let lastStart = 0;
  let currentBeatY = 0;

  for (let entry of notes) {
    let startBeat = Array.isArray(entry[0]) ? entry[0][2] : entry[2];

    let delta = startBeat - lastStart;
    currentBeatY -= delta;
    lastStart = startBeat;

    if (Array.isArray(entry[0])) {
      for (let [p, l, s] of entry) {
        blocks.push(new Note(p, l, currentBeatY));
      }
    } else {
      let [p, l, s] = entry;
      blocks.push(new Note(p, l, currentBeatY));
    }
  }
}


/* -------------------------------------------------------
   TONE.JS SCHEDULING
------------------------------------------------------- */

function scheduleNotes(notes) {
  for (let entry of notes) {
    if (Array.isArray(entry[0])) {
      for (let [pitch, length, start] of entry) {
        scheduleSingle(pitch, length, start);
      }
    } else {
      let [pitch, length, start] = entry;
      scheduleSingle(pitch, length, start);
    }
  }
}

function scheduleSingle(pitch, lengthBeats, startBeats) {
  const beatToSeconds = 60 / tempo;

  const startTime = startBeats * beatToSeconds;
  const duration  = lengthBeats * beatToSeconds;

  Tone.Transport.schedule((time) => {
    const noteName = Tone.Frequency(pitch, "midi").toNote();
    sampler.triggerAttackRelease(noteName, duration, time);
  }, startTime);
}


/* -------------------------------------------------------
   NOTE CLASS
------------------------------------------------------- */

class Note {
  constructor(p, l, bottomBeat) {
    this.pitch = p;
    this.lengthBeats = l;
    this.bottomBeat = bottomBeat;

    if (isWhite(p)) {
      this.x = midiToWhiteIndex(p) * WHITE_WIDTH;
      this.width = WHITE_WIDTH;
    } else {
      let leftWhiteIndex = midiToWhiteIndex(p - 1);
      this.x = leftWhiteIndex * WHITE_WIDTH + (WHITE_WIDTH - BLACK_WIDTH / 2);
      this.width = BLACK_WIDTH;
    }
  }

  beatToY(beat) {
    return pianoY + beat * SPACING;
  }

  update(currentBeat) {
    const visualBottomBeat = this.bottomBeat + currentBeat;
    const visualTopBeat = visualBottomBeat - this.lengthBeats;

    this.yBottom = this.beatToY(visualBottomBeat);
    this.yTop = this.beatToY(visualTopBeat);
  }

  display() {
    fill(200, 150, 255);
    noStroke();
    rect(this.x, this.yTop, this.width, this.yBottom - this.yTop);
  }
}
