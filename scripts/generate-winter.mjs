#!/usr/bin/env node
/**
 * Winter-versies van bestaande zomerfoto's via Nano Banana Pro (Gemini 3 Pro Image).
 * Image-to-image: bestaande foto als referentie + winter-transformatie-prompt.
 *
 * Usage:
 *   node scripts/generate-winter.mjs                 # alle ontbrekende
 *   node scripts/generate-winter.mjs -- --force      # alles opnieuw (kost geld)
 *   node scripts/generate-winter.mjs -- --only=winter-tafel-veste --force
 *
 * Vereist GEMINI_API_KEY (uit ~/.zshrc shell-env). Draai via:  source ~/.zshrc && node ...
 */

import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const RAW_DIR = path.join(PROJECT_ROOT, "public", "photos", "winter", "_raw");

if (!process.env.GEMINI_API_KEY) {
  console.error("\x1b[31mGEMINI_API_KEY is niet gezet.\x1b[0m  Draai: source ~/.zshrc && node scripts/generate-winter.mjs");
  process.exit(1);
}

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const ONLY = args.find((a) => a.startsWith("--only="))?.split("=")[1];

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Gedeelde transformatie-instructie: zelfde scene, alleen het seizoen verandert.
const BASE = [
  "Transform this exact restaurant scene into deep winter.",
  "Keep the architecture, furniture, materials, layout, camera angle and composition IDENTICAL to the reference photo.",
  "Change ONLY the season and atmosphere as described.",
  "Photorealistic editorial restaurant photography, magazine-quality finish, calm and serene.",
  "No people in frame. No text, no logos, no watermarks, no signage, no snowmen, no christmas kitsch.",
].join(" ");

const IMAGES = [
  {
    name: "winter-tafel-veste",
    ref: "public/photos-raw/DSC01206-min-scaled.webp",
    prompt:
      "An intimate set table for two at the edge of the waterside terrace, overlooking the canal (de Veste). " +
      "Across the water: bare leafless trees lightly dusted with snow, a quiet Dutch canal under soft grey-blue overcast winter light. " +
      "A thin layer of snow on the terrace railing and decking. Cold, muted winter palette (slate, pale blue, warm wood). " +
      "A soft warm amber glow spills from the restaurant interior. Keep the table setting, glassware and rattan chairs identical. " +
      "Foreground clean and softly out of focus, no orange decorative orbs.",
  },
  {
    name: "winter-terras",
    ref: "public/photos/terras-veste.webp",
    prompt:
      "The wide covered waterside terrace beside the canal in winter. " +
      "Bare frosted trees and a calm grey canal in the background, a dusting of snow on the wooden deck and railing, " +
      "soft diffuse overcast daylight, cold muted palette. The rattan chairs and balinese parasol stay in place but wintery. " +
      "Warm light glows from the windows of the restaurant. Serene, editorial, no people.",
  },
  {
    name: "winter-interieur",
    ref: "public/photos-raw/IMG_7270-min-scaled.webp",
    prompt:
      "The warm restaurant interior with the two golden sunburst wall lamps and boucle chairs, unchanged. " +
      "Through the window a calm snowy winter garden is visible: bare trees with snow, cold pale daylight outside. " +
      "Inside the lighting is cosy and warm, amber and gold, candles on the set tables. " +
      "Strong contrast between the cold light outside and the warm glow inside. Editorial, calm, no people.",
  },
];

const filtered = ONLY ? IMAGES.filter((i) => i.name === ONLY) : IMAGES;
if (ONLY && filtered.length === 0) {
  console.error(`\x1b[31mGeen image "${ONLY}".\x1b[0m`);
  IMAGES.forEach((i) => console.error(`    ${i.name}`));
  process.exit(1);
}

async function refToJpegBase64(refRel) {
  const abs = path.join(PROJECT_ROOT, refRel);
  const buf = await sharp(abs)
    .rotate()
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return buf.toString("base64");
}

async function generateOne({ name, prompt, ref }) {
  const outPath = path.join(RAW_DIR, `${name}.png`);
  if (fs.existsSync(outPath) && !FORCE) {
    console.log(`\x1b[90mskip (bestaat): ${name}.png\x1b[0m`);
    return { name, status: "skip" };
  }
  console.log(`\x1b[36mgenereren: ${name}  (ref: ${ref})\x1b[0m`);
  const t0 = Date.now();
  try {
    const refB64 = await refToJpegBase64(ref);
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: [
        { inlineData: { mimeType: "image/jpeg", data: refB64 } },
        { text: `${BASE}\n\n${prompt}` },
      ],
    });
    const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) {
      console.warn(`\x1b[33m  geen image-data terug voor ${name}\x1b[0m`);
      return { name, status: "empty" };
    }
    const buffer = Buffer.from(part.inlineData.data, "base64");
    fs.writeFileSync(outPath, buffer);
    const kb = (buffer.length / 1024).toFixed(0);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\x1b[32mopgeslagen: ${name}.png  (${kb} KB, ${secs}s)\x1b[0m`);
    return { name, status: "ok" };
  } catch (err) {
    console.error(`\x1b[31mmislukt: ${name}  ${err.message}\x1b[0m`);
    return { name, status: "error" };
  }
}

async function main() {
  if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });
  console.log(`\nWinter-generatie: ${filtered.length} image(s) -> ${path.relative(PROJECT_ROOT, RAW_DIR)}/\n`);
  const results = [];
  for (const img of filtered) results.push(await generateOne(img));
  const ok = results.filter((r) => r.status === "ok").length;
  const fail = results.filter((r) => r.status !== "ok" && r.status !== "skip").length;
  console.log(`\n\x1b[1mKlaar:\x1b[0m ${ok} gegenereerd, ${fail} mislukt.\n`);
  if (fail > 0) process.exit(1);
}

main();
