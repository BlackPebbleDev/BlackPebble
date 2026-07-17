/**
 * Dev-only responsive QA capture for the Trader Intelligence mobile harness.
 * Drives the system Chrome via playwright-core against the running dev server
 * and writes per-section screenshots at each target width. Not shipped; run
 * manually during QA (see PART 25). playwright-core is not a project dependency.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "harness-screenshots");
const URL = process.env.HARNESS_URL || "http://127.0.0.1:5199/mobile-harness.html";
const WIDTHS = [360, 390, 430, 768, 1024, 1280, 1440];
const SECTIONS = process.env.SECTIONS
  ? process.env.SECTIONS.split(",")
  : [
      "entryintelligence",
      "exitintelligence",
      "currentliquidity",
      "entryintelligence-processing",
      "exitintelligence-processing",
    ];

const CHROME =
  process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

let overflow = false;
for (const width of WIDTHS) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  // Full page at this width
  await page.screenshot({
    path: join(OUT, `all-${width}.png`),
    fullPage: true,
  });

  // Horizontal-overflow assertion
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollW > width + 1) {
    console.error(`OVERFLOW at ${width}px: scrollWidth=${scrollW}`);
    overflow = true;
  }

  for (const id of SECTIONS) {
    const el = page.locator(`[data-section="${id}"]`);
    if ((await el.count()) === 0) continue;
    await el.first().screenshot({ path: join(OUT, `${id}-${width}.png`) });
  }
  await page.close();
  console.log(`captured ${width}px`);
}

await browser.close();
if (overflow) {
  console.error("Horizontal overflow detected");
  process.exit(2);
}
console.log("done");
