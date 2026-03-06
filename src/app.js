/* ══════════════════════════════════════════════════
   TICK...TOCK — Full-Featured Countdown Manager
   ══════════════════════════════════════════════════ */

'use strict';

// ── Constants ──────────────────────────────────────
const STORAGE_KEY = 'countdown_mgr_v3';
const SETTINGS_KEY = 'countdown_settings_v1';
const CATEGORIES = ['🎯 General', '🎂 Birthday', '📅 Deadline', '🚀 Launch', '✈️ Vacation', '🎄 Holiday'];

// ── State ──────────────────────────────────────────
let events = [];
let settings = { theme: 'dark', alarmSound: 'chime', alarmVolume: 50, notifications: false, snoozeDuration: 5 };
let tickInterval = null;
let pendingDeleteId = null;
let editingId = null;
let currentView = 'list';
let searchQuery = '';
let sortBy = 'soonest';
let filterBy = 'all';
let calDate = new Date();
let calSelectedDay = null;
let prevSecs = {};
let dragSrcId = null;
let alarmAudioCtx = null;
let alarmInterval = null;
let alarmActive = false;
let alarmEventId = null;
let confettiParticles = [];
let confettiAnimId = null;

// ── Persistence ────────────────────────────────────
function loadEvents() {
  try { events = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { events = []; }
  // migrate old events
  events = events.map(ev => ({
    category: '🎯 General', notes: '', recurrence: 'none', timezone: '', order: 0, ...ev
  }));
}
function saveEvents() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch (e) { console.warn('save failed', e); }
}
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s) settings = { ...settings, ...s };
  } catch { }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { }
}

// ── Event Factory ──────────────────────────────────
function makeEvent(label, datetimeISO, color, category, notes, recurrence, timezone) {
  return {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label, datetime: datetimeISO, color,
    category: category || '🎯 General',
    notes: notes || '',
    recurrence: recurrence || 'none',
    timezone: timezone || localTZ(),
    createdAt: new Date().toISOString(),
    order: events.length,
  };
}

// ── Time Helpers ───────────────────────────────────
function getCountdown(targetISO) {
  const diff = new Date(targetISO).getTime() - Date.now();
  if (diff <= 0) {
    const absDiff = Math.abs(diff);
    const totalSec = Math.floor(absDiff / 1000);
    return {
      expired: true,
      days: Math.floor(totalSec / 86400),
      hours: Math.floor((totalSec % 86400) / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
    };
  }
  const total = Math.floor(diff / 1000);
  return {
    expired: false,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function formatDate(isoString, tz) {
  const opts = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  if (tz) opts.timeZone = tz;
  try { return new Date(isoString).toLocaleString(undefined, opts); } catch { return new Date(isoString).toLocaleString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
}

function pad(n, len = 2) { return String(n).padStart(len, '0'); }
function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function localTZ() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } }

function relativeTime(isoString) {
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return null;
  const mins = diff / 60000;
  if (mins < 60) return `In ${Math.ceil(mins)} minute${Math.ceil(mins) === 1 ? '' : 's'}`;
  const hrs = mins / 60;
  if (hrs < 24) return `In ${Math.round(hrs)} hour${Math.round(hrs) === 1 ? '' : 's'}`;
  const days = hrs / 24;
  if (days < 1.5) return 'Tomorrow';
  if (days < 7) return `In ${Math.round(days)} days`;
  if (days < 14) return 'Next week';
  if (days < 30) return `In ${Math.round(days / 7)} weeks`;
  if (days < 60) return 'Next month';
  return `In ${Math.round(days / 30)} months`;
}

function countUpText(cd) {
  const parts = [];
  if (cd.days > 0) parts.push(`${cd.days}d`);
  if (cd.hours > 0) parts.push(`${cd.hours}h`);
  parts.push(`${cd.minutes}m`);
  parts.push(`${cd.seconds}s`);
  return parts.join(' ') + ' ago';
}

function nextRecurrence(ev) {
  const d = new Date(ev.datetime);
  const now = new Date();
  switch (ev.recurrence) {
    case 'daily': while (d <= now) d.setDate(d.getDate() + 1); break;
    case 'weekly': while (d <= now) d.setDate(d.getDate() + 7); break;
    case 'monthly': while (d <= now) d.setMonth(d.getMonth() + 1); break;
    case 'yearly': while (d <= now) d.setFullYear(d.getFullYear() + 1); break;
    default: return null;
  }
  return d.toISOString();
}

// ── Sound Engine ───────────────────────────────────
function getAudioCtx() {
  if (!alarmAudioCtx) alarmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return alarmAudioCtx;
}

function playSound(type) {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const vol = (settings.alarmVolume || 50) / 100 * 0.4;
  const sounds = {
    chime: [[523.25, 0], [659.25, 0.18], [783.99, 0.36]],
    bell: [[440, 0], [554.37, 0.15], [659.25, 0.30], [880, 0.45]],
    beep: [[800, 0], [800, 0.2], [800, 0.4]],
    melody: [[523.25, 0], [587.33, 0.15], [659.25, 0.3], [783.99, 0.45], [880, 0.6]],
  };
  const notes = sounds[type] || sounds.chime;
  notes.forEach(([freq, offset]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type === 'beep' ? 'square' : 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + offset);
    gain.gain.linearRampToValueAtTime(vol, now + offset + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.4);
  });
}

function startAlarm(eventLabel, eventId) {
  if (alarmActive) return;
  alarmActive = true;
  alarmEventId = eventId;
  const overlay = document.getElementById('alarm-overlay');
  const desc = document.getElementById('alarm-desc');
  desc.innerHTML = `<strong>"${escHtml(eventLabel)}"</strong> has reached zero!`;
  overlay.hidden = false;
  playSound(settings.alarmSound);
  alarmInterval = setInterval(() => playSound(settings.alarmSound), 2000);
  // Desktop notification
  if (settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('⏳ Time\'s Up!', { body: `"${eventLabel}" has reached zero!`, icon: '⏳' });
  }
}

function stopAlarm() {
  alarmActive = false;
  alarmEventId = null;
  if (alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; }
  if (alarmAudioCtx) { alarmAudioCtx.close().catch(() => { }); alarmAudioCtx = null; }
  document.getElementById('alarm-overlay').hidden = true;
}

function snoozeAlarm(minutes) {
  const evId = alarmEventId;
  stopAlarm();
  if (!evId) return;
  const ev = events.find(e => e.id === evId);
  if (!ev) return;
  ev.datetime = new Date(Date.now() + minutes * 60000).toISOString();
  saveEvents();
  render();
  showToast(`⏰ Snoozed for ${minutes} minutes`);
}

// ── Theme ──────────────────────────────────────────
function applyTheme(theme) {
  settings.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-icon').textContent = theme === 'dark' ? '🌙' : '☀️';
  // Update datetime input color-scheme for all dt inputs
  document.querySelectorAll('.form__input--dt').forEach(el => el.style.colorScheme = theme);
  saveSettings();
}

function toggleTheme() {
  applyTheme(settings.theme === 'dark' ? 'light' : 'dark');
}

// ── Toast ──────────────────────────────────────────
let toastEl = null;
let toastTimer = null;
function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2500);
}

