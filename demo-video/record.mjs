// Records a ~2-minute ClaimSathi demo video following the SRS demo script.
// Needs the backend running on :8000. Uses demo mode (saved Claude results), so it works offline.
//   node record.mjs            -> ClaimSathi_demo.mp4
//   BASE=http://localhost:8000 node record.mjs
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || "http://localhost:8000";
const W = 1440, H = 900;
const RAW = join(HERE, "raw");
const OUT = join(HERE, "ClaimSathi_demo.mp4");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Caption bar + fake cursor (headless recordings show no mouse pointer).
const overlay = () => {
  const css = `
    #__cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(20px);max-width:900px;
      background:rgba(20,20,30,.92);color:#fff;font:600 21px/1.4 Inter,system-ui,sans-serif;padding:14px 26px;
      border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transition:.45s;z-index:99999;text-align:center}
    #__cap.on{opacity:1;transform:translateX(-50%) translateY(0)}
    #__cap small{display:block;font-weight:500;font-size:15px;opacity:.75;margin-top:2px}
    #__cur{position:fixed;width:22px;height:22px;border-radius:50%;background:rgba(59,59,214,.35);border:2px solid #3B3BD6;
      z-index:100000;pointer-events:none;transform:translate(-50%,-50%);transition:width .15s,height .15s;left:-50px;top:-50px}
    #__cur.down{width:34px;height:34px;background:rgba(59,59,214,.5)}
    #__card{position:fixed;inset:0;z-index:99998;background:linear-gradient(135deg,#1c1c5e,#3B3BD6 60%,#8A3BD6);color:#fff;
      display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:Inter,system-ui,sans-serif;
      opacity:0;transition:opacity .6s;pointer-events:none}
    #__card.on{opacity:1}
    #__card h1{font-size:64px;margin:0 0 12px;letter-spacing:-.03em}
    #__card p{font-size:26px;margin:4px 0;opacity:.9;max-width:1000px}`;
  const boot = () => {
    if (document.getElementById("__cap")) return;
    const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
    for (const id of ["__cap", "__cur", "__card"]) { const d = document.createElement("div"); d.id = id; document.body.appendChild(d); }
    addEventListener("mousemove", e => { const c = document.getElementById("__cur"); c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => document.getElementById("__cur").classList.add("down"), true);
    addEventListener("mouseup", () => document.getElementById("__cur").classList.remove("down"), true);
  };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", boot) : boot();
};

async function main() {
  rmSync(RAW, { recursive: true, force: true }); mkdirSync(RAW, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1,
    recordVideo: { dir: RAW, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  await page.addInitScript(overlay);

  const cap = async (text, sub = "", ms = 0) => {
    await page.evaluate(([t, s]) => {
      const c = document.getElementById("__cap");
      if (!t) { c.classList.remove("on"); return; }
      c.innerHTML = t + (s ? `<small>${s}</small>` : ""); c.classList.add("on");
    }, [text, sub]);
    if (ms) await sleep(ms);
  };
  const card = async (on, h = "", lines = []) => page.evaluate(([on, h, lines]) => {
    const c = document.getElementById("__card");
    c.innerHTML = on ? `<h1>${h}</h1>${lines.map(l => `<p>${l}</p>`).join("")}` : "";
    c.classList.toggle("on", on);
  }, [on, h, lines]);
  const pos = { x: W / 2, y: H / 2 };
  const moveTo = async (loc) => {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.move(x, y, { steps: 25 }); pos.x = x; pos.y = y;
    await sleep(250);
  };
  const click = async (loc) => { await moveTo(loc); await page.mouse.down(); await sleep(120); await page.mouse.up(); };
  const scrollTo = async (y, ms = 1400) => {
    await page.evaluate(([y, ms]) => new Promise(res => {
      const y0 = scrollY, t0 = performance.now();
      const f = t => { const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        scrollTo(0, y0 + (y - y0) * e); k < 1 ? requestAnimationFrame(f) : res(); };
      requestAnimationFrame(f);
    }), [y, ms]);
    await sleep(200);
  };
  const scrollToEl = async (sel, offset = 90, ms = 1400) => {
    const y = await page.evaluate(([s, o]) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().top + scrollY - o : scrollY; }, [sel, offset]);
    await scrollTo(y, ms);
  };

  // ---- 0. Title card
  await page.goto(`${BASE}/?demo=1#/`, { waitUntil: "networkidle" });
  await card(true, "ClaimSathi", ["Was your health insurance claim rejected unfairly?", "Opus 5.5 investigates · Sonnet 5.5 fights for you"]);
  await sleep(3500);
  await card(false); await sleep(700);

  // ---- 1. Hook
  await cap("1 in 12 health claims in India is rejected.", "36% of people say theirs was rejected unfairly. Most never appeal.", 4500);
  await cap("Upload 3 PDFs: policy, rejection letter, hospital papers", "Each box says where to find the document. Drag and drop works.");
  await scrollToEl(".upload", 40, 1600); await moveTo(page.locator("#z2")); await sleep(2800);
  await cap("Or try a sample case in one click", "Fictional people, real-world rejection patterns");
  await scrollToEl(".samples", 40, 1400); await sleep(2200);

  // ---- 2. Live run, Case 01
  await cap("Case 01 · Rajesh, heart attack, ₹2,37,000", "Rejected for 'non-disclosure' of diabetes");
  await sleep(1500);
  await click(page.locator(".chip").nth(0));
  await page.waitForSelector("#investigate.on");
  await cap("Sonnet 5.5 reads the documents", "Facts fill in live on the right");
  await page.waitForFunction(() => document.querySelector("#f_months .big"), null, { timeout: 60000 });
  await cap("Python does the date math, never the model", "85 months of continuous cover");
  await moveTo(page.locator("#f_months")); await sleep(2200);
  await page.waitForFunction(() => document.querySelectorAll("#checkList .row:not(#thinking)").length > 0, null, { timeout: 60000 });
  await cap("Opus 5.5 checks every IRDAI rule", "Each check streams in, with the exact policy clause");
  await page.mouse.move(W - 200, H - 120, { steps: 20 });
  await page.waitForSelector("#toResult", { state: "visible", timeout: 90000 });
  await page.waitForSelector("#result.on", { timeout: 15000 });
  await sleep(600);

  // ---- 3. Verdict
  await cap("STRONG CASE: the 5-year moratorium rule was broken", "After 60 months, no rejection for non-disclosure unless fraud is proven", 4500);
  await cap("Every point is backed by a quote from the policy", "Clause 6.4 · IRDAI (Insurance Products) Regulations, 2024");
  await scrollToEl("#violations", 20, 1800); await sleep(3500);
  await scrollTo(await page.evaluate(() => scrollY + 520), 1800); await sleep(2000);

  // ---- 4. Action: letter + Hindi + deadlines
  await cap("One click: a ready-to-send appeal letter", "Addressed to the Grievance Redressal Officer, citing Clause 6.4");
  await scrollToEl("#actionArea", 20, 1400);
  await click(page.locator("#actionArea .btn", { hasText: "Draft letter" }));
  await page.waitForFunction(() => (document.querySelector("#lbody")?.textContent || "").includes("Clause 6.4"), null, { timeout: 30000 });
  await sleep(2500);
  await scrollTo(await page.evaluate(() => scrollY + 380), 1600); await sleep(1800);
  await cap("One more click: the same letter in Hindi", "Also Marathi. Copy, download, print or share on WhatsApp");
  await scrollToEl("#letter", 20, 1000);
  await click(page.locator('.tab[data-l="hi"]'));
  await page.waitForFunction(() => ((document.querySelector("#lbody")?.textContent || "").match(/[\u0900-\u097F]/g) || []).length > 200, null, { timeout: 30000 });
  await sleep(3500);
  await cap("Clear deadlines: insurer → Bima Bharosa → Ombudsman", "The Ombudsman is free, for claims up to ₹50 lakh");
  await scrollToEl("#timeline", 160, 1600); await sleep(4000);

  // ---- 5. Honesty: Case 04
  await cap("Now a case where the insurer was right", "ClaimSathi doesn't just side with the customer");
  await click(page.locator(".again .btn"));
  await page.waitForSelector("#home.on"); await scrollToEl(".samples", 40, 1000);
  await click(page.locator(".chip").nth(3));
  await cap("Case 04 · Anita, knee replacement, ₹3,02,000", "Policy only 6 months old; joint replacement has a 24-month wait");
  await page.waitForSelector("#result.on", { timeout: 90000 });
  await sleep(600);
  await cap("VALID REJECTION: when the insurer is right, ClaimSathi says so", "Plus what she can still do, and when cover starts", 5000);
  await scrollToEl("#violations", 20, 1600); await sleep(3500);
  await cap("");

  // ---- 6. Close
  await card(true, "ClaimSathi", ["Opus investigates. Sonnet fights for you.", "Verdict in about a minute · cited clauses · appeal letter in English, हिंदी, मराठी",
    "<small style='font-size:17px;opacity:.7'>Helps you understand and draft. Not legal advice. Demo uses fictional data.</small>"]);
  await sleep(4500);

  await ctx.close(); await browser.close();
  const webm = readdirSync(RAW).find(f => f.endsWith(".webm"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(RAW, webm), "-c:v", "libx264", "-preset", "slow", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", "30", OUT]);
  rmSync(RAW, { recursive: true, force: true });
  console.log("Saved", OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
