import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  // Bundle the workspace packages; keep real npm dependencies external.
  noExternal: ["@artigram/shared", "@artigram/sdk"],
});
