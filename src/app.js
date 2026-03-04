/* ══════════════════════════════════════════════════
   COUNTDOWN MANAGER — App Logic
   Storage  : localStorage
   UI Model : single-page, inline form, card list
   ══════════════════════════════════════════════════ */

'use strict';

// ── Constants ──────────────────────────────────────
const STORAGE_KEY = 'countdown_mgr_v2';

// Accent colours cycled on each new event
const ACCENT_CYCLE = [
  '#7b61ff', // violet
  '#38bdf8', // sky
  '#34d399', // emerald
  '#fbbf24', // amber
  '#fb7185', // rose
  '#fb923c', // orange
];

let accentIndex = 0;

// ── State ──────────────────────────────────────────
let events = [];          // { id, label, datetime, color, createdAt }
let tickInterval = null;
let pendingDeleteId = null;
let prevSecs = {};        // track previous seconds per card for tick animation

// ── Persistence ────────────────────────────────────
function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    events = raw ? JSON.parse(raw) : [];
  } catch {
    events = [];
  }
}

function saveEvents() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch (e) {
    console.warn('localStorage write failed:', e);
  }
}

// ── Event Factory ──────────────────────────────────
function makeEvent(label, datetimeISO) {
  const color = ACCENT_CYCLE[accentIndex % ACCENT_CYCLE.length];
  accentIndex++;
  return {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label,
    datetime: datetimeISO,
    color,
    createdAt: new Date().toISOString(),
  };
}

