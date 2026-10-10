/* ClaimSathi frontend: talks to the FastAPI backend on the same origin. */
const API = "";
const FORCE_DEMO = new URLSearchParams(location.search).get("demo") === "1";
const MAX_FILES = 6, MAX_MB = 10;
const SAMPLES = [
  { id: "case01", emoji: "❤️", chip: "Heart attack", amount: 237000, short: "Policy since 2019 · rejected for 'non-disclosure'" },
  { id: "case02", emoji: "👁️", chip: "Cataract surgery", amount: 48500, short: "Day care · rejected for '< 24 hours'" },
  { id: "case03", emoji: "🩺", chip: "BP emergency", amount: 131000, short: "Declared illness · rejected under '48-month' wait" },
  { id: "case04", emoji: "🦵", chip: "Knee replacement", amount: 302000, short: "New policy · rejected under 24-month wait" },
];
const STAGES = ["Reading · Sonnet 5.5", "Date math · Python", "IRDAI check · Opus 5.5", "Verdict"];
const STAGE_PCT = [8, 35, 50, 100];
const THINKING = ["Reading the rejection reason…", "Finding the matching policy clauses…", "Checking the moratorium rule…",
  "Checking waiting periods…", "Checking the Day Care list…", "Checking sub-limits…", "Checking the insurer's procedure…"];
const VERDICTS = {
  STRONG_CASE: { cls: "strong", label: "STRONG CASE", ic: "✓",
    means: "The insurer appears to have broken its own policy or IRDAI rules. You have good grounds to appeal, and we can write the letter for you." },
  CONTESTABLE: { cls: "contest", label: "CONTESTABLE", ic: "?",
    means: "Some parts of this rejection look questionable. An appeal is worth trying, especially on the points below." },
  VALID_REJECTION: { cls: "valid", label: "VALID REJECTION", ic: "=",
    means: "This rejection appears to follow your policy and IRDAI rules. Here's what you can still do." },
};

const state = { t0: 0, elapsed: null, caseId: null, facts: null, computed: null, inv: null, lang: "en", letters: {}, timers: [], es: null, busy: false, clock: null };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = n => (n || n === 0) ? "₹" + Number(n).toLocaleString("en-IN") : "—";
const nice = iso => { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); };
function go(h) { location.hash = h; }
function clearTimers() { state.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); state.timers = []; }
function later(fn, ms) { state.timers.push(setTimeout(fn, ms)); }
function stopClock() { if (state.clock) clearInterval(state.clock); state.clock = null; }
function show(id) { document.querySelectorAll(".screen").forEach(s => s.classList.toggle("on", s.id === id)); window.scrollTo(0, 0); }
let toastTimer;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2800); }

function route() {
  clearTimers();
  const [, page, id] = (location.hash || "#/").split("/");
  if (page !== "investigate") { stopClock(); if (state.es) { state.es.close(); state.es = null; } }
  if (page === "investigate" && id) return runInvestigation(id);
  if (page === "result" && id) return renderResult(id);
  show("home");
}
window.addEventListener("hashchange", route);

