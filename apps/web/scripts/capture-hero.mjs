// Capturas, hoja de contacto y video del hero animado (design/motion/LANDING.md).
//   node scripts/capture-hero.mjs [baseURL] [outDir] [--video] [--only=360|1440]
// Usa window.__seek(t) (render determinista) y deja PNG en docs/screenshots/landing/hero-*.png.
// Con --video graba el loop completo (28 s) en tiempo real con recordVideo → hero-loop.webm.
import { chromium } from "@playwright/test";
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:3500";
const out = process.argv[3] ?? "../../docs/screenshots/landing";
const video = process.argv.includes("--video");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const times = (process.argv.find((a) => a.startsWith("--t="))?.slice(4) ?? "0,1.6,4.0,6.0,7.9,8.6,9.6,10.2,11.0,11.8,12.7,14.2,15.6,16.55,17.6,19.8,21.9,22.7,23.4,24.6,25.4,26.4,27.4")
  .split(",")
  .map(Number);
mkdirSync(out, { recursive: true });

const sizes = [
  { name: "360", viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 },
  { name: "1440", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
].filter((s) => !only || s.name === only);

const browser = await chromium.launch();
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: s.deviceScaleFactor });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.__seek === "function");
  await page.waitForTimeout(600);
  for (const t of times) {
    await page.evaluate((v) => window.__seek(v), t);
    await page.waitForTimeout(320);
    await page.screenshot({ path: join(out, `hero-${s.name}-t${String(t).replace(".", "_")}.png`) });
  }
  await ctx.close();

  const still = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: s.deviceScaleFactor, reducedMotion: "reduce" });
  const sp = await still.newPage();
  await sp.goto(base, { waitUntil: "networkidle" });
  await sp.waitForTimeout(500);
  await sp.screenshot({ path: join(out, `hero-reduced-${s.name}.png`), fullPage: false });
  await sp.screenshot({ path: join(out, `hero-reduced-${s.name}-full.png`), fullPage: true });
  await still.close();
}

if (video) {
  for (const s of sizes) {
    const dir = join(out, `.video-${s.name}`);
    const ctx = await browser.newContext({ viewport: s.viewport, recordVideo: { dir, size: s.viewport } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForFunction(() => typeof window.__seek === "function");
    // Arranca el loop desde 0 y lo deja correr con su reloj real (un loop completo + medio segundo de cola).
    await page.evaluate(() => window.__seek(0));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__seek(null));
    await page.waitForTimeout((await page.evaluate(() => window.__heroLoop)) * 1000 + 600);
    const v = page.video();
    await ctx.close();
    const path = await v.path();
    renameSync(path, join(out, s.name === "1440" ? "hero-loop.webm" : `hero-loop-${s.name}.webm`));
  }
}
await browser.close();
