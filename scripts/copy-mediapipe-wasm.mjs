import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Copy MediaPipe's WASM runtime into public/ so the app serves it itself.
 * Pinning a CDN URL drifts out of sync with the installed package version
 * (and breaks offline dev), so the files ship with the build instead.
 *
 * Runs automatically before dev and build.
 */
const source = path.resolve("node_modules/@mediapipe/tasks-vision/wasm");
const target = path.resolve("public/mediapipe/wasm");

if (!existsSync(source)) {
  console.error(
    "MediaPipe wasm assets not found. Run `npm install` before this script.",
  );
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log(`Copied MediaPipe wasm runtime → ${path.relative(process.cwd(), target)}`);
