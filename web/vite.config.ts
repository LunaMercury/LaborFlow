import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { realpathSync } from "node:fs";

const projectRoot = realpathSync(process.cwd());

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
});
