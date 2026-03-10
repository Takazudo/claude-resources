import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import { searchIndexIntegration } from "./src/integrations/search-index";
import { docHistoryIntegration } from "./src/integrations/doc-history";

export default defineConfig({
  output: "static",
  integrations: [react(), searchIndexIntegration(), docHistoryIntegration()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
  },
  markdown: {
    shikiConfig: {
      theme: "one-dark-pro",
    },
  },
});
