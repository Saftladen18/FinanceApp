'use strict';

/* ================= Daten ================= */

const STORE_KEY = 'kostenapp.v1';
const PALETTE = ['#16a34a', '#f97316', '#2563eb', '#9333ea', '#0891b2', '#e11d48',
  '#ca8a04', '#db2777', '#0d9488', '#7c3aed', '#64748b', '#b45309'];
const DEFAULT_CATS = [
  ['Lebensmittel', '🛒'], ['Essen & Trinken', '🍽️'], ['Transport & Auto', '🚗'],
  ['Wohnen', '🏠'], ['Abos & Verträge', '📱'], ['Freizeit', '🎉'], ['Shopping', '🛍️'],
  ['Gesundheit', '💊'], ['Reisen', '✈️'], ['Geschenke', '🎁'], ['Sonstiges', '📦'],
];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function defaultState() {
  return {
    version: 1,
    settings: { currency: 'EUR', budgetEnabled: false, budget: 0, lastBackup: null },
    categories: DEFAULT_CATS.map(([name, emoji], i) => ({ id: uid(), name, emoji, color: PALETTE[i % PALETTE.length] })),
    people: [],
    entries: [],
  };
}

function migrate(s) {
  const d = defaultState();
  s.settings = { ...d.settings, ...(s.settings || {}) };
  if (!Array.isArray(s.categories) || !s.categories.length) s.categories = d.categories;
  if (!Array.isArray(s.people)) s.people = [];
  if (!Array.isArray(s.entries)) s.entries = [];
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.error(e); }
  return defaultState();
}

let state = load();

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { alert('Speichern fehlgeschlagen: ' + e.message); }
}

/* ================= Hilfsfunktionen ================= */

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = cents => new Intl.NumberFormat('de-DE', { style: 'currency', currency: state.settings.currency || 'EUR' }).format((cents || 0) / 100);
const fmtShort = cents => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round((cents || 0) / 100));

function parseMoney(str) {
  if (str == null) return NaN;
  let s = String(str).trim().replace(/[\s€]/g, '');
  if (s === '') return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
const toInput = cents => (cents / 100).toFixed(2).replace('.', ',');

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const thisMonth = () => today().slice(0, 7);
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return ymd(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}
const monthShort = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'short' }); };
function dayLabel(date) {
  if (date === today()) return 'Heute';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (date === ymd(y)) return 'Gestern';
  const [a, b, c] = date.split('-').map(Number);
  return new Date(a, b - 1, c).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}
const shortDate = date => { const [, m, d] = date.split('-'); return `${d}.${m}.`; };

const cat = id => state.categories.find(c => c.id === id) || { name: 'Unbekannt', emoji: '❔', color: '#999' };
const person = id => state.people.find(p => p.id === id) || { name: 'Unbekannt' };
const visiblePeople = () => state.people.filter(p => !p.hidden);

const othersSum = e => (e.shares || []).reduce((a, s) => a + s.amount, 0);
// Mein Anteil = was in der Statistik zählt
const myShare = e => e.kind === 'received' ? e.amount : e.amount - othersSum(e);
const entriesOfMonth = key => state.entries.filter(e => e.date.startsWith(key));
const monthTotal = key => entriesOfMonth(key).reduce((a, e) => a + myShare(e), 0);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function addPersonPrompt() {
  const name = (prompt('Name der Person:') || '').trim();
  if (!name) return null;
  const existing = state.people.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) { existing.hidden = false; save(); return existing.id; }
  const p = { id: uid(), name };
  state.people.push(p);
  save();
  return p.id;
}

/* ================= Navigation ================= */

let tab = 'add';
let draft = null;
const ui = { listMonth: thisMonth(), statsMonth: thisMonth(), showSettled: false };

function go(t) {
  tab = t;
  if (t === 'add' && !draft) draft = newDraft();
  render();
  window.scrollTo(0, 0);
}

function render() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ({ add: renderAdd, list: renderList, stats: renderStats, debts: renderDebts, settings: renderSettings })[tab]();
}

document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.tab === 'add' && tab === 'add' && draft && draft.id) draft = null; // "Neu" verlässt Bearbeiten
  go(b.dataset.tab);
}));

/* ================= Erfassen ================= */

function newDraft() {
  return {
    id: null, amountStr: '', kind: 'paid', categoryId: null, date: today(), note: '',
    people: [], includeMe: true, mode: 'equal', custom: {}, receivedFrom: null, settled: {}, createdAt: null,
  };
}