// ── Confetti ───────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  confettiParticles = [];
  const colors = ['#7b61ff', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#fb923c', '#a78bfa', '#f472b6'];
  for (let i = 0; i < 150; i++) {
    confettiParticles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * -1,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * 360,
      rv: (Math.random() - 0.5) * 10,
      life: 1,
    });
  }
  if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    confettiParticles.forEach(p => {
      if (p.life <= 0) return;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.rot += p.rv;
      if (p.y > canvas.height) p.life -= 0.02;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (alive) confettiAnimId = requestAnimationFrame(animate);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); confettiAnimId = null; }
  }
  animate();
}

// ── DOM Refs ───────────────────────────────────────
const formEl = document.getElementById('event-form');
const inputLabel = document.getElementById('input-label');
const inputDt = document.getElementById('input-datetime');
const inputCategory = document.getElementById('input-category');
const inputColor = document.getElementById('input-color');
const inputRecurrence = document.getElementById('input-recurrence');
const inputTimezone = document.getElementById('input-timezone');
const inputNotes = document.getElementById('input-notes');
const errLabel = document.getElementById('err-label');
const errDt = document.getElementById('err-datetime');
const cardsList = document.getElementById('cards-list');
const eventCount = document.getElementById('event-count');
const emptyState = document.getElementById('empty-state');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmDesc = document.getElementById('confirm-desc');
const confirmInput = document.getElementById('confirm-input');
const confirmCheck = document.getElementById('confirm-check');
const confirmLabel = document.getElementById('confirm-label');
const btnConfirmDel = document.getElementById('btn-confirm-del');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const filterSelect = document.getElementById('filter-select');

// ── Timezone Selector ──────────────────────────────
function populateTimezones(selectEl) {
  const local = localTZ();
  let tzs = [];
  try { tzs = Intl.supportedValuesOf('timeZone'); } catch {
    tzs = ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];
  }
  selectEl.innerHTML = '';
  tzs.forEach(tz => {
    const opt = document.createElement('option');
    opt.value = tz;
    opt.textContent = tz.replace(/_/g, ' ');
    if (tz === local) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

// ── Filter & Sort ──────────────────────────────────
function getFilteredSortedEvents() {
  let list = [...events];

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(ev => ev.label.toLowerCase().includes(q) || (ev.notes || '').toLowerCase().includes(q) || (ev.category || '').toLowerCase().includes(q));
  }

  // Filter
  if (filterBy === 'active') list = list.filter(ev => !getCountdown(ev.datetime).expired);
  else if (filterBy === 'expired') list = list.filter(ev => getCountdown(ev.datetime).expired);
  else if (filterBy.startsWith('cat-')) {
    const cat = filterBy.slice(4);
    list = list.filter(ev => ev.category === cat);
  }

  // Sort
  switch (sortBy) {
    case 'soonest': list.sort((a, b) => new Date(a.datetime) - new Date(b.datetime)); break;
    case 'latest': list.sort((a, b) => new Date(b.datetime) - new Date(a.datetime)); break;
    case 'alpha': list.sort((a, b) => a.label.localeCompare(b.label)); break;
    case 'added': list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
  }

  return list;
}

// ── Render (List View) ─────────────────────────────
function render() {
  const filtered = getFilteredSortedEvents();
  cardsList.innerHTML = '';
  eventCount.textContent = filtered.length;

  if (events.length === 0) { emptyState.hidden = false; return; }
  emptyState.hidden = true;
  if (filtered.length === 0) {
    emptyState.hidden = false;
    emptyState.querySelector('.empty-state__text').textContent = 'No events match your search or filter.';
    return;
  } else {
    emptyState.querySelector('.empty-state__text').textContent = 'No countdowns yet. Add your first event above!';
  }

  filtered.forEach((ev, i) => {
    const cd = getCountdown(ev.datetime);
    const li = buildCard(ev, cd);
    li.style.animationDelay = `${i * 50}ms`;
    cardsList.appendChild(li);
  });
  updateTitleBadge();
}

function buildCard(ev, cd) {
  const li = document.createElement('li');
  li.className = 'card' + (cd.expired ? ' is-expired' : '');
  li.dataset.id = ev.id;
  li.style.setProperty('--card-color', ev.color);
  li.draggable = true;

  const rel = relativeTime(ev.datetime);
  const recLabel = ev.recurrence !== 'none' ? `🔁 ${ev.recurrence.charAt(0).toUpperCase() + ev.recurrence.slice(1)}` : '';
  const tzLabel = ev.timezone ? ` (${ev.timezone.replace(/_/g, ' ')})` : '';

  li.innerHTML = `
    <div class="card__body">
      <div class="card__header">
        <span class="card__category">${escHtml(ev.category)}</span>
        <div class="card__label">${escHtml(ev.label)}</div>
        ${recLabel ? `<span class="card__recurrence">${recLabel}</span>` : ''}
      </div>

      <div class="card__progress-wrap" aria-hidden="true">
        <div class="card__progress-bar" id="progress-${ev.id}" style="width: 0%"></div>
      </div>

      <div class="card__countdown" id="countdown-${ev.id}" role="timer" aria-live="off">
        <div class="unit" id="unit-days-${ev.id}">
          <span class="unit__value" id="val-days-${ev.id}">${cd.days}</span>
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

      ${rel ? `<div class="card__relative">${rel}</div>` : ''}
      <span class="card__expired-badge">🎉 This event has passed!</span>
      <div class="card__countup" id="countup-${ev.id}">${cd.expired ? countUpText(cd) : ''}</div>

      <div class="card__date">${formatDate(ev.datetime, ev.timezone)}${tzLabel}</div>

      ${ev.notes ? `<button class="card__notes-toggle" data-notes-id="${ev.id}">📝 Show notes</button>
      <div class="card__notes" id="notes-${ev.id}" hidden>${escHtml(ev.notes)}</div>` : ''}
    </div>

    <div class="card__actions">
      <button class="btn--action" data-action="edit" data-id="${ev.id}" title="Edit">✏️</button>
      <button class="btn--action" data-action="duplicate" data-id="${ev.id}" title="Duplicate">📋</button>
      <button class="btn--action" data-action="share" data-id="${ev.id}" title="Share">📤</button>
      <button class="btn--action" data-action="delete" data-id="${ev.id}" title="Delete">🗑️</button>
    </div>
  `;

  // Action button listeners
  li.querySelectorAll('.btn--action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'delete') openConfirm(id);
      else if (action === 'edit') openEdit(id);
      else if (action === 'duplicate') duplicateEvent(id);
      else if (action === 'share') shareEvent(id);
    });
  });

  // Notes toggle
  const notesToggle = li.querySelector('.card__notes-toggle');
  if (notesToggle) {
    notesToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const notesEl = li.querySelector('.card__notes');
      const isHidden = notesEl.hidden;
      notesEl.hidden = !isHidden;
      notesToggle.textContent = isHidden ? '📝 Hide notes' : '📝 Show notes';
    });
  }

  // Drag events
  li.addEventListener('dragstart', (e) => {
    dragSrcId = ev.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    dragSrcId = null;
    document.querySelectorAll('.card.drag-over').forEach(c => c.classList.remove('drag-over'));
  });
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    li.classList.add('drag-over');
  });
  li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.classList.remove('drag-over');
    if (!dragSrcId || dragSrcId === ev.id) return;
    const srcIdx = events.findIndex(x => x.id === dragSrcId);
    const destIdx = events.findIndex(x => x.id === ev.id);
    if (srcIdx < 0 || destIdx < 0) return;
    const [moved] = events.splice(srcIdx, 1);
    events.splice(destIdx, 0, moved);
    saveEvents();
    render();
    showToast('📦 Event reordered');
  });

  return li;
}