// ── Time Helpers ───────────────────────────────────
function getCountdown(targetISO) {
  const diff = new Date(targetISO).getTime() - Date.now();
  if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const total = Math.floor(diff / 1000);
  return {
    expired: false,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function pad(n, len = 2) { return String(n).padStart(len, '0'); }

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── DOM Refs ───────────────────────────────────────
const formEl = document.getElementById('event-form');
const inputLabel = document.getElementById('input-label');
const inputDt = document.getElementById('input-datetime');
const errLabel = document.getElementById('err-label');
const errDt = document.getElementById('err-datetime');
const cardsList = document.getElementById('cards-list');
const eventCount = document.getElementById('event-count');
const emptyState = document.getElementById('empty-state');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmDesc = document.getElementById('confirm-desc');

// ── Render ─────────────────────────────────────────
function render() {
  cardsList.innerHTML = '';
  eventCount.textContent = events.length;

  if (events.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  events.forEach(ev => {
    const cd = getCountdown(ev.datetime);
    const li = buildCard(ev, cd);
    cardsList.appendChild(li);
  });
}

function buildCard(ev, cd) {
  const li = document.createElement('li');
  li.className = 'card' + (cd.expired ? ' is-expired' : '');
  li.dataset.id = ev.id;
  li.style.setProperty('--card-color', ev.color);

  li.innerHTML = `
    <div class="card__body">
      <div class="card__label">${escHtml(ev.label)}</div>

      <div class="card__countdown" id="countdown-${ev.id}" role="timer" aria-live="off" aria-label="Time remaining">
        <div class="unit" id="unit-days-${ev.id}">
          <span class="unit__value" id="val-days-${ev.id}">${pad(cd.days, 3)}</span>
          <span class="unit__label">Days</span>
        </div>
        <span class="unit__sep" aria-hidden="true">:</span>
        <div class="unit" id="unit-hours-${ev.id}">
          <span class="unit__value" id="val-hours-${ev.id}">${pad(cd.hours)}</span>
          <span class="unit__label">Hours</span>
        </div>
        <span class="unit__sep" aria-hidden="true">:</span>
        <div class="unit" id="unit-mins-${ev.id}">
          <span class="unit__value" id="val-mins-${ev.id}">${pad(cd.minutes)}</span>
          <span class="unit__label">Mins</span>
        </div>
        <span class="unit__sep" aria-hidden="true">:</span>
        <div class="unit" id="unit-secs-${ev.id}">
          <span class="unit__value" id="val-secs-${ev.id}">${pad(cd.seconds)}</span>
          <span class="unit__label">Secs</span>
        </div>
      </div>

      <span class="card__expired-badge" aria-label="Event expired">🎉 This event has passed!</span>

      <div class="card__date" aria-label="Event date">${formatDate(ev.datetime)}</div>
    </div>

    <div class="card__actions">
      <button
        class="btn btn--del"
        data-id="${ev.id}"
        aria-label="Delete ${escHtml(ev.label)}"
        title="Delete event"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>
  `;

  // Delete button
  li.querySelector('.btn--del').addEventListener('click', (e) => {
    e.stopPropagation();
    openConfirm(ev.id);
  });

  return li;
}

// ── Live Tick Update ───────────────────────────────
function tickAll() {
  events.forEach(ev => {
    const cd = getCountdown(ev.datetime);

    // If card just expired, do a full re-render
    const card = cardsList.querySelector(`[data-id="${ev.id}"]`);
    if (!card) return;

    const wasExpired = card.classList.contains('is-expired');
    if (cd.expired && !wasExpired) {
      render(); // flip expired state
      return;
    }
    if (cd.expired) return; // nothing to update

    // Update values in place (no DOM rebuild)
    const vDays = document.getElementById(`val-days-${ev.id}`);
    const vHours = document.getElementById(`val-hours-${ev.id}`);
    const vMins = document.getElementById(`val-mins-${ev.id}`);
    const vSecs = document.getElementById(`val-secs-${ev.id}`);

    if (!vSecs) return;

    // Tick animation only on seconds digit when it changes
    const prev = prevSecs[ev.id];
    if (prev !== cd.seconds) {
      triggerTick(vSecs);
      prevSecs[ev.id] = cd.seconds;
    }

    vDays.textContent = pad(cd.days, 3);
    vHours.textContent = pad(cd.hours);
    vMins.textContent = pad(cd.minutes);
    vSecs.textContent = pad(cd.seconds);
  });
}

function triggerTick(el) {
  el.classList.remove('tick');
  void el.offsetWidth;
  el.classList.add('tick');
}

// ── Form Submit ────────────────────────────────────
function handleSubmit(e) {
  e.preventDefault();

  const label = inputLabel.value.trim();
  const dtVal = inputDt.value;
  let valid = true;

  // Validate label
  if (!label) {
    errLabel.textContent = 'Please enter an event name.';
    inputLabel.classList.add('is-invalid');
    valid = false;
  } else {
    errLabel.textContent = '';
    inputLabel.classList.remove('is-invalid');
  }

  // Validate datetime
  if (!dtVal) {
    errDt.textContent = 'Please pick a date and time.';
    inputDt.classList.add('is-invalid');
    valid = false;
  } else {
    errDt.textContent = '';
    inputDt.classList.remove('is-invalid');
  }

  if (!valid) return;

  const isoDatetime = new Date(dtVal).toISOString();
  const ev = makeEvent(label, isoDatetime);
  events.unshift(ev);
  saveEvents();
  render();

  // Reset form
  inputLabel.value = '';
  inputDt.value = '';
  inputLabel.focus();
}

// ── Delete Confirm ─────────────────────────────────
function openConfirm(id) {
  pendingDeleteId = id;
  const ev = events.find(e => e.id === id);
  confirmDesc.textContent = ev
    ? `"${ev.label}" will be permanently removed.`
    : 'This event will be permanently removed.';
  confirmOverlay.hidden = false;
}

function closeConfirm() {
  confirmOverlay.hidden = true;
  pendingDeleteId = null;
}

function doDelete() {
  if (!pendingDeleteId) return;
  delete prevSecs[pendingDeleteId];
  events = events.filter(e => e.id !== pendingDeleteId);
  saveEvents();
  closeConfirm();
  render();
}

// ── Event Listeners ────────────────────────────────
formEl.addEventListener('submit', handleSubmit);

inputLabel.addEventListener('input', () => {
  errLabel.textContent = '';
  inputLabel.classList.remove('is-invalid');
});

inputDt.addEventListener('input', () => {
  errDt.textContent = '';
  inputDt.classList.remove('is-invalid');
});

document.getElementById('btn-cancel-del').addEventListener('click', closeConfirm);
document.getElementById('btn-confirm-del').addEventListener('click', doDelete);

confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) closeConfirm();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmOverlay.hidden) closeConfirm();
});

// ── Boot ───────────────────────────────────────────
function boot() {
  loadEvents();

  // Pre-set accent index past already-used colours
  accentIndex = events.length % ACCENT_CYCLE.length;

  // Default datetime to 7 days from now
  const d = new Date(Date.now() + 7 * 86400000);
  const pad2 = n => String(n).padStart(2, '0');
  inputDt.value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  render();

  // Tick every second
  tickInterval = setInterval(tickAll, 1000);
}

boot();
