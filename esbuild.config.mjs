import esbuild from "esbuild";
import process from "process";

const isProd = process.argv.includes("production");

esbuild.build({
  entryPoints: ["main.ts"],
  bundle: true,
  outfile: "main.js",
  format: "cjs",
  target: "es2020",
  platform: "browser",
  external: ["obsidian"],
  sourcemap: !isProd,
  minify: isProd,
  logLevel: "info",
}).catch(() => process.exit(1));