// ── Live Tick ──────────────────────────────────────
function tickAll() {
  events.forEach(ev => {
    const cd = getCountdown(ev.datetime);
    const card = cardsList.querySelector(`[data-id="${ev.id}"]`);
    if (!card) return;

    const wasExpired = card.classList.contains('is-expired');
    if (cd.expired && !wasExpired) {
      // Just expired!
      launchConfetti();
      startAlarm(ev.label, ev.id);
      // Handle recurrence
      if (ev.recurrence !== 'none') {
        const next = nextRecurrence(ev);
        if (next) {
          ev.datetime = next;
          saveEvents();
          showToast(`🔁 "${ev.label}" rescheduled (${ev.recurrence})`);
        }
      }
      render();
      return;
    }

    if (cd.expired) {
      // Update count-up
      const cupEl = document.getElementById(`countup-${ev.id}`);
      if (cupEl) cupEl.textContent = countUpText(cd);
      return;
    }

    // Update countdown values
    const vDays = document.getElementById(`val-days-${ev.id}`);
    const vHours = document.getElementById(`val-hours-${ev.id}`);
    const vMins = document.getElementById(`val-mins-${ev.id}`);
    const vSecs = document.getElementById(`val-secs-${ev.id}`);
    const vProgress = document.getElementById(`progress-${ev.id}`);

    if (vProgress) {
      const start = new Date(ev.createdAt).getTime();
      const end = new Date(ev.datetime).getTime();
      const now = Date.now();
      const total = end - start;
      const elapsed = now - start;
      const percent = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 100;
      vProgress.style.width = `${percent}%`;
    }

    if (!vSecs) return;
    const prev = prevSecs[ev.id];
    if (prev !== cd.seconds) {
      triggerTick(vSecs);
      prevSecs[ev.id] = cd.seconds;
    }
    vDays.textContent = cd.days;
    vHours.textContent = pad(cd.hours);
    vMins.textContent = pad(cd.minutes);
    vSecs.textContent = pad(cd.seconds);
  });

  updateTitleBadge();
}

function triggerTick(el) {
  el.classList.remove('tick');
  void el.offsetWidth;
  el.classList.add('tick');
}

// ── Title Badge ────────────────────────────────────
function updateTitleBadge() {
  const active = events.filter(ev => !getCountdown(ev.datetime).expired);
  if (active.length === 0) { document.title = '⏳ Tick...Tock'; return; }
  active.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const cd = getCountdown(active[0].datetime);
  const parts = [];
  if (cd.days > 0) parts.push(`${cd.days}d`);
  if (cd.hours > 0) parts.push(`${cd.hours}h`);
  parts.push(`${cd.minutes}m`);
  document.title = `⏳ ${parts.join(' ')} — Tick...Tock`;
}

// ── Form Submit ────────────────────────────────────
function handleSubmit(e) {
  e.preventDefault();
  const label = inputLabel.value.trim();
  const dtVal = inputDt.value;
  let valid = true;

  if (!label) {
    errLabel.textContent = 'Please enter an event name.';
    inputLabel.classList.add('is-invalid');
    valid = false;
  } else { errLabel.textContent = ''; inputLabel.classList.remove('is-invalid'); }

  if (!dtVal) {
    errDt.textContent = 'Please pick a date and time.';
    inputDt.classList.add('is-invalid');
    valid = false;
  } else { errDt.textContent = ''; inputDt.classList.remove('is-invalid'); }

  if (!valid) return;

  const isoDatetime = new Date(dtVal).toISOString();
  const ev = makeEvent(label, isoDatetime, inputColor.value, inputCategory.value, inputNotes.value.trim(), inputRecurrence.value, inputTimezone.value);
  events.unshift(ev);
  saveEvents();
  render();

  inputLabel.value = '';
  inputDt.value = '';
  inputNotes.value = '';
  inputColor.value = '#7b61ff';
  inputCategory.value = '🎯 General';
  inputRecurrence.value = 'none';
  inputLabel.focus();
  showToast('✅ Event added!');
}

