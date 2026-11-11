#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import postcssConfig from "../postcss.config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

const plugins = [];
for (const plugin of postcssConfig.plugins) {
  if (typeof plugin === "function" || (plugin && plugin.postcssPlugin)) {
    plugins.push(plugin);
    continue;
  }
  if (typeof plugin === "string") {
    const mod = await import(plugin);
    plugins.push(mod.default ?? mod);
    continue;
  }
  if (Array.isArray(plugin)) {
    const [name, options] = plugin;
    const mod = await import(name);
    const factory = mod.default ?? mod;
    plugins.push(factory(options));
  }
}

const result = await postcss(plugins).process(input, {
  from: path.join(root, "src/app/globals.css"),
});
const css = result.css;
const unlayered = css
  .replace(/@supports[^{]+\{[\s\S]*?\n\}/g, "")
  .replace(/@media \(color-gamut: p3\)\s*\{[\s\S]*?\n\}/g, "");
const checks = {
  "@layer": /@layer\b/.test(css),
  oklch: /oklch\(/i.test(unlayered),
  "color-mix": /color-mix\(/i.test(unlayered),
  "display:grid": /display:\s*grid/.test(css),
  "display:flex": /display:\s*flex/.test(css),
  "min-width media": /@media \(min-width:/.test(css),
  "logical start kept": /\.text-start\s*\{\s*text-align:\s*start/.test(css),
};

console.log(`CSS size: ${(css.length / 1024).toFixed(1)} KB`);
for (const [name, found] of Object.entries(checks)) {
  console.log(`${found ? "found   " : "absent  "} ${name}`);
}

const leftover = ["@layer", "oklch", "color-mix"].filter((name) => checks[name]);
const missing = [
  "display:grid",
  "display:flex",
  "min-width media",
  "logical start kept",
].filter((name) => !checks[name]);
if (leftover.length || missing.length) {
  console.error(
    `\nTV CSS check failed. leftover=${leftover.join(", ") || "none"} missing=${missing.join(", ") || "none"}`,
  );
  const out = path.join(root, ".tv-css-debug.css");
  fs.writeFileSync(out, css);
  console.error(`Wrote ${out}`);
  process.exit(1);
}

console.log("\nTV CSS check passed.");
