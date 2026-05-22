import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://xuma-demo.vercel.app",
  vite: {
    plugins: [tailwindcss()],
  },
});
