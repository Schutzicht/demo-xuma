#!/usr/bin/env node
/**
 * Winter-versies van bestaande zomerfoto's via Nano Banana Pro (Gemini 3 Pro Image).
 * Image-to-image: bestaande foto als referentie + winter-transformatie-prompt.
 * Output-naam = basename van de bronfoto, zodat Photo.astro de winterversie
 * automatisch koppelt via /photos/winter/<basename>.webp.
 *
 * Usage:
 *   source ~/.zshrc && node scripts/generate-winter.mjs                 # alle ontbrekende
 *   source ~/.zshrc && node scripts/generate-winter.mjs -- --force      # alles opnieuw (kost geld)
 *   source ~/.zshrc && node scripts/generate-winter.mjs -- --only=bar --force
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
  console.error("\x1b[31mGEMINI_API_KEY niet gezet.\x1b[0m  Draai: source ~/.zshrc && node scripts/generate-winter.mjs");
  process.exit(1);
}

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const ONLY = args.find((a) => a.startsWith("--only="))?.split("=")[1];

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const BASE = [
  "Transform this exact restaurant scene into deep winter.",
  "Keep the architecture, furniture, materials, layout, camera angle and composition IDENTICAL to the reference photo.",
  "Change ONLY the season and atmosphere as described.",
  "Photorealistic editorial restaurant photography, magazine-quality finish.",
  "No people in frame. No text, no logos, no watermarks, no signage, no snowmen, no christmas kitsch.",
].join(" ");

// name = basename van de bronfoto (zonder extensie). ref = pad t.o.v. project root.
const IMAGES = [
  { name: "terras-parasols", ref: "public/photos/terras-parasols.webp",
    prompt: "Covered waterside terrace with rattan furniture and a balinese parasol in winter. A layer of snow on the wooden deck and railing, bare frosted trees and a calm grey canal beyond, cold pale overcast daylight, warm amber glow spilling from the restaurant windows. Serene and calm." },
  { name: "terras-overdekt", ref: "public/photos/terras-overdekt.webp",
    prompt: "Covered terrace with green-patterned cushions and rattan chairs in winter. A snowy bare garden visible through the glass, cold grey daylight outside, light snow on the decking, cosy warm interior lighting inside. Calm winter mood." },
  { name: "zaal-breed", ref: "public/photos/zaal-breed.webp",
    prompt: "Wide restaurant dining room with rattan pendant lamps and beachy decor in winter. The windows reveal a snowy garden, the interior is lit warm and amber with candles on the tables, cosy intimate winter evening atmosphere. Strong warm-inside vs cold-outside contrast." },
  { name: "lounge", ref: "public/photos/lounge.webp",
    prompt: "Lounge area with soft boucle chairs in winter. A snowy view through the large windows, cold blue daylight outside, warm cosy interior lighting, candles. Calm, intimate winter mood." },
  { name: "eethoek-bank", ref: "public/photos/eethoek-bank.webp",
    prompt: "Dining nook with a banquette and woven wall decor in winter. Warm cosy lamplight and candles, a snowy window view nearby with cold light, intimate winter dining atmosphere." },
  { name: "eethoek-daglicht", ref: "public/photos/eethoek-daglicht.webp",
    prompt: "Dining nook with a rattan pendant lamp in winter. The large windows show a snowy winter garden with bare trees, cold pale daylight outside, warm amber interior glow and candles on the table." },
  { name: "bar", ref: "public/photos/bar.webp",
    prompt: "The curved white bar with hanging glassware and boucle bar stools in winter. Warm intimate evening lighting, a frosted snowy window nearby with cold blue light, cosy winter bar mood." },
  { name: "IMG_7253-min-scaled", ref: "public/photos-raw/IMG_7253-min-scaled.webp",
    prompt: "An elegant set table with wine glasses on light wood in winter. Soft cool daylight from a frosted window, a hint of a snowy view outside, warm candlelight on the table. Calm and minimal." },
  { name: "DSC01018-min-scaled", ref: "public/photos-raw/DSC01018-min-scaled.webp",
    prompt: "Interior detail with the golden sunburst wall lamp and boucle chairs in winter. A snowy window view with cold light, warm cosy lamplight inside, candles on the set table. Calm winter mood." },
  { name: "IMG_7122V2-min-scaled", ref: "public/photos-raw/IMG_7122V2-min-scaled.webp",
    prompt: "Cosy nook with woven wall plates and fringed cushions in winter. Warm amber lighting and candles, a hint of cold snowy light from a nearby window. Intimate winter atmosphere." },
  { name: "IMG_7124-min-scaled", ref: "public/photos-raw/IMG_7124-min-scaled.webp",
    prompt: "Covered veranda terrace with striped cushion benches in winter. Light snow on the wooden deck, bare snowy trees and garden beyond, cold pale daylight, warm glow from the windows inside." },
  { name: "IMG_7396-min-scaled", ref: "public/photos-raw/IMG_7396-min-scaled.webp",
    prompt: "The bar with hanging glassware and bottles in winter. Warm intimate evening lighting, cosy winter mood, a frosted snowy window with cold blue light in the background." },
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
