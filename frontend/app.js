/* ClaimSathi frontend: talks to the FastAPI backend on the same origin. */
const API = "";
const FORCE_DEMO = new URLSearchParams(location.search).get("demo") === "1";
const SAMPLES = [
  { id: "case01", chip: "Heart attack", amount: 237000, short: "Policy since 2019 · rejected for 'non-disclosure'" },
  { id: "case02", chip: "Cataract surgery", amount: 48500, short: "Day care · rejected for '< 24 hours'" },
  { id: "case03", chip: "BP emergency", amount: 131000, short: "Declared PED · rejected under '48-month' wait" },
  { id: "case04", chip: "Knee replacement", amount: 302000, short: "New policy · rejected under 24-month wait" },
];
const STAGES = ["Reading · Sonnet 5.5", "Date math · Python", "IRDAI check · Opus 5.5", "Verdict"];
const THINKING = ["Reading the rejection reason…", "Finding the matching policy clauses…", "Checking the moratorium rule…",
  "Checking waiting periods…", "Checking the Day Care list…", "Checking sub-limits…", "Checking the insurer's procedure…"];

const state = { t0: 0, elapsed: null, caseId: null, facts: null, computed: null, inv: null, lang: "en", letters: {}, timers: [], es: null, busy: false };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = n => (n || n === 0) ? "₹" + Number(n).toLocaleString("en-IN") : "—";
const nice = iso => { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); };
function go(h) { location.hash = h; }
function clearTimers() { state.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); state.timers = []; }
function later(fn, ms) { state.timers.push(setTimeout(fn, ms)); }
function show(id) { document.querySelectorAll(".screen").forEach(s => s.classList.toggle("on", s.id === id)); window.scrollTo(0, 0); }
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2600); }

function route() {
  clearTimers();
  const [, page, id] = (location.hash || "#/").split("/");
  if (page !== "investigate" && state.es) { state.es.close(); state.es = null; }
  if (page === "investigate" && id) return runInvestigation(id);
  if (page === "result" && id) return renderResult(id);
  show("home");
}
window.addEventListener("hashchange", route);