function draftFromEntry(e) {
  const d = newDraft();
  Object.assign(d, {
    id: e.id, amountStr: toInput(e.amount), kind: e.kind, categoryId: e.categoryId,
    date: e.date, note: e.note || '', createdAt: e.createdAt,
  });
  if (e.kind === 'paid' && e.shares && e.shares.length) {
    d.people = e.shares.map(s => s.personId);
    d.mode = 'custom';
    e.shares.forEach(s => { d.custom[s.personId] = toInput(s.amount); d.settled[s.personId] = s.settled; });
  }
  if (e.kind === 'received') { d.receivedFrom = e.personId; d.settled.received = e.settled; }
  return d;
}

function computeSplit(d) {
  const total = parseMoney(d.amountStr);
  const t = Number.isFinite(total) ? total : 0;
  if (!d.people.length) return { total, shares: [], mine: t };
  if (d.mode === 'equal') {
    const n = d.people.length + (d.includeMe ? 1 : 0);
    const base = Math.floor(t / n);
    let rest = t - base * n;
    const shares = d.people.map(p => { const a = base + (rest > 0 ? 1 : 0); if (rest > 0) rest--; return { personId: p, amount: a }; });
    return { total, shares, mine: d.includeMe ? base : 0 };
  }
  const shares = d.people.map(p => ({ personId: p, amount: parseMoney(d.custom[p]) || 0 }));
  return { total, shares, mine: t - shares.reduce((a, s) => a + s.amount, 0) };
}

function budgetInfo() {
  const s = state.settings;
  if (!s.budgetEnabled || !(s.budget > 0)) return null;
  const spent = monthTotal(thisMonth());
  return { spent, budget: s.budget, pct: spent / s.budget };
}

function renderAdd() {
  const d = draft || (draft = newDraft());
  const b = budgetInfo();
  $('#view').innerHTML = `
    <h1>${d.id ? 'Eintrag bearbeiten' : 'Neue Ausgabe'}</h1>
    ${b && !d.id ? `<div class="hint">Budget ${monthLabel(thisMonth())}: noch <b class="${b.pct >= 1 ? 'neg' : ''}">${fmt(b.budget - b.spent)}</b> von ${fmt(b.budget)}</div>` : ''}
    <div class="amount-box">
      <input id="amt" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off" value="${esc(d.amountStr)}">
      <span>€</span>
    </div>
    <div class="seg" id="kind">
      <button data-k="paid" class="${d.kind === 'paid' ? 'on' : ''}">Ich habe bezahlt</button>
      <button data-k="received" class="${d.kind === 'received' ? 'on' : ''}">Jemand zahlte für mich</button>
    </div>
    <div class="label">Kategorie</div>
    <div class="cat-grid">
      ${state.categories.map(c => `
        <button class="cat ${d.categoryId === c.id ? 'on' : ''}" data-c="${c.id}" style="--c:${esc(c.color)}">
          <span class="emo">${esc(c.emoji)}</span><span>${esc(c.name)}</span>
        </button>`).join('')}
    </div>
    <div id="people-section"></div>
    <label>Notiz<input id="note" type="text" placeholder="optional, z. B. Rewe" value="${esc(d.note)}"></label>
    <label>Datum<input id="date" type="date" value="${esc(d.date)}"></label>
    <button class="primary" id="save">Speichern</button>
    ${d.id ? `<button class="ghost" id="cancel">Abbrechen</button><button class="ghost danger" id="del">Eintrag löschen</button>` : ''}
  `;

  $('#amt').addEventListener('input', e => { d.amountStr = e.target.value; updateSplitView(); });
  $('#note').addEventListener('input', e => { d.note = e.target.value; });
  $('#date').addEventListener('change', e => { d.date = e.target.value || today(); });
  document.querySelectorAll('#kind button').forEach(btn => btn.addEventListener('click', () => {
    d.kind = btn.dataset.k;
    document.querySelectorAll('#kind button').forEach(x => x.classList.toggle('on', x === btn));
    renderPeopleSection();
  }));
  document.querySelectorAll('.cat').forEach(btn => btn.addEventListener('click', () => {
    d.categoryId = btn.dataset.c;
    document.querySelectorAll('.cat').forEach(x => x.classList.toggle('on', x === btn));
  }));
  $('#save').addEventListener('click', saveDraft);
  if (d.id) {
    $('#cancel').addEventListener('click', () => { draft = null; go('list'); });
    $('#del').addEventListener('click', () => {
      if (!confirm('Eintrag wirklich löschen?')) return;
      state.entries = state.entries.filter(e => e.id !== d.id);
      save(); draft = null; toast('Gelöscht'); go('list');
    });
  }
  renderPeopleSection();
}