// ── Edit ───────────────────────────────────────────
function openEdit(id) {
  editingId = id;
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  document.getElementById('edit-label').value = ev.label;
  // Convert ISO to local datetime-local format
  const d = new Date(ev.datetime);
  const localDt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  document.getElementById('edit-datetime').value = localDt;
  document.getElementById('edit-category').value = ev.category || '🎯 General';
  document.getElementById('edit-color').value = ev.color;
  document.getElementById('edit-recurrence').value = ev.recurrence || 'none';
  const editTz = document.getElementById('edit-timezone');
  if (ev.timezone) editTz.value = ev.timezone;
  document.getElementById('edit-notes').value = ev.notes || '';
  document.getElementById('edit-overlay').hidden = false;
  setTimeout(() => document.getElementById('edit-label').focus(), 250);
}

function handleEditSubmit(e) {
  e.preventDefault();
  const ev = events.find(e => e.id === editingId);
  if (!ev) return;
  const label = document.getElementById('edit-label').value.trim();
  const dtVal = document.getElementById('edit-datetime').value;
  if (!label || !dtVal) return;
  ev.label = label;
  ev.datetime = new Date(dtVal).toISOString();
  ev.category = document.getElementById('edit-category').value;
  ev.color = document.getElementById('edit-color').value;
  ev.recurrence = document.getElementById('edit-recurrence').value;
  ev.timezone = document.getElementById('edit-timezone').value;
  ev.notes = document.getElementById('edit-notes').value.trim();
  saveEvents();
  closeEdit();
  render();
  showToast('✅ Event updated!');
}

function closeEdit() {
  document.getElementById('edit-overlay').hidden = true;
  editingId = null;
}

// ── Duplicate ──────────────────────────────────────
function duplicateEvent(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  const dup = makeEvent(ev.label + ' (copy)', ev.datetime, ev.color, ev.category, ev.notes, ev.recurrence, ev.timezone);
  events.unshift(dup);
  saveEvents();
  render();
  showToast('📋 Event duplicated!');
}

// ── Share (copy to clipboard) ──────────────────────
function shareEvent(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  const cd = getCountdown(ev.datetime);
  const text = `⏳ ${ev.label}\n📅 ${formatDate(ev.datetime, ev.timezone)}\n⏱️ ${cd.expired ? 'Event has passed' : `${cd.days}d ${cd.hours}h ${cd.minutes}m remaining`}${ev.notes ? '\n📝 ' + ev.notes : ''}`;
  navigator.clipboard.writeText(text).then(() => showToast('📤 Copied to clipboard!')).catch(() => showToast('❌ Copy failed'));
}

// ── Delete ─────────────────────────────────────────
function openConfirm(id) {
  pendingDeleteId = id;
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  confirmDesc.innerHTML = `You are about to delete <strong>"${escHtml(ev.label)}"</strong>. This action is permanent.`;
  confirmLabel.innerHTML = `To confirm, please type: <strong>${escHtml(ev.label)}</strong>`;
  confirmInput.value = '';
  confirmCheck.checked = false;
  btnConfirmDel.disabled = true;
  confirmOverlay.hidden = false;
  setTimeout(() => confirmInput.focus(), 250);
}
function handleConfirmInput() {
  const ev = events.find(e => e.id === pendingDeleteId);
  if (!ev) return;
  btnConfirmDel.disabled = !(confirmInput.value.trim() === ev.label && confirmCheck.checked);
}
function closeConfirm() {
  confirmOverlay.hidden = true;
  pendingDeleteId = null;
  confirmCheck.checked = false;
  btnConfirmDel.disabled = true;
}
function doDelete() {
  if (!pendingDeleteId) return;
  delete prevSecs[pendingDeleteId];
  events = events.filter(e => e.id !== pendingDeleteId);
  saveEvents();
  closeConfirm();
  render();
  showToast('🗑️ Event deleted');
}

// ── Import / Export ────────────────────────────────
function exportEvents() {
  const data = JSON.stringify(events, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ticktock-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📤 Events exported!');
}

function importEvents(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) { showToast('❌ Invalid file format'); return; }
      const count = imported.length;
      imported.forEach(ev => {
        if (!ev.id || !ev.label || !ev.datetime) return;
        // Avoid duplicates
        if (!events.find(x => x.id === ev.id)) {
          events.push({ category: '🎯 General', notes: '', recurrence: 'none', timezone: '', order: 0, ...ev });
        }
      });
      saveEvents();
      render();
      showToast(`📥 Imported ${count} events!`);
    } catch { showToast('❌ Failed to parse file'); }
  };
  reader.readAsText(file);
}

// ── Calendar View ──────────────────────────────────
function renderCalendar() {
  const grid = document.getElementById('cal-grid');
  const title = document.getElementById('cal-title');
  const eventsArea = document.getElementById('cal-events');
  grid.innerHTML = '';
  eventsArea.innerHTML = '';

  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  title.textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Previous month padding
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    const cell = createCalDay(prevMonthDays - i, true);
    grid.appendChild(cell);
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const dayEvents = events.filter(ev => {
      const evDate = new Date(ev.datetime);
      return evDate.getFullYear() === year && evDate.getMonth() === month && evDate.getDate() === d;
    });
    const cell = createCalDay(d, false, isToday, dayEvents.length > 0, dateStr);
    if (calSelectedDay === dateStr) cell.classList.add('is-selected');
    cell.addEventListener('click', () => {
      calSelectedDay = dateStr;
      renderCalendar();
      showCalDayEvents(dayEvents);
    });
    grid.appendChild(cell);
  }

  // Next month padding
  const totalCells = grid.children.length;
  const remaining = (7 - totalCells % 7) % 7;
  for (let i = 1; i <= remaining; i++) {
    grid.appendChild(createCalDay(i, true));
  }

  // Show selected day events
  if (calSelectedDay) {
    const [sy, sm, sd] = calSelectedDay.split('-').map(Number);
    const dayEvs = events.filter(ev => {
      const evDate = new Date(ev.datetime);
      return evDate.getFullYear() === sy && evDate.getMonth() === sm - 1 && evDate.getDate() === sd;
    });
    showCalDayEvents(dayEvs);
  }
}

