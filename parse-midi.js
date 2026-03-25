// -------------------------
//  SIMPLE MIDI SERVER (Render)
// -------------------------

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());

// Serve static files (including uploaded MIDI)
app.use(express.static("public"));

// Ensure public folder exists
if (!fs.existsSync("public")) {
  fs.mkdirSync("public");
}

// Multer setup (memory storage for Render)
const upload = multer({
  storage: multer.memoryStorage()
});

// -------------------------
//  UPLOAD ENDPOINT
// -------------------------

app.post("/upload", upload.single("midi"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    // Save raw MIDI file to public/midi.mid
    const outputPath = path.join("public", "midi.mid");
    fs.writeFileSync(outputPath, req.file.buffer);

    res.json({
      message: "MIDI uploaded successfully",
      file: "midi.mid"
    });
  } catch (err) {
    console.error("File write error:", err);
    res.status(500).json({ message: "Failed to save MIDI file" });
  }
});

// -------------------------
//  START SERVER
// -------------------------

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