function chipsHtml(selectedIds) {
  return `<div class="chips">
    ${visiblePeople().map(p => `<button class="chip ${selectedIds.includes(p.id) ? 'on' : ''}" data-p="${p.id}">${esc(p.name)}</button>`).join('')}
    <button class="chip add" data-add="1">+ Person</button>
  </div>`;
}

function renderPeopleSection() {
  const d = draft;
  const box = $('#people-section');
  if (d.kind === 'received') {
    box.innerHTML = `
      <div class="label">Wer hat für dich bezahlt?</div>
      ${chipsHtml(d.receivedFrom ? [d.receivedFrom] : [])}
      <p class="hint">Zählt als deine Ausgabe. Du schuldest der Person den Betrag – siehe „Auslagen“.</p>`;
    box.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
      d.receivedFrom = ch.dataset.add ? (addPersonPrompt() || d.receivedFrom) : ch.dataset.p;
      renderPeopleSection();
    }));
    return;
  }

  box.innerHTML = `
    <div class="label">Für andere mitbezahlt? <small>(optional)</small></div>
    ${chipsHtml(d.people)}
    <div id="split-detail"></div>`;
  box.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
    if (ch.dataset.add) {
      const id = addPersonPrompt();
      if (id && !d.people.includes(id)) d.people.push(id);
    } else {
      const id = ch.dataset.p;
      d.people = d.people.includes(id) ? d.people.filter(x => x !== id) : [...d.people, id];
    }
    renderPeopleSection();
  }));
  renderSplitDetail();
}

function renderSplitDetail() {
  const d = draft;
  const box = $('#split-detail');
  if (!box) return;
  if (!d.people.length) {
    box.innerHTML = `<p class="hint">Wähle Personen, wenn du etwas für andere ausgelegt hast. Nur dein Anteil zählt dann in der Statistik.</p>`;
    return;
  }
  const sp = computeSplit(d);
  box.innerHTML = `
    <div class="seg" id="mode">
      <button data-m="equal" class="${d.mode === 'equal' ? 'on' : ''}">Gleich aufteilen</button>
      <button data-m="custom" class="${d.mode === 'custom' ? 'on' : ''}">Beträge eingeben</button>
    </div>
    ${d.mode === 'equal' ? `<label class="check"><input type="checkbox" id="incme" ${d.includeMe ? 'checked' : ''}> Ich bin auch dabei (habe einen Anteil)</label>` : ''}
    <div class="split">
      ${sp.shares.map(s => `
        <div class="r"><span>${esc(person(s.personId).name)} zahlt dir</span>
          ${d.mode === 'equal'
            ? `<span data-share="${s.personId}">${fmt(s.amount)}</span>`
            : `<input type="text" inputmode="decimal" data-custom="${s.personId}" placeholder="0,00" value="${esc(d.custom[s.personId] || '')}">`}
        </div>`).join('')}
      <div class="r me"><span>Dein Anteil (Statistik)</span><span id="mine">${fmt(sp.mine)}</span></div>
    </div>
    <p class="hint" id="split-hint"></p>`;
  updateSplitHint(sp);

  box.querySelectorAll('#mode button').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.m === 'custom' && d.mode === 'equal') {
      // gleiche Aufteilung als Startwerte übernehmen
      computeSplit(d).shares.forEach(s => { d.custom[s.personId] = s.amount ? toInput(s.amount) : ''; });
    }
    d.mode = btn.dataset.m;
    renderSplitDetail();
  }));
  const inc = $('#incme');
  if (inc) inc.addEventListener('change', () => { d.includeMe = inc.checked; renderSplitDetail(); });
  box.querySelectorAll('[data-custom]').forEach(inp => inp.addEventListener('input', () => {
    d.custom[inp.dataset.custom] = inp.value;
    updateSplitView();
  }));
}

function updateSplitView() {
  const d = draft;
  if (d.kind !== 'paid' || !d.people.length) return;
  const sp = computeSplit(d);
  sp.shares.forEach(s => { const el = document.querySelector(`[data-share="${s.personId}"]`); if (el) el.textContent = fmt(s.amount); });
  const mine = $('#mine');
  if (mine) { mine.textContent = fmt(sp.mine); mine.classList.toggle('neg', sp.mine < 0); }
  updateSplitHint(sp);
}