function createCalDay(num, isOther, isToday = false, hasEvents = false, dateStr = '') {
  const div = document.createElement('div');
  div.className = 'cal-day';
  if (isOther) div.classList.add('is-other');
  if (isToday) div.classList.add('is-today');
  if (hasEvents) div.classList.add('has-events');
  if (dateStr) div.dataset.date = dateStr;
  div.innerHTML = `<span>${num}</span>`;
  return div;
}

function showCalDayEvents(dayEvents) {
  const area = document.getElementById('cal-events');
  area.innerHTML = '';
  if (dayEvents.length === 0) {
    area.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:16px;font-size:13px;">No events on this day</p>';
    return;
  }
  dayEvents.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'cal-event-item';
    item.innerHTML = `
      <div class="cal-event-dot" style="background:${ev.color}"></div>
      <div class="cal-event-info">
        <div class="cal-event-name">${escHtml(ev.label)}</div>
        <div class="cal-event-date">${formatDate(ev.datetime, ev.timezone)}</div>
      </div>
    `;
    area.appendChild(item);
  });
}

// ── Statistics View ────────────────────────────────
function renderStats() {
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = '';

  const total = events.length;
  const active = events.filter(ev => !getCountdown(ev.datetime).expired).length;
  const expired = total - active;
  const categories = {};
  events.forEach(ev => { categories[ev.category] = (categories[ev.category] || 0) + 1; });
  const topCat = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];

  // Soonest event
  const activeEvents = events.filter(ev => !getCountdown(ev.datetime).expired).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const soonest = activeEvents[0];
  const soonestLabel = soonest ? soonest.label : 'None';
  const soonestTime = soonest ? relativeTime(soonest.datetime) || 'Very soon' : '—';

  // Average duration
  let avgDays = 0;
  if (events.length > 0) {
    const totalDays = events.reduce((sum, ev) => {
      const dur = (new Date(ev.datetime) - new Date(ev.createdAt)) / 86400000;
      return sum + Math.abs(dur);
    }, 0);
    avgDays = Math.round(totalDays / events.length);
  }

  // Recurring count
  const recurring = events.filter(ev => ev.recurrence !== 'none').length;

  const stats = [
    { icon: '📊', value: total, label: 'Total Events', color: '#8b5cf6' },
    { icon: '⏳', value: active, label: 'Active', color: '#38bdf8' },
    { icon: '✅', value: expired, label: 'Completed', color: '#34d399' },
    { icon: '🔁', value: recurring, label: 'Recurring', color: '#fbbf24' },
    { icon: '📅', value: `${avgDays}d`, label: 'Avg Duration', color: '#fb923c' },
    { icon: '🏷️', value: topCat ? topCat[1] : 0, label: topCat ? `Top: ${topCat[0]}` : 'No Category', color: '#fb7185', detail: topCat ? `${topCat[0]}` : '' },
    { icon: '🎯', value: soonestLabel.length > 12 ? soonestLabel.slice(0, 12) + '…' : soonestLabel, label: 'Next Up', color: '#a78bfa', detail: soonestTime },
    { icon: '📂', value: Object.keys(categories).length, label: 'Categories Used', color: '#7b61ff' },
  ];

  stats.forEach(s => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.style.setProperty('--stat-color', s.color);
    card.innerHTML = `
      <div class="stat-card__icon">${s.icon}</div>
      <div class="stat-card__value">${s.value}</div>
      <div class="stat-card__label">${s.label}</div>
      ${s.detail ? `<div class="stat-card__detail">${s.detail}</div>` : ''}
    `;
    grid.appendChild(card);
  });
}

// ── View Switching ─────────────────────────────────
function switchView(view) {
  currentView = view;
  document.getElementById('view-list').hidden = view !== 'list';
  document.getElementById('view-calendar').hidden = view !== 'calendar';
  document.getElementById('view-stats').hidden = view !== 'stats';
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
  if (view === 'calendar') renderCalendar();
  if (view === 'stats') renderStats();
}

// ── Settings Dialog ────────────────────────────────
function openSettings() {
  document.getElementById('setting-sound').value = settings.alarmSound;
  document.getElementById('setting-volume').value = settings.alarmVolume;
  document.getElementById('setting-notifications').checked = settings.notifications;
  document.getElementById('setting-snooze').value = settings.snoozeDuration;
  document.getElementById('settings-overlay').hidden = false;
}
function closeSettings() {
  settings.alarmSound = document.getElementById('setting-sound').value;
  settings.alarmVolume = parseInt(document.getElementById('setting-volume').value);
  settings.notifications = document.getElementById('setting-notifications').checked;
  settings.snoozeDuration = parseInt(document.getElementById('setting-snooze').value);
  saveSettings();
  document.getElementById('settings-overlay').hidden = true;
}

// ── Notifications ──────────────────────────────────
function requestNotifications() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ── Keyboard Shortcuts ─────────────────────────────
function handleKeyShortcuts(e) {
  const anyOverlay = !confirmOverlay.hidden || !document.getElementById('edit-overlay').hidden ||
    !document.getElementById('settings-overlay').hidden || !document.getElementById('shortcuts-overlay').hidden;

  if (e.key === 'Escape') {
    if (alarmActive) { stopAlarm(); e.preventDefault(); return; }
    if (!confirmOverlay.hidden) { closeConfirm(); e.preventDefault(); return; }
    if (!document.getElementById('edit-overlay').hidden) { closeEdit(); e.preventDefault(); return; }
    if (!document.getElementById('settings-overlay').hidden) { closeSettings(); e.preventDefault(); return; }
    if (!document.getElementById('shortcuts-overlay').hidden) { document.getElementById('shortcuts-overlay').hidden = true; e.preventDefault(); return; }
    return;
  }

  // Don't trigger shortcuts when typing in inputs, unless it's Escape
  if (e.target.matches('input, textarea, select')) return;

  if (e.ctrlKey && e.shiftKey && e.key === 'T') { e.preventDefault(); toggleTheme(); return; }
  if (e.ctrlKey && e.key === 'n') { e.preventDefault(); inputLabel.focus(); return; }
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); searchInput.focus(); return; }
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); openSettings(); return; }
  if (e.ctrlKey && e.key === 'e') { e.preventDefault(); exportEvents(); return; }
  if (e.ctrlKey && e.key === 'i') { e.preventDefault(); document.getElementById('import-file').click(); return; }
  if (e.ctrlKey && e.key === '/') { e.preventDefault(); document.getElementById('shortcuts-overlay').hidden = false; return; }

  if (!anyOverlay && !e.ctrlKey && !e.altKey) {
    if (e.key === '1') { switchView('list'); return; }
    if (e.key === '2') { switchView('calendar'); return; }
    if (e.key === '3') { switchView('stats'); return; }
  }
}

