import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base ("./") rather than an absolute path -- GitHub Pages serves a repo at
  // https://<user>.github.io/<repo>/, a subpath, not the domain root (unless the repo is
  // specifically named <user>.github.io). A relative base makes the built asset paths work
  // correctly regardless of what that subpath ends up being, so this doesn't need updating
  // if the repo gets renamed later.
  base: "./",
});