function updateSplitHint(sp) {
  const el = $('#split-hint');
  if (!el) return;
  const others = sp.shares.reduce((a, s) => a + s.amount, 0);
  el.innerHTML = sp.mine < 0
    ? `<span class="neg">Die Anteile sind höher als der Gesamtbetrag.</span>`
    : `Du zahlst ${fmt(Number.isFinite(sp.total) ? sp.total : 0)}, andere schulden dir zusammen ${fmt(others)}.`;
}

function saveDraft() {
  const d = draft;
  const total = parseMoney(d.amountStr);
  if (!Number.isFinite(total) || total <= 0) { toast('Bitte einen Betrag eingeben'); $('#amt').focus(); return; }
  if (!d.categoryId || !state.categories.some(c => c.id === d.categoryId)) { toast('Bitte eine Kategorie wählen'); return; }

  const entry = {
    id: d.id || uid(), kind: d.kind, amount: total, categoryId: d.categoryId,
    date: d.date || today(), note: d.note.trim(), createdAt: d.createdAt || Date.now(),
  };
  if (d.kind === 'received') {
    if (!d.receivedFrom) { toast('Bitte wählen, wer bezahlt hat'); return; }
    entry.personId = d.receivedFrom;
    entry.settled = !!d.settled.received && d.receivedFrom === draftFromEntryPerson(d);
  } else {
    const sp = computeSplit(d);
    if (sp.mine < 0) { toast('Die Anteile sind höher als der Betrag'); return; }
    entry.shares = sp.shares.filter(s => s.amount > 0).map(s => ({ ...s, settled: !!d.settled[s.personId] }));
  }

  const idx = state.entries.findIndex(e => e.id === entry.id);
  if (idx >= 0) state.entries[idx] = entry; else state.entries.push(entry);
  save();

  const wasEdit = !!d.id;
  draft = null;
  let msg = wasEdit ? 'Änderung gespeichert ✓' : 'Gespeichert ✓';
  const b = budgetInfo();
  if (b && b.pct >= 1) msg += ` · Budget überschritten (${Math.round(b.pct * 100)} %)`;
  else if (b && b.pct >= 0.8) msg += ` · ${Math.round(b.pct * 100)} % vom Budget`;
  toast(msg);
  go(wasEdit ? 'list' : 'add');
}

// Status "erledigt" nur behalten, wenn die Person beim Bearbeiten gleich bleibt
function draftFromEntryPerson(d) {
  const old = state.entries.find(e => e.id === d.id);
  return old ? old.personId : null;
}

/* ================= Liste ================= */

function monthNav(key, prop) {
  return `<div class="month-nav">
    <button data-mn="-1" aria-label="Vorheriger Monat">‹</button>
    <strong>${monthLabel(key)}</strong>
    <button data-mn="1" aria-label="Nächster Monat">›</button>
  </div>`;
}
function bindMonthNav(prop) {
  document.querySelectorAll('[data-mn]').forEach(b => b.addEventListener('click', () => {
    ui[prop] = shiftMonth(ui[prop], Number(b.dataset.mn));
    render();
  }));
}

function entryRow(e) {
  const c = cat(e.categoryId);
  let sub = esc(c.name);
  let right = `${fmt(myShare(e))}`;
  if (e.kind === 'received') {
    sub += ` · ${esc(person(e.personId).name)} hat bezahlt${e.settled ? ' ✓' : ''}`;
  } else if (e.shares && e.shares.length) {
    const open = e.shares.filter(s => !s.settled).reduce((a, s) => a + s.amount, 0);
    sub += ` · mit ${e.shares.map(s => esc(person(s.personId).name)).join(', ')}`;
    right += `<small>bezahlt ${fmt(e.amount)}${open ? '' : ' ✓'}</small>`;
  }
  return `<button class="item" data-edit="${e.id}">
    <span class="dot" style="background:${esc(c.color)}22">${esc(c.emoji)}</span>
    <span class="mid"><div>${esc(e.note || c.name)}</div><div>${sub}</div></span>
    <span class="amt">${right}</span>
  </button>`;
}