/* ---------------- HOME ---------------- */
function renderChips() {
  $("#chips").innerHTML = SAMPLES.map(c => `
    <button class="chip" onclick="startSample('${c.id}')">
      <span class="e" aria-hidden="true">${c.emoji}</span>
      <span class="t">${c.chip}</span><span class="a">${inr(c.amount)}</span><span class="s">${c.short}</span>
      <span class="go">Check this claim →</span>
    </button>`).join("");
}
const uploaded = { 1: [], 2: [], 3: [] };
const totalFiles = () => uploaded[1].length + uploaded[2].length + uploaded[3].length;
function addFiles(n, list) {
  const fs = [...list];
  if (!fs.length) return;
  const bad = fs.find(f => !f.name.toLowerCase().endsWith(".pdf"));
  if (bad) return toast(`"${bad.name}" isn't a PDF. Please add PDF files only.`);
  const big = fs.find(f => f.size > MAX_MB * 1024 * 1024);
  if (big) return toast(`"${big.name}" is larger than ${MAX_MB} MB.`);
  const fresh = fs.filter(f => !uploaded[n].some(u => u.name === f.name && u.size === f.size));
  if (totalFiles() + fresh.length > MAX_FILES) return toast(`You can add up to ${MAX_FILES} files in total.`);
  uploaded[n].push(...fresh);
  renderZone(n);
}
function picked(n, input) { addFiles(n, input.files); input.value = ""; }
function removeFile(n, i, ev) { ev.preventDefault(); ev.stopPropagation(); uploaded[n].splice(i, 1); renderZone(n); }
function renderZone(n) {
  const z = $("#z" + n), fs = uploaded[n];
  z.classList.toggle("done", fs.length > 0);
  z.querySelector(".num").textContent = fs.length ? "✓" : n;
  z.querySelector(".files").innerHTML = fs.map((f, i) =>
    `<div class="file"><span title="${esc(f.name)}">📎 ${esc(f.name)}</span><button aria-label="Remove ${esc(f.name)}" onclick="removeFile(${n},${i},event)">×</button></div>`).join("");
  const filled = [1, 2, 3].filter(k => uploaded[k].length).length;
  $("#zoneCount").innerHTML = filled === 3 ? "<b>All set!</b> Ready to check" : `<b>${filled}</b> of 3 added`;
  $("#goBtn").disabled = filled < 3;
}
function setupDrop() {
  document.querySelectorAll(".zone").forEach(z => {
    const n = +z.dataset.n;
    ["dragenter", "dragover"].forEach(t => z.addEventListener(t, e => { e.preventDefault(); z.classList.add("drag"); }));
    ["dragleave", "drop"].forEach(t => z.addEventListener(t, e => { e.preventDefault(); z.classList.remove("drag"); }));
    z.addEventListener("drop", e => addFiles(n, e.dataTransfer.files));
  });
  // A file dropped outside a zone shouldn't navigate away from the app.
  ["dragover", "drop"].forEach(t => window.addEventListener(t, e => e.preventDefault()));
}
async function createCase(body, btn) {
  if (state.busy) return; state.busy = true;
  const old = btn && btn.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="icon spin" style="width:16px;height:16px;border-color:rgba(255,255,255,.4);border-top-color:#fff"></span> Uploading…'; }
  try {
    const r = await fetch(API + "/api/cases", { method: "POST", body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || "Upload failed. Please try again.");
    state.letters = {}; state.inv = null;
    go("#/investigate/" + j.case_id);
  } catch (e) { toast(e.message === "Failed to fetch" ? "Can't reach ClaimSathi. Check your connection." : e.message); }
  finally { state.busy = false; if (btn) { btn.innerHTML = old; btn.disabled = false; } }
}
function startSample(id) { const fd = new FormData(); fd.append("sample_case", id); createCase(fd); }
function startUpload() {
  const fd = new FormData();
  [1, 2, 3].forEach(n => uploaded[n].forEach(f => fd.append("files", f, f.name)));
  createCase(fd, $("#goBtn"));
}

/* ---------------- INVESTIGATE ---------------- */
function setStage(i) {
  $("#stepper").innerHTML = STAGES.map((s, k) => {
    const cls = k < i ? "done" : k === i ? "active" : "";
    const ic = k < i ? '<span class="si">✓</span>' : k === i ? '<span class="icon spin" style="width:20px;height:20px"></span>' : `<span class="si">${k + 1}</span>`;
    return `<div class="step ${cls}">${ic} ${s}</div>`;
  }).join("");
  $("#barFill").style.width = (STAGE_PCT[Math.min(i, 3)] || 100) + "%";
}
const FACT_ROWS = [["patient", "Patient"], ["since", "Policy since"], ["months", "Continuous cover"], ["stay", "Hospital stay"],
  ["treat", "Treatment"], ["amount", "Amount claimed"], ["reason", "Insurer's reason"]];
function setFact(k, html) { const el = $("#f_" + k); if (el) el.innerHTML = html; }
function statusBits(s) {
  return s === "fail" ? ["fail", "✗", "Problem"] : s === "pass" ? ["ok", "✓", "OK"] : ["na", "–", "Not relevant"];
}
function thinkingRow(text, sub) {
  return `<div class="row" id="thinking"><span class="icon spin"></span><div><div class="rt">${text}</div><div class="rf" id="thinkMsg">${sub}</div></div></div>`;
}
function renderTally(t) {
  $("#tally").innerHTML = (t.fail ? `<span class="tag fail">${t.fail} problem${t.fail > 1 ? "s" : ""}</span>` : "") +
    (t.ok ? `<span class="tag ok">${t.ok} OK</span>` : "");
}
function runInvestigation(caseId) {
  state.caseId = caseId; state.inv = null; state.letters = {}; state.t0 = Date.now(); state.elapsed = null;
  show("investigate");
  $("#invTitle").textContent = "Investigating your claim";
  $("#toResult").style.display = "none";
  $("#notice").style.display = "none";
  $("#elapsedSpin").style.display = "";
  $("#checkList").innerHTML = thinkingRow("Reading your documents…", "Sonnet 5.5 is finding dates, amounts and the rejection reason");
  $("#factList").innerHTML = FACT_ROWS.map(([k, l]) => `<dt>${l}</dt><dd id="f_${k}"><span class="ghostline"></span></dd>`).join("");
  setStage(0); renderTally({});

  stopClock();
  const tick = () => { const s = Math.round((Date.now() - state.t0) / 1000); $("#elapsed").textContent = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };
  tick(); state.clock = setInterval(tick, 1000);

  if (state.es) state.es.close();
  const es = new EventSource(`${API}/api/investigate/${caseId}${FORCE_DEMO ? "?demo=1" : ""}`);
  state.es = es; let finished = false, firstCheck = true; const tally = { fail: 0, ok: 0 };
  const on = (name, fn) => es.addEventListener(name, e => fn(JSON.parse(e.data || "{}")));

  on("step", d => {
    setStage(d.stage);
    if (d.stage === 2) {
      $("#checkList").innerHTML = thinkingRow("Checking your policy and IRDAI rules…", "Opus 5.5 is reading your policy against 9 IRDAI rules"); firstCheck = true;
      let i = 0; state.timers.push(setInterval(() => {
        const m = $("#thinkMsg"); if (m) m.textContent = THINKING[i++ % THINKING.length];
        const bar = $("#barFill"); const w = parseFloat(bar.style.width) || 50; if (w < 88) bar.style.width = (w + 3) + "%";
      }, 1800));
    }
  });
  on("facts", f => {
    state.facts = f;
    $("#invTitle").textContent = f.claim_number ? `Claim ${f.claim_number}` : "Investigating your claim";
    setFact("patient", esc(f.patient_name || "—")); setFact("since", nice(f.first_inception_date));
    setFact("treat", esc(f.diagnosis || f.procedure || "—")); setFact("amount", inr(f.amount_claimed_inr));
    setFact("reason", esc(f.rejection_reason || "—"));
  });
  on("computed", c => {
    state.computed = c;
    setFact("months", `<span class="big">${esc(c.months_label)}</span>`);
    const f = state.facts || {};
    setFact("stay", `${nice(f.admission_datetime)} → ${nice(f.discharge_datetime)} (${esc(c.stay_label)})`);
  });
  on("check", k => {
    if (firstCheck) { $("#checkList").innerHTML = ""; firstCheck = false; clearTimers(); $("#barFill").style.width = "90%"; }
    const [cls, sym, label] = statusBits(k.status);
    if (k.status === "fail") tally.fail++; else if (k.status === "pass") tally.ok++;
    renderTally(tally);
    const r = document.createElement("div"); r.className = "row " + cls;
    r.innerHTML = `<span class="icon ${cls}" aria-hidden="true">${sym}</span><div><div class="rt">${esc(k.title)}<span class="tag ${cls}">${label}</span></div><div class="rf">${esc(k.finding)}</div></div>`;
    $("#checkList").appendChild(r);
  });
  on("notice", d => { $("#notice").textContent = "ℹ " + d.message; $("#notice").style.display = "block"; });
  on("verdict", inv => {
    state.inv = inv; state.elapsed = Math.round((Date.now() - state.t0) / 1000); setStage(4);
    stopClock(); $("#elapsedSpin").style.display = "none";
    $("#toResult").style.display = "inline-flex";
    later(() => go("#/result/" + caseId), 2000);
  });
  on("done", () => { finished = true; es.close(); });
  es.onerror = () => {
    if (finished) return;
    es.close(); clearTimers(); stopClock(); $("#elapsedSpin").style.display = "none";
    $("#checkList").innerHTML = `<div class="row fail"><span class="icon fail">!</span><div><div class="rt">We lost the connection</div>
      <div class="rf">The server stopped responding. <a href="#" onclick="retryDemo();return false">Show the saved replay</a> or <a href="#/">go back and try again</a>.</div></div></div>`;
  };
}
function retryDemo() { location.search = "?demo=1"; }

/* ---------------- RESULT ---------------- */
async function renderResult(caseId) {
  if (!state.inv || state.caseId !== caseId) {
    const r = await fetch(`${API}/api/cases/${caseId}`).catch(() => null);
    if (!r || !r.ok) { toast("That result has expired. Please start again."); return go("#/"); }
    const j = await r.json();
    state.caseId = caseId; state.facts = j.facts; state.computed = j.computed; state.inv = { ...j.investigation, replay: j.replay }; state.letters = {};
  }
  const { facts: f, computed: c, inv } = state;
  state.lang = "en"; show("result");
  const fails = inv.checks.filter(k => k.status === "fail");
  const others = inv.checks.filter(k => k.status !== "fail");
  const v = VERDICTS[inv.verdict] || VERDICTS.CONTESTABLE;
  const valid = inv.verdict === "VALID_REJECTION";
  const amount = valid ? f.amount_claimed_inr : (inv.amount_at_stake_inr || f.amount_claimed_inr);
  const timeBadge = inv.replay ? '<span class="pill" style="margin-left:6px">Saved replay</span>'
    : state.elapsed ? `<span class="pill" style="margin-left:6px;color:var(--accent);border-color:var(--accent)">⚡ Investigated in ${state.elapsed} s</span>` : "";

  $("#verdictCard").className = "card verdict " + v.cls;
  $("#verdictCard").innerHTML = `
    <div class="v-ic" aria-hidden="true">${v.ic}</div>
    <div><span class="badge ${v.cls}">${v.label}</span>
      <span class="muted" style="font-size:13px;margin-left:6px">Confidence: ${esc(inv.confidence)}</span>${timeBadge}
      <h2>${esc(inv.headline)}</h2>
      <p class="means">${v.means}</p>
      <div class="muted" style="font-size:13.5px">${esc(f.patient_name || "")}${f.claim_number ? " · Claim " + esc(f.claim_number) : ""}</div></div>
    <div class="stake"><small>${valid ? "Amount claimed" : "Money you can claim back"}</small><div class="amt">${inr(amount)}</div>
      ${!valid && f.sum_insured_inr ? `<small>Sum insured ${inr(f.sum_insured_inr)}</small>` : ""}</div>`;

  $("#stats").innerHTML = valid ? "" : `
    <div class="card"><div class="k">Problems found</div><div class="v red">${fails.length} of ${inv.checks.length} checks</div></div>
    <div class="card"><div class="k">Your continuous cover</div><div class="v">${esc(c.months_label)}</div></div>
    <div class="card"><div class="k">Insurer must reply by</div><div class="v">${esc(c.appeal_reply_due)}</div></div>`;

  const seen = new Set();
  const card = (k, n, ok) => {
    const dup = k.policy_quote && seen.has(k.policy_quote); if (k.policy_quote) seen.add(k.policy_quote);
    const cite = [k.page ? `Policy p. ${k.page}` : "", k.policy_clause ? (/^\d/.test(k.policy_clause) ? "Clause " : "") + k.policy_clause : ""].filter(Boolean).join(", ");
    return `<div class="card vcard ${ok ? "okc" : ""}">
      <div class="vn">${ok ? "✓" : n}</div>
      <h4>${esc(k.title)} ${ok ? "" : `<span class="tag fail">${esc(k.severity)}</span>`}</h4>
      <div>${esc(k.finding)}</div>
      ${k.policy_quote && !dup ? `<div class="quote">“${esc(k.policy_quote)}”</div>` : ""}
      ${(cite || k.regulation) ? `<div class="cite">${cite ? `<span>📖 ${esc(cite)}${dup ? " (quoted above)" : ""}</span>` : ""}${k.regulation ? `<span>⚖️ ${esc(k.regulation)}</span>` : ""}</div>` : ""}
    </div>`;
  };
  const mini = k => { const [cls, sym, label] = statusBits(k.status); return `<div class="row"><span class="icon ${cls}" aria-hidden="true">${sym}</span><div><div class="rt">${esc(k.title)}<span class="tag ${cls}">${label}</span></div><div class="rf">${esc(k.finding)}</div></div></div>`; };

  if (valid) {
    const main = inv.checks.find(k => k.policy_quote) || inv.checks[0];
    $("#violations").innerHTML = `<h3 class="section-t">Why the rejection holds</h3><p class="section-s">The insurer followed this rule correctly.</p>${main ? card(main, 1, true) : ""}
      <div class="card next"><b>What you can still do</b><ol>${(inv.next_steps || []).map(n => `<li>${esc(n)}</li>`).join("")}</ol></div>
      <details class="others" style="margin-top:12px"><summary>See all ${inv.checks.length} checks we ran</summary>${inv.checks.filter(k => k !== main).map(mini).join("")}</details>`;
    $("#actionArea").innerHTML = "";
  } else {
    $("#violations").innerHTML = `<h3 class="section-t">What the insurer got wrong</h3>
      <p class="section-s">Each point below is backed by your own policy wording or an IRDAI rule.</p>
      ${fails.map((k, i) => card(k, i + 1, false)).join("")}
      <details class="others"><summary>${others.length} other checks passed or weren't relevant</summary>${others.map(mini).join("")}</details>`;
    $("#actionArea").innerHTML = `<h3 class="section-t">Fight back in 3 steps</h3><p class="section-s">Most people never appeal. You're already ahead.</p>
      <div class="plan">
        <div class="card primary"><span class="pn">Step 1 · now</span><b>Get your appeal letter</b><p>We write it for you, citing the exact clauses and rules.</p>
          <div class="btns"><button class="btn small" onclick="openLetter('en')">✍️ Draft letter</button><button class="btn small ghost" onclick="openLetter('hi')">हिंदी में</button><button class="btn small ghost" onclick="openLetter('mr')">मराठीत</button></div></div>
        <div class="card"><span class="pn">Step 2 · today</span><b>Send it to the Grievance Officer</b><p>Email it to the insurer's Grievance Redressal Officer (the address is in your rejection letter or on their website). Attach the rejection letter and hospital papers. Keep a copy.</p></div>
        <div class="card"><span class="pn">Step 3 · if no reply</span><b>Escalate for free</b><p>No answer by ${esc(c.appeal_reply_due)}, or still rejected? Complain on IRDAI's Bima Bharosa portal, then the Insurance Ombudsman (free, claims up to ₹50 lakh).</p></div>
      </div>`;
  }
  $("#letter").classList.remove("on");

  const steps = [["Today · " + c.today, "Send the appeal to the Grievance Officer"], ["By " + c.appeal_reply_due, "Insurer must reply (30 days). If not, escalate"],
    ["Bima Bharosa", "File on IRDAI's grievance portal"], ["By " + c.ombudsman_deadline, "Insurance Ombudsman · free · up to ₹50 lakh"]];
  ["#nextTitle", "#nextSub"].forEach(s => $(s).style.display = valid ? "none" : "block");
  $("#timeline").style.display = valid ? "none" : "grid";
  $("#timeline").innerHTML = steps.map((s, i) => `<div class="tl ${i === 0 ? "first" : ""}"><b>${esc(s[0])}</b><small>${esc(s[1])}</small></div>`).join("");
}

async function openLetter(lang) {
  $("#letter").classList.add("on");
  $("#letter").scrollIntoView({ behavior: "smooth", block: "start" });
  await setLang(lang, true);
}
async function setLang(lang, typed) {
  state.lang = lang;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.l === lang));
  const body = $("#lbody"); body.lang = lang; clearTimers();
  if (!state.letters[lang]) {
    body.innerHTML = `<span class="muted"><span class="icon spin" style="display:inline-block;width:14px;height:14px;vertical-align:-2px"></span> ${lang === "en" ? "Sonnet 5.5 is writing your letter… (about 10 seconds)" : "Translating your letter…"}</span>`;
    try {
      const r = await fetch(API + "/api/letter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ case_id: state.caseId, lang }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || "Could not write the letter");
      state.letters[lang] = j.text;
    } catch (e) { body.textContent = e.message; return; }
    if (state.lang !== lang) return;
  }
  const text = state.letters[lang];
  if (!typed) { body.textContent = text; return; }
  body.textContent = ""; let i = 0;
  const step = () => { i = Math.min(text.length, i + 22); body.textContent = text.slice(0, i); if (i < text.length) later(step, 16); };
  step();
}
const currentLetter = () => state.letters[state.lang] || "";
function copyLetter() {
  const t = currentLetter(); if (!t) return toast("Draft the letter first");
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("✓ Letter copied. Paste it into your email."), () => toast("Select the text to copy"));
}
function shareWhatsApp() {
  const t = currentLetter(); if (!t) return toast("Draft the letter first");
  window.open("https://wa.me/?text=" + encodeURIComponent(t), "_blank");
}
function downloadLetter() {
  const t = currentLetter(); if (!t) return toast("Draft the letter first");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([t], { type: "text/plain;charset=utf-8" }));
  a.download = `ClaimSathi_appeal_${state.lang}.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- BOOT ---------------- */
function setMode(text, cls) { const p = $("#modePill"); p.className = "pill " + (cls || ""); p.lastElementChild.textContent = text; }
fetch(API + "/api/health").then(r => r.json()).then(h => {
  if (FORCE_DEMO || h.force_demo) setMode("Demo mode · saved replays", "demo");
  else if (h.has_api_key) setMode("Live · Opus 5.5 + Sonnet 5.5", "live");
  else setMode("No API key · saved replays", "demo");
}).catch(() => setMode("Backend offline"));
renderChips(); setupDrop(); route();
