const WAGE_KEY = 'albacalc.wage';
const ENTRIES_KEY = 'albacalc.entries';
const PAYMENTS_KEY = 'albacalc.payments';
const TAX_RATE = 0.033;

const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(), // 0-indexed
  showNet: false,
  selectedDate: null,
  entries: loadEntries(),
  payments: loadPayments(),
};

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(ENTRIES_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveEntries() {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(state.entries));
}

function loadPayments() {
  try {
    return JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function savePayments() {
  localStorage.setItem(PAYMENTS_KEY, JSON.stringify(state.payments));
}

function monthKey(y, m) {
  return `${y}-${pad2(m + 1)}`;
}

function getDefaultWage() {
  const v = parseInt(localStorage.getItem(WAGE_KEY), 10);
  return Number.isFinite(v) && v > 0 ? v : 13000;
}

function setDefaultWage(v) {
  localStorage.setItem(WAGE_KEY, String(v));
}

function pad2(n) { return String(n).padStart(2, '0'); }

function dateKey(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function minutesBetween(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff = 0;
  return Math.floor(diff / 10) * 10; // 10분 미만 버림
}

function calcGross(minutes, wage) {
  return Math.floor((minutes / 60) * wage);
}

function formatWon(n) {
  return n.toLocaleString('ko-KR') + '원';
}

function formatHM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

// ---------- Calendar rendering ----------
const monthLabel = document.getElementById('monthLabel');
const calendarEl = document.getElementById('calendar');

function renderCalendar() {
  monthLabel.textContent = `${state.year}년 ${state.month + 1}월`;
  calendarEl.innerHTML = '';

  const firstDay = new Date(state.year, state.month, 1);
  const startWeekday = firstDay.getDay(); // 0 = Sun
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const prevMonthDays = new Date(state.year, state.month, 0).getDate();

  const todayKey = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const cells = [];

  // leading days from previous month
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, outside: true });
  }
  // current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, outside: false });
  }
  // trailing days to fill full weeks
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length - (startWeekday + daysInMonth) + 1, outside: true, next: true });
  }

  cells.forEach((cell, idx) => {
    const weekday = idx % 7;
    const div = document.createElement('div');
    div.className = 'day-cell';
    if (cell.outside) div.classList.add('outside');
    if (weekday === 0) div.classList.add('sun');
    if (weekday === 6) div.classList.add('sat');

    let y = state.year, m = state.month;
    if (cell.outside && !cell.next) { m -= 1; if (m < 0) { m = 11; y -= 1; } }
    if (cell.outside && cell.next) { m += 1; if (m > 11) { m = 0; y += 1; } }

    const key = dateKey(y, m, cell.day);
    if (key === todayKey) div.classList.add('today');

    const entry = state.entries[key];
    if (entry) div.classList.add('has-entry');

    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = cell.day;
    div.appendChild(num);

    if (entry) {
      const amt = document.createElement('div');
      amt.className = 'day-amount';
      amt.textContent = formatWon(entry.gross);
      div.appendChild(amt);
    }

    div.addEventListener('click', () => openEntryModal(y, m, cell.day));
    calendarEl.appendChild(div);
  });

  renderSummary();
  renderPayment();
}

// ---------- Summary ----------
const summaryAmountEl = document.getElementById('summaryAmount');
const summaryLabelEl = document.getElementById('summaryLabel');
const payDateEl = document.getElementById('payDate');
const toggleNetBtn = document.getElementById('toggleNet');

function renderSummary() {
  const prefix = `${state.year}-${pad2(state.month + 1)}-`;
  let gross = 0;
  Object.keys(state.entries).forEach((key) => {
    if (key.startsWith(prefix)) gross += state.entries[key].gross;
  });

  const amount = state.showNet ? Math.floor(gross * (1 - TAX_RATE)) : gross;
  summaryAmountEl.textContent = formatWon(amount);
  summaryLabelEl.textContent = state.showNet ? '이번 달 급여 (3.3% 공제 후)' : '이번 달 급여 (공제 전)';
  toggleNetBtn.textContent = state.showNet ? '공제 전 금액 보기' : '3.3% 공제 후 보기';

  let payYear = state.year, payMonth = state.month + 1;
  if (payMonth > 11) { payMonth = 0; payYear += 1; } else { payMonth += 1; }
  payDateEl.textContent = `입금 예정일: ${payYear}년 ${payMonth}월 10일`;
}

toggleNetBtn.addEventListener('click', () => {
  state.showNet = !state.showNet;
  renderSummary();
});

// ---------- Actual payment record ----------
const paidDateInput = document.getElementById('paidDateInput');
const paidAmountInput = document.getElementById('paidAmountInput');
const paymentDiffEl = document.getElementById('paymentDiff');