// ── Event Listeners ────────────────────────────────
formEl.addEventListener('submit', handleSubmit);

inputLabel.addEventListener('input', () => { errLabel.textContent = ''; inputLabel.classList.remove('is-invalid'); });
inputDt.addEventListener('input', () => { errDt.textContent = ''; inputDt.classList.remove('is-invalid'); });

// Advanced toggle
document.getElementById('toggle-advanced').addEventListener('click', () => {
  const adv = document.getElementById('form-advanced');
  const btn = document.getElementById('toggle-advanced');
  const isOpen = !adv.hidden;
  adv.hidden = isOpen;
  btn.classList.toggle('is-open', !isOpen);
});

// Delete confirm
document.getElementById('btn-cancel-del').addEventListener('click', closeConfirm);
btnConfirmDel.addEventListener('click', doDelete);
confirmInput.addEventListener('input', handleConfirmInput);
confirmCheck.addEventListener('change', handleConfirmInput);
confirmOverlay.addEventListener('click', (e) => { if (e.target === confirmOverlay) closeConfirm(); });

// Edit
document.getElementById('edit-form').addEventListener('submit', handleEditSubmit);
document.getElementById('btn-cancel-edit').addEventListener('click', closeEdit);
document.getElementById('edit-overlay').addEventListener('click', (e) => { if (e.target.id === 'edit-overlay') closeEdit(); });

// Alarm
document.getElementById('btn-dismiss-alarm').addEventListener('click', stopAlarm);
document.querySelectorAll('[data-snooze]').forEach(btn => {
  btn.addEventListener('click', () => snoozeAlarm(parseInt(btn.dataset.snooze)));
});

// Theme
document.getElementById('btn-theme').addEventListener('click', toggleTheme);

// Settings
document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
document.getElementById('settings-overlay').addEventListener('click', (e) => { if (e.target.id === 'settings-overlay') closeSettings(); });
document.getElementById('btn-test-sound').addEventListener('click', () => {
  playSound(document.getElementById('setting-sound').value);
});
document.getElementById('setting-notifications').addEventListener('change', (e) => {
  if (e.target.checked) requestNotifications();
});

// Shortcuts help
document.getElementById('btn-shortcuts-help').addEventListener('click', () => { document.getElementById('shortcuts-overlay').hidden = false; });
document.getElementById('btn-close-shortcuts').addEventListener('click', () => { document.getElementById('shortcuts-overlay').hidden = true; });
document.getElementById('shortcuts-overlay').addEventListener('click', (e) => { if (e.target.id === 'shortcuts-overlay') document.getElementById('shortcuts-overlay').hidden = true; });

// Search, sort, filter
searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; render(); });
sortSelect.addEventListener('change', (e) => { sortBy = e.target.value; render(); });
filterSelect.addEventListener('change', (e) => { filterBy = e.target.value; render(); });

// View switching
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// Import / Export (via keyboard shortcuts only — buttons removed)
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
if (btnExport) btnExport.addEventListener('click', exportEvents);
if (btnImport) btnImport.addEventListener('click', () => document.getElementById('import-file').click());
document.getElementById('import-file').addEventListener('change', (e) => {
  if (e.target.files[0]) importEvents(e.target.files[0]);
  e.target.value = '';
});

// Calendar navigation
document.getElementById('cal-prev').addEventListener('click', () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
document.getElementById('cal-next').addEventListener('click', () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });
document.getElementById('cal-today').addEventListener('click', () => { calDate = new Date(); calSelectedDay = null; renderCalendar(); });

// Keyboard
document.addEventListener('keydown', handleKeyShortcuts);

// ── Boot ───────────────────────────────────────────
function boot() {
  loadSettings();
  loadEvents();

  // Apply theme
  applyTheme(settings.theme);

  // Populate timezones
  populateTimezones(inputTimezone);
  populateTimezones(document.getElementById('edit-timezone'));

  // Default datetime to 7 days from now
  const d = new Date(Date.now() + 7 * 86400000);
  inputDt.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  render();
  renderAlarmsList();
  timerUpdateDisplay();

  // Start tick
  tickInterval = setInterval(() => {
    tickAll();
    checkAlarms();
  }, 1000);
}

// ═══════════════════════════════════════════════════
// MAIN TAB NAVIGATION
// ═══════════════════════════════════════════════════
document.querySelectorAll('.main-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.main-tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === target));
    document.querySelectorAll('.tab-panel').forEach(p => p.hidden = p.id !== `tab-${target}`);
  });
});

// ═══════════════════════════════════════════════════
// ALARMS FEATURE
// ═══════════════════════════════════════════════════
const ALARMS_KEY = 'ticktock_alarms_v1';
let userAlarms = [];
let alarmFiredSet = new Set(); // track which alarms fired this minute to avoid re-firing

function loadAlarms() {
  try { userAlarms = JSON.parse(localStorage.getItem(ALARMS_KEY)) || []; } catch { userAlarms = []; }
}
function saveAlarms() {
  try { localStorage.setItem(ALARMS_KEY, JSON.stringify(userAlarms)); } catch { }
}

