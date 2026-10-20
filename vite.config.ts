import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The guide is lazy-loaded; prepare its CommonJS dependency before the first click.
  optimizeDeps: { include: ["matter-js"] },
});
