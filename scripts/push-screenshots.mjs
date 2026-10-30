#!/usr/bin/env node
// Captures screenshots from an Android device or emulator with adb and saves them as numbered PNGs in a
// folder, ready to drag onto the screenshot studio (Creativos → Screenshots), which places them in order.
// Nothing is uploaded: it only writes local files. Needs adb (Android platform-tools) in the PATH.
//
//   node scripts/push-screenshots.mjs [--count 5] [--out capturas] [--serial emulator-5554]
//
// Open the first screen in the app, press Enter, move to the next screen, press Enter again… Type q and
// Enter to stop early.

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const count = Math.min(10, Math.max(1, Number.parseInt(arg("count", "5"), 10) || 5));
const out = path.resolve(arg("out", `capturas-${new Date().toISOString().slice(0, 10)}`));
const serial = arg("serial", "");
if (serial && !/^[\w.:-]+$/.test(serial)) {
  console.error("Número de serie no válido.");
  process.exit(1);
}
const adbArgs = (...rest) => (serial ? ["-s", serial, ...rest] : rest);

async function main() {
  try {
    const { stdout } = await run("adb", adbArgs("get-state"));
    if (!stdout.includes("device")) throw new Error(stdout.trim());
  } catch (err) {
    console.error("adb no encuentra ningún dispositivo. Conecta el móvil con la depuración USB activada o arranca un emulador.");
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
  await mkdir(out, { recursive: true });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Se guardarán hasta ${count} capturas en ${out}`);
  for (let i = 1; i <= count; i++) {
    const answer = await rl.question(`Pantalla ${i} de ${count}: ábrela en el móvil y pulsa Enter (q para terminar) `);
    if (answer.trim().toLowerCase() === "q") break;
    // exec-out returns the raw PNG bytes (screencap -p), without the line-ending mangling of adb shell.
    const { stdout } = await run("adb", adbArgs("exec-out", "screencap", "-p"), { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
    const file = path.join(out, `${String(i).padStart(2, "0")}.png`);
    await writeFile(file, stdout);
    console.log(`  guardada ${file} (${Math.round(stdout.length / 1024)} KB)`);
  }
  rl.close();
  console.log("Listo. Arrastra la carpeta (o los archivos) al estudio de screenshots.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