function addAlarm(time, label, repeat) {
  userAlarms.push({
    id: `alm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    time, // "HH:MM"
    label: label || 'Alarm',
    repeat, // once | daily | weekdays | weekends
    enabled: true,
  });
  saveAlarms();
  renderAlarmsList();
}

function deleteAlarm(id) {
  userAlarms = userAlarms.filter(a => a.id !== id);
  alarmFiredSet.delete(id);
  saveAlarms();
  renderAlarmsList();
}

function toggleAlarm(id) {
  const a = userAlarms.find(x => x.id === id);
  if (a) { a.enabled = !a.enabled; alarmFiredSet.delete(id); saveAlarms(); renderAlarmsList(); }
}

function renderAlarmsList() {
  const list = document.getElementById('alarms-list');
  const empty = document.getElementById('alarms-empty');
  list.innerHTML = '';
  if (userAlarms.length === 0) { empty.hidden = false; return; }
  empty.hidden = true;

  userAlarms.forEach(a => {
    const li = document.createElement('li');
    li.className = 'alarm-item';
    // Format time for 12h display
    const [hh, mm] = a.time.split(':');
    const h12 = ((+hh % 12) || 12);
    const ampm = +hh < 12 ? 'AM' : 'PM';
    const repeatLabel = { once: 'Once', daily: 'Daily', weekdays: 'Mon–Fri', weekends: 'Sat–Sun' }[a.repeat] || a.repeat;

    li.innerHTML = `
      <div class="alarm-item__time">${h12}:${mm} <span style="font-size:14px;color:var(--text-3)">${ampm}</span></div>
      <div class="alarm-item__info">
        <div class="alarm-item__label">${escHtml(a.label)}</div>
        <div class="alarm-item__repeat">🔁 ${repeatLabel}</div>
      </div>
      <button class="alarm-item__toggle ${a.enabled ? 'is-on' : ''}" data-id="${a.id}" title="${a.enabled ? 'Disable' : 'Enable'}"></button>
      <button class="alarm-item__delete" data-id="${a.id}" title="Delete alarm">🗑️</button>
    `;

    li.querySelector('.alarm-item__toggle').addEventListener('click', () => toggleAlarm(a.id));
    li.querySelector('.alarm-item__delete').addEventListener('click', () => deleteAlarm(a.id));
    list.appendChild(li);
  });
}

function checkAlarms() {
  const now = new Date();
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const day = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  const isWeekday = day >= 1 && day <= 5;
  const isWeekend = day === 0 || day === 6;

  userAlarms.forEach(a => {
    if (!a.enabled) return;
    if (a.time !== currentTime) { alarmFiredSet.delete(a.id); return; }
    if (alarmFiredSet.has(a.id)) return; // Already fired this minute

    // Check repeat filter
    if (a.repeat === 'weekdays' && !isWeekday) return;
    if (a.repeat === 'weekends' && !isWeekend) return;

    // FIRE!
    alarmFiredSet.add(a.id);
    startAlarm(a.label, null);

    // If it's a one-time alarm, disable it
    if (a.repeat === 'once') {
      a.enabled = false;
      saveAlarms();
      renderAlarmsList();
    }
  });
}

// Alarm form
document.getElementById('alarm-set-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const time = document.getElementById('alarm-time-input').value;
  if (!time) return;
  const label = document.getElementById('alarm-label-input').value.trim();
  const repeat = document.getElementById('alarm-repeat-input').value;
  addAlarm(time, label, repeat);
  document.getElementById('alarm-label-input').value = '';
  showToast('⏰ Alarm set!');
});

// ═══════════════════════════════════════════════════
// STOPWATCH FEATURE
// ═══════════════════════════════════════════════════
let swRunning = false;
let swStartTime = 0;
let swElapsed = 0;
let swInterval = null;
let swLaps = [];
let swLapStart = 0;

const swTimeEl = document.getElementById('sw-time');
const swStartBtn = document.getElementById('sw-start');
const swLapBtn = document.getElementById('sw-lap');
const swResetBtn = document.getElementById('sw-reset');
const swLapsList = document.getElementById('sw-laps');
const swLapsWrap = document.getElementById('sw-laps-wrap');

function swFormatTime(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const centis = Math.floor((ms % 1000) / 10);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    return `${pad(hrs)}:${pad(m)}:${pad(secs)}<span class="sw-display__ms">.${pad(centis)}</span>`;
  }
  return `${pad(mins)}:${pad(secs)}<span class="sw-display__ms">.${pad(centis)}</span>`;
}

function swUpdate() {
  const now = performance.now();
  const total = swElapsed + (now - swStartTime);
  swTimeEl.innerHTML = swFormatTime(total);
}

function swStart() {
  if (swRunning) {
    // Pause
    swRunning = false;
    swElapsed += performance.now() - swStartTime;
    clearInterval(swInterval);
    swStartBtn.innerHTML = '▶ Resume';
    swStartBtn.classList.remove('btn--danger');
    swStartBtn.classList.add('btn--add');
    swLapBtn.disabled = true;
  } else {
    // Start
    swRunning = true;
    swStartTime = performance.now();
    if (swLaps.length === 0) swLapStart = performance.now() - swElapsed;
    swInterval = setInterval(swUpdate, 16);
    swStartBtn.innerHTML = '⏸ Pause';
    swStartBtn.classList.remove('btn--add');
    swStartBtn.classList.add('btn--danger');
    swLapBtn.disabled = false;
    swResetBtn.disabled = false;
  }
}

function swLap() {
  if (!swRunning) return;
  const now = performance.now();
  const totalMs = swElapsed + (now - swStartTime);
  const lapMs = now - swLapStart;
  swLapStart = now;
  swLaps.push({ total: totalMs, lap: lapMs });
  swRenderLaps();
}

function swReset() {
  swRunning = false;
  swElapsed = 0;
  clearInterval(swInterval);
  swTimeEl.innerHTML = '00:00<span class="sw-display__ms">.00</span>';
  swStartBtn.innerHTML = '▶ Start';
  swStartBtn.classList.remove('btn--danger');
  swStartBtn.classList.add('btn--add');
  swLapBtn.disabled = true;
  swResetBtn.disabled = true;
  swLaps = [];
  swLapStart = 0;
  swLapsList.innerHTML = '';
  swLapsWrap.hidden = true;
}

function swRenderLaps() {
  swLapsWrap.hidden = false;
  swLapsList.innerHTML = '';
  if (swLaps.length === 0) return;

  // Find best/worst laps
  const lapTimes = swLaps.map(l => l.lap);
  const best = Math.min(...lapTimes);
  const worst = Math.max(...lapTimes);

  // Render in reverse order (newest first)
  [...swLaps].reverse().forEach((l, revIdx) => {
    const idx = swLaps.length - 1 - revIdx;
    const li = document.createElement('li');
    li.className = 'sw-lap-item';
    if (swLaps.length > 2 && l.lap === best) li.classList.add('is-best');
    if (swLaps.length > 2 && l.lap === worst) li.classList.add('is-worst');

    const lapMins = Math.floor(l.lap / 60000);
    const lapSecs = Math.floor((l.lap % 60000) / 1000);
    const lapCentis = Math.floor((l.lap % 1000) / 10);

    li.innerHTML = `
      <span class="sw-lap-item__num">Lap ${idx + 1}</span>
      <span class="sw-lap-item__delta">${lapMins > 0 ? lapMins + ':' : ''}${pad(lapSecs)}.${pad(lapCentis)}</span>
      <span class="sw-lap-item__time">${swFormatTimeSimple(l.total)}</span>
    `;
    swLapsList.appendChild(li);
  });
}

function swFormatTimeSimple(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const centis = Math.floor((ms % 1000) / 10);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    return `${pad(hrs)}:${pad(mins % 60)}:${pad(secs)}.${pad(centis)}`;
  }
  return `${pad(mins)}:${pad(secs)}.${pad(centis)}`;
}

swStartBtn.addEventListener('click', swStart);
swLapBtn.addEventListener('click', swLap);
swResetBtn.addEventListener('click', swReset);

// ═══════════════════════════════════════════════════
// TIMER FEATURE
// ═══════════════════════════════════════════════════
let tmRunning = false;
let tmTotalSecs = 300; // 5 minutes default
let tmRemaining = 300;
let tmInterval = null;
let tmLastTick = 0;

const tmDisplay = document.getElementById('timer-display');
const tmRingProgress = document.getElementById('timer-ring-progress');
const tmStartBtn = document.getElementById('timer-start');
const tmPauseBtn = document.getElementById('timer-pause');
const tmResetBtn = document.getElementById('timer-reset');
const tmHInput = document.getElementById('timer-h');
const tmMInput = document.getElementById('timer-m');
const tmSInput = document.getElementById('timer-s');
const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // ~565.48

function timerUpdateDisplay() {
  const h = Math.floor(tmRemaining / 3600);
  const m = Math.floor((tmRemaining % 3600) / 60);
  const s = tmRemaining % 60;
  if (h > 0) {
    tmDisplay.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  } else {
    tmDisplay.textContent = `${pad(m)}:${pad(s)}`;
  }

  // Ring progress
  const progress = tmTotalSecs > 0 ? tmRemaining / tmTotalSecs : 0;
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  tmRingProgress.style.strokeDasharray = RING_CIRCUMFERENCE;
  tmRingProgress.style.strokeDashoffset = offset;

  // Color change when low
  if (tmRemaining <= 10 && tmRunning) {
    tmRingProgress.style.stroke = 'var(--danger)';
  } else {
    tmRingProgress.style.stroke = 'var(--accent)';
  }
}

function timerSetFromInputs() {
  const h = Math.max(0, Math.min(23, parseInt(tmHInput.value) || 0));
  const m = Math.max(0, Math.min(59, parseInt(tmMInput.value) || 0));
  const s = Math.max(0, Math.min(59, parseInt(tmSInput.value) || 0));
  tmTotalSecs = h * 3600 + m * 60 + s;
  tmRemaining = tmTotalSecs;
  timerUpdateDisplay();
}

function timerStart() {
  if (tmRunning) return;
  if (tmRemaining <= 0) timerSetFromInputs();
  if (tmRemaining <= 0) return;
  tmRunning = true;
  tmLastTick = Date.now();
  tmStartBtn.disabled = true;
  tmPauseBtn.disabled = false;
  tmResetBtn.disabled = false;
  tmDisplay.classList.remove('is-done');

  tmInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = Math.floor((now - tmLastTick) / 1000);
    if (elapsed >= 1) {
      tmRemaining = Math.max(0, tmRemaining - elapsed);
      tmLastTick = now;
      timerUpdateDisplay();

      if (tmRemaining <= 0) {
        timerDone();
      }
    }
  }, 100);
}

function timerPause() {
  if (!tmRunning) return;
  tmRunning = false;
  clearInterval(tmInterval);
  tmStartBtn.disabled = false;
  tmPauseBtn.disabled = true;
  tmStartBtn.innerHTML = '▶ Resume';
}

function timerReset() {
  tmRunning = false;
  clearInterval(tmInterval);
  tmDisplay.classList.remove('is-done');
  timerSetFromInputs();
  tmStartBtn.disabled = false;
  tmStartBtn.innerHTML = '▶ Start';
  tmPauseBtn.disabled = true;
  tmResetBtn.disabled = true;
}

function timerDone() {
  tmRunning = false;
  clearInterval(tmInterval);
  tmDisplay.classList.add('is-done');
  tmDisplay.textContent = '00:00';
  tmStartBtn.disabled = false;
  tmStartBtn.innerHTML = '▶ Start';
  tmPauseBtn.disabled = true;

  // Play alarm
  playSound(settings.alarmSound);
  const tmAlarmInt = setInterval(() => playSound(settings.alarmSound), 2000);
  // Auto-stop after 30 seconds
  setTimeout(() => clearInterval(tmAlarmInt), 30000);

  // Show notification
  if (settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('⏲️ Timer Complete!', { body: 'Your timer has finished.' });
  }

  showToast('⏲️ Timer complete!');
  launchConfetti();
}

// Preset buttons
document.querySelectorAll('.timer-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const secs = parseInt(btn.dataset.secs);
    tmTotalSecs = secs;
    tmRemaining = secs;
    // Update input fields
    tmHInput.value = Math.floor(secs / 3600);
    tmMInput.value = Math.floor((secs % 3600) / 60);
    tmSInput.value = secs % 60;
    timerUpdateDisplay();

    // Highlight active preset
    document.querySelectorAll('.timer-preset').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
  });
});

// Custom input change
[tmHInput, tmMInput, tmSInput].forEach(inp => {
  inp.addEventListener('change', () => {
    document.querySelectorAll('.timer-preset').forEach(b => b.classList.remove('is-active'));
    timerSetFromInputs();
  });
});

tmStartBtn.addEventListener('click', timerStart);
tmPauseBtn.addEventListener('click', timerPause);
tmResetBtn.addEventListener('click', timerReset);

// ═══════════════════════════════════════════════════
// BOOT (load alarms too)
// ═══════════════════════════════════════════════════
loadAlarms();

boot();