function renderList() {
  const key = ui.listMonth;
  const list = entriesOfMonth(key).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  let html = `<h1>Liste</h1>${monthNav(key)}
    <div class="hint">Deine Ausgaben: <b>${fmt(monthTotal(key))}</b> · ${list.length} Einträge</div>`;
  if (!list.length) html += `<div class="empty">Keine Einträge in diesem Monat.</div>`;
  let lastDay = null, open = false;
  list.forEach(e => {
    if (e.date !== lastDay) {
      if (open) html += '</div>';
      html += `<div class="day">${dayLabel(e.date)}</div><div class="list">`;
      lastDay = e.date; open = true;
    }
    html += entryRow(e);
  });
  if (open) html += '</div>';
  $('#view').innerHTML = html;
  bindMonthNav('listMonth');
  document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const e = state.entries.find(x => x.id === b.dataset.edit);
    if (e) { draft = draftFromEntry(e); go('add'); }
  }));
}

/* ================= Statistik ================= */

function donut(parts, total) {
  const R = 70, C = 2 * Math.PI * R;
  let off = 0;
  const segs = parts.map(p => {
    const len = total ? (p.value / total) * C : 0;
    const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${esc(p.color)}" stroke-width="28"
      stroke-dasharray="${Math.max(len - 1.5, 0.01)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`;
    off += len;
    return s;
  }).join('');
  return `<svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Ausgaben nach Kategorie">
    <circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--line)" stroke-width="28"/>
    ${segs}
    <text x="90" y="86" text-anchor="middle" font-size="12" fill="var(--muted)">Gesamt</text>
    <text x="90" y="106" text-anchor="middle" font-size="18" font-weight="700" fill="var(--text)">${fmtShort(total)} €</text>
  </svg>`;
}

function renderStats() {
  const key = ui.statsMonth;
  const total = monthTotal(key);
  const byCat = {};
  entriesOfMonth(key).forEach(e => { byCat[e.categoryId] = (byCat[e.categoryId] || 0) + myShare(e); });
  const parts = Object.entries(byCat).filter(([, v]) => v > 0)
    .map(([id, value]) => ({ ...cat(id), value })).sort((a, b) => b.value - a.value);

  const s = state.settings;
  let budgetHtml = '';
  if (s.budgetEnabled && s.budget > 0) {
    const pct = total / s.budget;
    const cls = pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : '';
    budgetHtml = `<div class="bar-bg"><div class="bar-fg ${cls}" style="width:${Math.min(pct, 1) * 100}%"></div></div>
      <div class="hint">${Math.round(pct * 100)} % von ${fmt(s.budget)} · ${pct >= 1
        ? `<span class="neg">${fmt(total - s.budget)} drüber</span>` : `noch ${fmt(s.budget - total)}`}</div>`;
  }

  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(key, -i));
  const vals = months.map(monthTotal);
  const max = Math.max(...vals, s.budgetEnabled ? s.budget : 0, 1);

  $('#view').innerHTML = `
    <h1>Statistik</h1>
    ${monthNav(key)}
    <div class="card">
      <div class="muted">Deine Ausgaben</div>
      <div class="big">${fmt(total)}</div>
      ${budgetHtml}
    </div>
    <div class="card">
      ${parts.length ? `<div class="donut-wrap">${donut(parts, total)}</div>
        <div class="legend">${parts.map(p => `
          <div class="r"><span class="sw" style="background:${esc(p.color)}"></span>
            <span class="n">${esc(p.emoji)} ${esc(p.name)}</span>
            <span>${fmt(p.value)}</span><span class="p">${Math.round(p.value / total * 100)} %</span></div>`).join('')}
        </div>` : `<div class="empty">Noch keine Ausgaben in diesem Monat.</div>`}
    </div>
    <div class="card">
      <div class="muted">Letzte 6 Monate</div>
      <div class="bars">${months.map((m, i) => `
        <button class="col ${m === key ? 'on' : ''}" data-month="${m}">
          <span class="v">${vals[i] ? fmtShort(vals[i]) : ''}</span>
          <span class="b" style="height:${vals[i] / max * 100}%"></span>
          <span>${monthShort(m)}</span>
        </button>`).join('')}
      </div>
    </div>`;
  bindMonthNav('statsMonth');
  document.querySelectorAll('[data-month]').forEach(b => b.addEventListener('click', () => { ui.statsMonth = b.dataset.month; render(); }));
}

/* ================= Auslagen ================= */

// Alle offenen (bzw. erledigten) Posten, je Person
function debtItems(settled) {
  const items = [];
  state.entries.forEach(e => {
    if (e.kind === 'paid') (e.shares || []).forEach(s => {
      if (!!s.settled === settled) items.push({ entry: e, personId: s.personId, amount: s.amount, sign: 1, share: s });
    });
    if (e.kind === 'received' && !!e.settled === settled)
      items.push({ entry: e, personId: e.personId, amount: e.amount, sign: -1 });
  });
  return items.sort((a, b) => b.entry.date.localeCompare(a.entry.date));
}

