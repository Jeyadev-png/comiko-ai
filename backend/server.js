const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 Better model (faster + more reliable)
const HF_URL = "https://api-inference.huggingface.co/models/stabilityai/sdxl-turbo";

// ⏳ delay helper
const delay = (ms) => new Promise(res => setTimeout(res, ms));

app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, panelCount = 3 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt required" });
    }

    const panels = Array.from({ length: panelCount }, (_, i) => ({
      panel: i + 1,
      scene: `${prompt}, scene ${i + 1}`,
      dialogue: `Panel ${i + 1}`
    }));

    const results = [];

    for (const p of panels) {
      let success = false;
      let attempts = 0;

      while (!success && attempts < 3) {
        try {
          attempts++;

          const response = await axios({
            method: "POST",
            url: HF_URL,
            headers: {
              Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
              "Content-Type": "application/json"
            },
            data: {
              inputs: `anime comic panel, manga style, ${p.scene}, detailed, cinematic, high quality`,
              options: { wait_for_model: true } // 🔥 important
            },
            responseType: "arraybuffer",
            timeout: 60000
          });

          const contentType = response.headers["content-type"];

          // 🔴 detect invalid responses
          const isImage = contentType && contentType.startsWith("image");
          const isFakeSVG = contentType === "image/svg+xml";

          if (!isImage || isFakeSVG) {
            console.log("Retrying... HF returned invalid image");
            await delay(3000);
            continue;
          }

          const base64 = Buffer.from(response.data).toString("base64");

          results.push({
            ...p,
            imageUrl: `data:image/png;base64,${base64}`
          });

          success = true;

          // ⏳ avoid rate limit
          await delay(2000);

        } catch (err) {
          console.log("Attempt failed:", err.message);
          await delay(3000);
        }
      }

      // ❌ if all retries failed
      if (!success) {
        results.push({
          ...p,
          imageUrl: ""
        });
      }
    }

    res.json(results);

  } catch (err) {
    console.error("ERROR:", err.message);
    res.status(500).json({ error: "Failed to generate comic" });
  }
});

app.get("/", (req, res) => {
  res.send("API running");
});

app.listen(5000, () => console.log("Server running on http://localhost:5000"));