/* ---------------- HOME ---------------- */
function renderChips() {
  $("#chips").innerHTML = SAMPLES.map(c => `
    <button class="chip" onclick="startSample('${c.id}')">
      <div class="t">${c.chip}</div><div class="a">${inr(c.amount)}</div><div class="s">${c.short}</div>
    </button>`).join("");
}
const uploaded = {};
function picked(n, input) {
  const fs = [...input.files];
  if (!fs.length) return;
  if (fs.some(f => !f.name.toLowerCase().endsWith(".pdf"))) { toast("PDF files only"); input.value = ""; return; }
  uploaded[n] = fs;
  const z = $("#z" + n); z.classList.add("done"); z.querySelector(".fname").textContent = "✓ " + fs.map(f => f.name).join(", ");
  $("#goBtn").disabled = !(uploaded[1] && uploaded[2] && uploaded[3]);
}
async function createCase(body) {
  if (state.busy) return; state.busy = true;
  try {
    const r = await fetch(API + "/api/cases", { method: "POST", body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || "Upload failed");
    state.letters = {}; state.inv = null;
    go("#/investigate/" + j.case_id);
  } catch (e) { toast(e.message); }
  finally { state.busy = false; }
}
function startSample(id) { const fd = new FormData(); fd.append("sample_case", id); createCase(fd); }
function startUpload() {
  const fd = new FormData();
  [1, 2, 3].forEach(n => (uploaded[n] || []).forEach(f => fd.append("files", f, f.name)));
  createCase(fd);
}

/* ---------------- INVESTIGATE ---------------- */
function setStage(i) {
  $("#stepper").innerHTML = STAGES.map((s, k) => {
    const cls = k < i ? "done" : k === i ? "active" : "";
    const ic = k < i ? "✓" : k === i ? '<span class="icon spin" style="width:14px;height:14px"></span>' : (k + 1);
    return `<div class="step ${cls}">${ic} ${s}</div>`;
  }).join("");
}
const FACT_ROWS = [["patient", "Patient"], ["since", "Policy since"], ["months", "Continuous cover"], ["stay", "Hospital stay"],
  ["treat", "Treatment"], ["amount", "Amount claimed"], ["reason", "Insurer's reason"]];
function setFact(k, html) { const el = $("#f_" + k); if (el) el.innerHTML = html; }
function statusBits(s) {
  return s === "fail" ? ["fail", "✗", "Violation"] : s === "pass" ? ["ok", "✓", "OK"] : ["na", "–", "N/A"];
}
function thinkingRow(text) {
  return `<div class="row" id="thinking"><span class="icon spin"></span><div><div class="rt">${text}</div><div class="rf" id="thinkMsg">Opus 5.5 is reading your policy against 9 IRDAI rules</div></div></div>`;
}
function runInvestigation(caseId) {
  state.caseId = caseId; state.inv = null; state.letters = {}; state.t0 = Date.now(); state.elapsed = null;
  show("investigate");
  $("#invTitle").textContent = "Investigating your claim";
  $("#toResult").style.display = "none";
  $("#notice").style.display = "none";
  $("#checkList").innerHTML = thinkingRow("Reading your documents…").replace("Opus 5.5 is reading your policy against 9 IRDAI rules", "Sonnet 5.5 is extracting dates, amounts and the rejection reason");
  $("#factList").innerHTML = FACT_ROWS.map(([k, l]) => `<dt>${l}</dt><dd id="f_${k}"><span class="ghostline"></span></dd>`).join("");
  setStage(0);

  if (state.es) state.es.close();
  const es = new EventSource(`${API}/api/investigate/${caseId}${FORCE_DEMO ? "?demo=1" : ""}`);
  state.es = es; let finished = false, firstCheck = true;
  const on = (name, fn) => es.addEventListener(name, e => fn(JSON.parse(e.data || "{}")));

  on("step", d => {
    setStage(d.stage);
    if (d.stage === 2) {
      $("#checkList").innerHTML = thinkingRow("Checking IRDAI & policy rules…"); firstCheck = true;
      let i = 0; state.timers.push(setInterval(() => { const m = $("#thinkMsg"); if (m) m.textContent = THINKING[i++ % THINKING.length]; }, 1800));
    }
  });
  on("facts", f => {
    state.facts = f;
    $("#invTitle").textContent = f.claim_number ? `Investigating claim ${f.claim_number}` : "Investigating your claim";
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
    if (firstCheck) { $("#checkList").innerHTML = ""; firstCheck = false; clearTimers(); }
    const [cls, sym, label] = statusBits(k.status);
    const r = document.createElement("div"); r.className = "row";
    r.innerHTML = `<span class="icon ${cls}">${sym}</span><div><div class="rt">${esc(k.title)}<span class="tag ${cls}">${label}</span></div><div class="rf">${esc(k.finding)}</div></div>`;
    $("#checkList").appendChild(r);
  });
  on("notice", d => { $("#notice").textContent = d.message; $("#notice").style.display = "block"; });
  on("verdict", inv => {
    state.inv = inv; state.elapsed = Math.round((Date.now() - state.t0) / 1000); setStage(4);
    $("#toResult").style.display = "inline-flex";
    later(() => go("#/result/" + caseId), 1800);
  });
  on("done", () => { finished = true; es.close(); });
  es.onerror = () => {
    if (finished) return;
    es.close(); clearTimers();
    $("#checkList").innerHTML = `<div class="row"><span class="icon fail">!</span><div><div class="rt">Connection lost</div>
      <div class="rf">The server stopped responding. <a href="#" onclick="retryDemo();return false">Show the saved replay</a> or go back and try again.</div></div></div>`;
  };
}
function retryDemo() { location.search = "?demo=1"; }

/* ---------------- RESULT ---------------- */
async function renderResult(caseId) {
  if (!state.inv || state.caseId !== caseId) {
    const r = await fetch(`${API}/api/cases/${caseId}`);
    if (!r.ok) { toast("Result not found. Start again."); return go("#/"); }
    const j = await r.json();
    state.caseId = caseId; state.facts = j.facts; state.computed = j.computed; state.inv = { ...j.investigation, replay: j.replay }; state.letters = {};
  }
  const { facts: f, computed: c, inv } = state;
  state.lang = "en"; show("result");
  const fails = inv.checks.filter(k => k.status === "fail");
  const others = inv.checks.filter(k => k.status !== "fail");
  const badge = inv.verdict === "STRONG_CASE" ? ["strong", "STRONG CASE"] : inv.verdict === "VALID_REJECTION" ? ["valid", "VALID REJECTION"] : ["contest", "CONTESTABLE"];
  const valid = inv.verdict === "VALID_REJECTION";
  $("#verdictCard").innerHTML = `
    <div><span class="badge ${badge[0]}">${badge[1]}</span> <span class="muted" style="font-size:13px">Confidence: ${esc(inv.confidence)}</span>
      ${inv.replay ? '<span class="pill" style="margin-left:6px">Saved replay</span>' : (state.elapsed ? `<span class="pill" style="margin-left:6px;color:var(--accent);border-color:var(--accent)">⚡ Investigated in ${state.elapsed} s</span>` : "")}
      <h2>${esc(inv.headline)}</h2>
      <div class="muted">${esc(f.patient_name || "")}${f.claim_number ? " · Claim " + esc(f.claim_number) : ""} · ${fails.length ? fails.length + (fails.length > 1 ? " rule violations found" : " rule violation found") : "No rule violations found"}</div></div>
    <div class="stake"><div class="muted" style="font-size:13px">${valid ? "Amount claimed" : "Amount at stake"}</div><div class="amt">${inr(valid ? f.amount_claimed_inr : inv.amount_at_stake_inr || f.amount_claimed_inr)}</div></div>`;

  const seen = new Set();
  const card = (k, ok) => {
    const dup = k.policy_quote && seen.has(k.policy_quote); if (k.policy_quote) seen.add(k.policy_quote);
    const cite = [k.page ? `Policy p. ${k.page}` : "", k.policy_clause || ""].filter(Boolean).join(", ");
    return `<div class="card vcard ${ok ? "okc" : ""}">
      <h4>${esc(k.title)} ${ok ? "" : `<span class="tag fail">${esc(k.severity)}</span>`}</h4>
      <div>${esc(k.finding)}</div>
      ${k.policy_quote && !dup ? `<div class="quote">“${esc(k.policy_quote)}”</div>` : ""}
      ${(cite || k.regulation) ? `<div class="cite" style="margin-top:8px">${cite ? `<span>${esc(cite)}${dup ? " (quoted above)" : ""}</span>` : ""}${k.regulation ? `<span>${esc(k.regulation)}</span>` : ""}</div>` : ""}
    </div>`;
  };
  const mini = k => { const [cls, sym] = statusBits(k.status); return `<div class="row"><span class="icon ${cls}">${sym}</span><div><div class="rt">${esc(k.title)}</div><div class="rf">${esc(k.finding)}</div></div></div>`; };

  if (valid) {
    const main = inv.checks.find(k => k.policy_quote) || inv.checks[0];
    $("#violations").innerHTML = `<h3 class="section-t">Why the rejection holds</h3>${main ? card(main, true) : ""}
      <div class="card next"><b>What you can do</b><ul>${(inv.next_steps || []).map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>
      <details class="others"><summary>See all ${inv.checks.length} checks</summary>${inv.checks.filter(k => k !== main).map(mini).join("")}</details>`;
    $("#actionArea").innerHTML = "";
  } else {
    $("#violations").innerHTML = `<h3 class="section-t">What the insurer got wrong</h3>${fails.map(k => card(k, false)).join("")}
      <details class="others"><summary>${others.length} other checks passed or didn't apply</summary>${others.map(mini).join("")}</details>`;
    $("#actionArea").innerHTML = `<div class="actions">
      <button class="btn" onclick="openLetter('en')">✍️ Draft appeal letter</button>
      <button class="btn ghost" onclick="openLetter('hi')">हिंदी में</button>
      <button class="btn ghost" onclick="openLetter('mr')">मराठीत</button></div>`;
  }
  $("#letter").classList.remove("on");

  const steps = valid
    ? (inv.next_steps || []).slice(0, 4).map((s, i) => [i === 0 ? "Now" : "Next", s])
    : [["Today · " + c.today, "Send the appeal to the Grievance Officer"], ["By " + c.appeal_reply_due, "Insurer must reply. If not, escalate"],
       ["Bima Bharosa", "File on IRDAI's grievance portal"], ["By " + c.ombudsman_deadline, "Insurance Ombudsman · free · up to ₹50 lakh"]];
  $("#nextTitle").style.display = valid ? "none" : "block";
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
    body.innerHTML = `<span class="muted"><span class="icon spin" style="display:inline-block;width:14px;height:14px;vertical-align:-2px"></span> ${lang === "en" ? "Sonnet 5.5 is writing your letter…" : "Translating your letter…"}</span>`;
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
function copyLetter() {
  const t = state.letters[state.lang] || "";
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("Letter copied"), () => toast("Select the text to copy"));
}
function shareWhatsApp() {
  const t = state.letters[state.lang] || "";
  window.open("https://wa.me/?text=" + encodeURIComponent(t), "_blank");
}
function downloadLetter() {
  const t = state.letters[state.lang] || "";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([t], { type: "text/plain;charset=utf-8" }));
  a.download = `ClaimSathi_appeal_${state.lang}.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- BOOT ---------------- */
fetch(API + "/api/health").then(r => r.json()).then(h => {
  const mode = FORCE_DEMO || h.force_demo ? "Demo mode · saved replays" : h.has_api_key ? "Live · Opus 5.5 + Sonnet 5.5" : "No API key · saved replays";
  $("#modePill").textContent = mode;
}).catch(() => { $("#modePill").textContent = "Backend offline"; });
renderChips(); route();