function setSettled(item, value) {
  if (item.sign > 0) item.share.settled = value; else item.entry.settled = value;
}

function renderDebts() {
  const open = debtItems(false);
  const groups = {};
  open.forEach(it => { (groups[it.personId] ||= []).push(it); });
  const owedToMe = open.filter(i => i.sign > 0).reduce((a, i) => a + i.amount, 0);
  const iOwe = open.filter(i => i.sign < 0).reduce((a, i) => a + i.amount, 0);

  const itemRow = (it, done) => {
    const e = it.entry, c = cat(e.categoryId);
    return `<div class="item">
      <span class="dot" style="background:${esc(c.color)}22">${esc(c.emoji)}</span>
      <span class="mid"><div>${esc(e.note || c.name)}</div>
        <div>${shortDate(e.date)} · ${it.sign > 0 ? 'du hast ausgelegt' : 'hat für dich bezahlt'}</div></span>
      <span class="amt ${it.sign > 0 ? 'pos' : 'neg'}">${it.sign > 0 ? '+' : '−'}${fmt(it.amount)}</span>
      <button class="small-btn ${done ? '' : 'accent'}" data-toggle="${e.id}|${it.personId}|${it.sign}">${done ? '↺' : '✓'}</button>
    </div>`;
  };

  let html = `<h1>Auslagen</h1>
    <div class="sum-row">
      <div class="card"><div class="muted">Dir schuldet man</div><div class="big pos" style="font-size:24px">${fmt(owedToMe)}</div></div>
      <div class="card"><div class="muted">Du schuldest</div><div class="big neg" style="font-size:24px">${fmt(iOwe)}</div></div>
    </div>`;

  const ids = Object.keys(groups).sort((a, b) => person(a).name.localeCompare(person(b).name));
  if (!ids.length) html += `<div class="empty">Keine offenen Auslagen 🎉<br><small>Beim Erfassen „Für andere mitbezahlt?“ nutzen.</small></div>`;
  ids.forEach(pid => {
    const bal = groups[pid].reduce((a, i) => a + i.sign * i.amount, 0);
    html += `<div class="card">
      <div class="person-head"><strong>${esc(person(pid).name)}</strong>
        <span class="${bal >= 0 ? 'pos' : 'neg'}">${bal >= 0 ? 'schuldet dir ' + fmt(bal) : 'du schuldest ' + fmt(-bal)}</span></div>
      <div class="list" style="margin-top:8px">${groups[pid].map(it => itemRow(it, false)).join('')}</div>
      <button class="ghost" data-settle-all="${pid}">Alles mit ${esc(person(pid).name)} ausgleichen</button>
    </div>`;
  });

  html += `<label class="check" style="margin-top:20px"><input type="checkbox" id="show-settled" ${ui.showSettled ? 'checked' : ''}> Erledigte anzeigen</label>`;
  if (ui.showSettled) {
    const done = debtItems(true);
    html += done.length
      ? `<div class="list" style="margin-top:10px">${done.map(it => itemRow(it, true).replace('<span class="mid"><div>', `<span class="mid"><div>${esc(person(it.personId).name)}: `)).join('')}</div>`
      : `<p class="hint">Noch nichts erledigt.</p>`;
  }
  $('#view').innerHTML = html;

  const all = [...open, ...(ui.showSettled ? debtItems(true) : [])];
  document.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const [eid, pid, sign] = b.dataset.toggle.split('|');
    const it = all.find(i => i.entry.id === eid && i.personId === pid && String(i.sign) === sign);
    if (!it) return;
    const nowSettled = !(it.sign > 0 ? it.share.settled : it.entry.settled);
    setSettled(it, nowSettled);
    save();
    toast(nowSettled ? 'Als erledigt markiert ✓' : 'Wieder offen');
    render();
  }));
  document.querySelectorAll('[data-settle-all]').forEach(b => b.addEventListener('click', () => {
    const pid = b.dataset.settleAll;
    if (!confirm(`Alle offenen Posten mit ${person(pid).name} als erledigt markieren?`)) return;
    groups[pid].forEach(it => setSettled(it, true));
    save(); toast('Ausgeglichen ✓'); render();
  }));
  $('#show-settled').addEventListener('change', e => { ui.showSettled = e.target.checked; render(); });
}

