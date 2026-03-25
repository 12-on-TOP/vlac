// -------------------------
//  MIDI SERVER (Render)
// -------------------------

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { parseMidi } = require("midi-file"); // If you're using midi-file parser

const app = express();
app.use(cors());

// Serve static files (including midi.json)
app.use(express.static("public"));

// Ensure public folder exists
if (!fs.existsSync("public")) {
  fs.mkdirSync("public");
}

// Multer setup for file uploads
const upload = multer({
  storage: multer.memoryStorage() // Render's filesystem is ephemeral
});

// -------------------------
//  UPLOAD ENDPOINT
// -------------------------

app.post("/upload", upload.single("midi"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    // Parse MIDI buffer
    const midiData = parseMidi(req.file.buffer);

    // Save parsed JSON to public/midi.json
    fs.writeFileSync(
      path.join("public", "midi.json"),
      JSON.stringify(midiData, null, 2)
    );

    res.json({ message: "MIDI uploaded and parsed successfully" });
  } catch (err) {
    console.error("MIDI parse error:", err);
    res.status(500).json({ message: "Failed to parse MIDI" });
  }
});

// -------------------------
//  START SERVER
// -------------------------

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