function renderPayment() {
  const key = monthKey(state.year, state.month);
  const record = state.payments[key];
  paidDateInput.value = record ? record.date : '';
  paidAmountInput.value = record && record.amount != null ? record.amount : '';

  const prefix = `${state.year}-${pad2(state.month + 1)}-`;
  let gross = 0;
  Object.keys(state.entries).forEach((k) => {
    if (k.startsWith(prefix)) gross += state.entries[k].gross;
  });
  const expectedNet = Math.floor(gross * (1 - TAX_RATE));

  if (record && record.amount != null) {
    const diff = record.amount - expectedNet;
    if (diff === 0) {
      paymentDiffEl.textContent = `예상 순액과 일치 (${formatWon(expectedNet)})`;
    } else if (diff > 0) {
      paymentDiffEl.textContent = `예상보다 ${formatWon(diff)} 더 입금됨 (예상 ${formatWon(expectedNet)})`;
    } else {
      paymentDiffEl.textContent = `예상보다 ${formatWon(-diff)} 적게 입금됨 (예상 ${formatWon(expectedNet)})`;
    }
  } else {
    paymentDiffEl.textContent = `예상 순액: ${formatWon(expectedNet)}`;
  }
}

document.getElementById('savePaymentBtn').addEventListener('click', () => {
  const key = monthKey(state.year, state.month);
  const date = paidDateInput.value;
  const amount = parseInt(paidAmountInput.value, 10);
  state.payments[key] = { date, amount: Number.isFinite(amount) ? amount : null };
  savePayments();
  renderPayment();
});

// ---------- Month navigation ----------
document.getElementById('prevMonth').addEventListener('click', () => {
  state.month -= 1;
  if (state.month < 0) { state.month = 11; state.year -= 1; }
  renderCalendar();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  state.month += 1;
  if (state.month > 11) { state.month = 0; state.year += 1; }
  renderCalendar();
});

// ---------- Entry modal ----------
const entryModal = document.getElementById('entryModal');
const entryDateLabel = document.getElementById('entryDateLabel');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const entryPreview = document.getElementById('entryPreview');
const deleteEntryBtn = document.getElementById('deleteEntryBtn');

function openEntryModal(y, m, d) {
  const key = dateKey(y, m, d);
  state.selectedDate = key;
  const weekday = new Date(y, m, d).getDay();
  const existing = state.entries[key];

  entryDateLabel.textContent = `${y}년 ${m + 1}월 ${d}일`;

  if (existing) {
    startTimeInput.value = existing.start;
    endTimeInput.value = existing.end;
    deleteEntryBtn.classList.remove('hidden');
  } else if (weekday === 0) {
    startTimeInput.value = '09:50';
    endTimeInput.value = '17:00';
    deleteEntryBtn.classList.add('hidden');
  } else {
    startTimeInput.value = '';
    endTimeInput.value = '';
    deleteEntryBtn.classList.add('hidden');
  }

  updatePreview();
  entryModal.classList.remove('hidden');
}

function updatePreview() {
  const start = startTimeInput.value;
  const end = endTimeInput.value;
  if (!start || !end) {
    entryPreview.textContent = '시작/종료 시간을 입력하세요';
    return;
  }
  const minutes = minutesBetween(start, end);
  const wage = getDefaultWage();
  const gross = calcGross(minutes, wage);
  entryPreview.textContent = `${formatHM(minutes)} · 시급 ${formatWon(wage)} · ${formatWon(gross)}`;
}

startTimeInput.addEventListener('input', updatePreview);
endTimeInput.addEventListener('input', updatePreview);

document.getElementById('cancelEntryBtn').addEventListener('click', () => {
  entryModal.classList.add('hidden');
});

document.getElementById('saveEntryBtn').addEventListener('click', () => {
  const start = startTimeInput.value;
  const end = endTimeInput.value;
  if (!start || !end) return;

  const minutes = minutesBetween(start, end);
  const wage = getDefaultWage();
  const gross = calcGross(minutes, wage);

  state.entries[state.selectedDate] = { start, end, wage, minutes, gross };
  saveEntries();
  entryModal.classList.add('hidden');
  renderCalendar();
});

deleteEntryBtn.addEventListener('click', () => {
  delete state.entries[state.selectedDate];
  saveEntries();
  entryModal.classList.add('hidden');
  renderCalendar();
});

// ---------- Settings modal ----------
const settingsModal = document.getElementById('settingsModal');
const wageInput = document.getElementById('wageInput');

document.getElementById('settingsBtn').addEventListener('click', () => {
  wageInput.value = getDefaultWage();
  settingsModal.classList.remove('hidden');
});
document.getElementById('cancelSettingsBtn').addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  const v = parseInt(wageInput.value, 10);
  if (Number.isFinite(v) && v > 0) setDefaultWage(v);
  settingsModal.classList.add('hidden');
});

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

renderCalendar();
