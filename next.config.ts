import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The docs example uses __dirname, but that sample is a CommonJS
// next.config.js; this file is an ES module, so derive the path from
// import.meta.url instead of relying on __dirname being shimmed.
const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Next otherwise infers the workspace root as the user's home directory,
  // because a stray package-lock.json sits there and lockfiles are what it
  // probes for. That makes it watch and resolve from the wrong tree.
  //
  // Changing this needs a full `next dev` restart — hot-reloading the config
  // leaves Turbopack resolving against the old root and every route 500s with
  // "adapterFn is not a function". Restart before believing it is broken.
  turbopack: {
    root: here,
  },
};

export default nextConfig;