/* ================= Einstellungen ================= */

function renderSettings() {
  const s = state.settings;
  const usage = id => state.entries.filter(e => e.categoryId === id).length;
  $('#view').innerHTML = `
    <h1>Einstellungen</h1>

    <h2>Monatsbudget</h2>
    <div class="card">
      <div class="toggle-row"><span>Budget aktiv</span><input type="checkbox" id="b-on" ${s.budgetEnabled ? 'checked' : ''}></div>
      ${s.budgetEnabled ? `<label>Betrag pro Monat<input id="b-amt" type="text" inputmode="decimal" value="${s.budget ? toInput(s.budget) : ''}" placeholder="z. B. 800,00"></label>
      <p class="hint">Du bekommst einen Hinweis ab 80 % und wenn das Budget überschritten ist.</p>` : ''}
    </div>

    <h2>Kategorien</h2>
    <div class="card" id="cats">
      ${state.categories.map((c, i) => `
        <div class="set-row" data-id="${c.id}">
          <input class="emoji-in" data-f="emoji" value="${esc(c.emoji)}" aria-label="Emoji">
          <input data-f="name" value="${esc(c.name)}" aria-label="Name">
          <input type="color" data-f="color" value="${esc(c.color)}" aria-label="Farbe">
          <button class="icon-btn" data-up="${i}" ${i === 0 ? 'disabled style="opacity:.25"' : ''} aria-label="Nach oben">↑</button>
          <button class="icon-btn danger" data-delcat="${c.id}" aria-label="Löschen">🗑</button>
        </div>`).join('')}
      <button class="ghost" id="add-cat">+ Kategorie hinzufügen</button>
    </div>

    <h2>Personen</h2>
    <div class="card" id="people">
      ${visiblePeople().map(p => `
        <div class="set-row" data-id="${p.id}">
          <input data-f="name" value="${esc(p.name)}" aria-label="Name">
          <button class="icon-btn danger" data-delp="${p.id}" aria-label="Entfernen">🗑</button>
        </div>`).join('') || '<p class="hint">Noch keine Personen. Du kannst sie auch direkt beim Erfassen anlegen.</p>'}
      <button class="ghost" id="add-p">+ Person hinzufügen</button>
    </div>

    <h2>Daten & Backup</h2>
    <div class="card">
      <p class="hint" style="margin-top:0">Deine Daten liegen nur auf diesem Gerät. Mach regelmäßig ein Backup (z. B. in iCloud Drive speichern).
        <br>Letztes Backup: <b>${s.lastBackup ? new Date(s.lastBackup).toLocaleDateString('de-DE') : 'noch nie'}</b></p>
      <button class="small-btn accent" id="exp-json">Backup exportieren</button>
      <button class="small-btn" id="exp-csv">Als CSV (Excel)</button>
      <button class="small-btn" id="imp">Backup laden</button>
      <input type="file" id="imp-file" accept="application/json,.json" hidden>
      <button class="ghost danger" id="wipe">Alle Daten löschen</button>
    </div>
    <p class="hint" style="text-align:center">${state.entries.length} Einträge gespeichert</p>
  `;

  // Budget
  $('#b-on').addEventListener('change', e => { s.budgetEnabled = e.target.checked; save(); renderSettings(); });
  const bAmt = $('#b-amt');
  if (bAmt) bAmt.addEventListener('change', () => {
    const v = parseMoney(bAmt.value);
    if (!Number.isFinite(v) || v < 0) { toast('Ungültiger Betrag'); return; }
    s.budget = v; save(); bAmt.value = v ? toInput(v) : ''; toast('Budget gespeichert');
  });

  // Kategorien bearbeiten
  document.querySelectorAll('#cats .set-row input').forEach(inp => inp.addEventListener('change', () => {
    const c = state.categories.find(x => x.id === inp.closest('.set-row').dataset.id);
    const v = inp.value.trim();
    if (inp.dataset.f !== 'color' && !v) { inp.value = c[inp.dataset.f]; return; }
    c[inp.dataset.f] = v; save();
  }));
  document.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.dataset.up);
    if (i < 1) return;
    [state.categories[i - 1], state.categories[i]] = [state.categories[i], state.categories[i - 1]];
    save(); renderSettings();
  }));
  document.querySelectorAll('[data-delcat]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.delcat, c = cat(id), n = usage(id);
    if (state.categories.length <= 1) { toast('Mindestens eine Kategorie wird gebraucht'); return; }
    if (n === 0) {
      if (!confirm(`Kategorie „${c.name}“ löschen?`)) return;
    } else {
      let target = state.categories.find(x => x.id !== id && x.name.toLowerCase() === 'sonstiges');
      if (!target) target = state.categories.find(x => x.id !== id);
      if (!confirm(`„${c.name}“ wird in ${n} Einträgen benutzt. Diese werden nach „${target.name}“ verschoben. Fortfahren?`)) return;
      state.entries.forEach(e => { if (e.categoryId === id) e.categoryId = target.id; });
    }
    state.categories = state.categories.filter(x => x.id !== id);
    save(); renderSettings();
  }));
  $('#add-cat').addEventListener('click', () => {
    const name = (prompt('Name der neuen Kategorie:') || '').trim();
    if (!name) return;
    state.categories.push({ id: uid(), name, emoji: '🏷️', color: PALETTE[state.categories.length % PALETTE.length] });
    save(); renderSettings();
    toast('Tipp: Emoji antippen zum Ändern');
  });

  // Personen
  document.querySelectorAll('#people .set-row input').forEach(inp => inp.addEventListener('change', () => {
    const p = state.people.find(x => x.id === inp.closest('.set-row').dataset.id);
    const v = inp.value.trim();
    if (!v) { inp.value = p.name; return; }
    p.name = v; save();
  }));
  document.querySelectorAll('[data-delp]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.delp, p = person(id);
    const used = state.entries.some(e => e.personId === id || (e.shares || []).some(s => s.personId === id));
    if (used) {
      const hasOpen = debtItems(false).some(i => i.personId === id);
      if (hasOpen) { alert(`Mit ${p.name} gibt es noch offene Auslagen. Bitte erst ausgleichen.`); return; }
      if (!confirm(`${p.name} ausblenden? Alte Einträge bleiben erhalten.`)) return;
      p.hidden = true;
    } else {
      if (!confirm(`${p.name} löschen?`)) return;
      state.people = state.people.filter(x => x.id !== id);
    }
    save(); renderSettings();
  }));
  $('#add-p').addEventListener('click', () => { if (addPersonPrompt()) renderSettings(); });

  // Backup
  $('#exp-json').addEventListener('click', async () => {
    const ok = await shareOrDownload(`kosten-backup-${today()}.json`, JSON.stringify(state, null, 2), 'application/json');
    if (ok) { s.lastBackup = Date.now(); save(); renderSettings(); }
  });
  $('#exp-csv').addEventListener('click', () => shareOrDownload(`kosten-${today()}.csv`, toCsv(), 'text/csv'));
  $('#imp').addEventListener('click', () => $('#imp-file').click());
  $('#imp-file').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.entries) || !Array.isArray(data.categories)) throw new Error('Keine gültige Backup-Datei');
      if (!confirm(`Backup mit ${data.entries.length} Einträgen laden? Die aktuellen Daten werden ersetzt.`)) return;
      state = migrate(data); save(); toast('Backup geladen ✓'); renderSettings();
    } catch (err) { alert('Import fehlgeschlagen: ' + err.message); }
    e.target.value = '';
  });
  $('#wipe').addEventListener('click', () => {
    if (!confirm('Wirklich ALLE Einträge, Kategorien und Personen löschen?')) return;
    if (!confirm('Sicher? Das kann nicht rückgängig gemacht werden.')) return;
    state = defaultState(); save(); toast('Alles gelöscht'); renderSettings();
  });
}

function toCsv() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const num = c => (c / 100).toFixed(2).replace('.', ',');
  const rows = [['Datum', 'Kategorie', 'Notiz', 'Art', 'Bezahlt gesamt', 'Mein Anteil', 'Aufteilung / Person', 'Erledigt']];
  [...state.entries].sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    const split = e.kind === 'received' ? person(e.personId).name
      : (e.shares || []).map(s => `${person(s.personId).name}: ${num(s.amount)}`).join(', ');
    const done = e.kind === 'received' ? (e.settled ? 'ja' : 'nein')
      : (e.shares || []).length ? (e.shares.every(s => s.settled) ? 'ja' : 'nein') : '';
    rows.push([e.date, cat(e.categoryId).name, e.note, e.kind === 'received' ? 'Für mich bezahlt' : 'Selbst bezahlt',
      num(e.amount), num(myShare(e)), split, done]);
  });
  return '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
}

async function shareOrDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return true;
    }
  } catch (e) {
    if (e.name === 'AbortError') return false;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return true;
}

/* ================= Start ================= */

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
go('add');
