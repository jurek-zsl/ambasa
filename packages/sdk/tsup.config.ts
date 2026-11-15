import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: { resolve: true },
  clean: true,
  // Bundle the workspace protocol package so the published SDK has no private deps.
  noExternal: ["@ambasa/shared"],
});
