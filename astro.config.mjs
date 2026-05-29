import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://demo-xuma.vercel.app",
  vite: {
    plugins: [tailwindcss()],
  },
});
