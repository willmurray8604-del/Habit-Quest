const STORAGE_KEY = "habitQuest.v1";

const defaultState = {
  habits: [
    { id: crypto.randomUUID(), name: "Workout or intentional movement", points: 20, type: "good" },
    { id: crypto.randomUUID(), name: "Study focused for 45 minutes", points: 15, type: "good" },
    { id: crypto.randomUUID(), name: "Night routine completed", points: 10, type: "good" },
    { id: crypto.randomUUID(), name: "Doomscrolling over 30 minutes", points: 10, type: "bad" },
    { id: crypto.randomUUID(), name: "Skipped a planned responsibility", points: 15, type: "bad" }
  ],
  logs: {}
};

let state = loadState();

const els = {
  todayScore: document.querySelector("#todayScore"),
  todayLabel: document.querySelector("#todayLabel"),
  streakCount: document.querySelector("#streakCount"),
  goodList: document.querySelector("#goodList"),
  badList: document.querySelector("#badList"),
  weekChart: document.querySelector("#weekChart"),
  weekTotal: document.querySelector("#weekTotal"),
  habitDialog: document.querySelector("#habitDialog"),
  habitForm: document.querySelector("#habitForm"),
  habitType: document.querySelector("#habitType"),
  habitId: document.querySelector("#habitId"),
  habitName: document.querySelector("#habitName"),
  habitPoints: document.querySelector("#habitPoints"),
  dialogTitle: document.querySelector("#dialogTitle"),
  deleteHabitBtn: document.querySelector("#deleteHabitBtn"),
  manageDialog: document.querySelector("#manageDialog"),
  manageList: document.querySelector("#manageList")
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.habits && saved?.logs) return saved;
  } catch {}
  return structuredClone(defaultState);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function dateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA");
}

function logFor(key = dateKey()) {
  if (!state.logs[key]) state.logs[key] = {};
  return state.logs[key];
}

function isDone(habitId, key = dateKey()) {
  return Boolean(state.logs[key]?.[habitId]);
}

function toggleHabit(id) {
  const log = logFor();
  log[id] = !log[id];
  saveState();
  render();
}

function scoreForDay(key) {
  const log = state.logs[key] || {};
  return state.habits.reduce((sum, h) => {
    if (!log[h.id]) return sum;
    return sum + (h.type === "good" ? h.points : -h.points);
  }, 0);
}

function renderHabits(type, container) {
  const habits = state.habits.filter(h => h.type === type);
  container.innerHTML = "";

  if (!habits.length) {
    container.innerHTML = `<div class="empty">No ${type} habits yet. Tap “Add” to create one.</div>`;
    return;
  }

  habits.forEach(habit => {
    const done = isDone(habit.id);
    const row = document.createElement("div");
    row.className = `habit ${habit.type} ${done ? "done" : ""}`;
    row.innerHTML = `
      <button class="check-btn" aria-label="${done ? "Undo" : "Complete"} ${escapeHtml(habit.name)}">${done ? "✓" : ""}</button>
      <div class="habit-copy">
        <span class="habit-name">${escapeHtml(habit.name)}</span>
        <div class="habit-sub">${habit.type === "good" ? "Earn points" : "Lose points"}</div>
      </div>
      <span class="points">${habit.type === "good" ? "+" : "−"}${habit.points}</span>
    `;
    row.querySelector(".check-btn").addEventListener("click", () => toggleHabit(habit.id));
    container.appendChild(row);
  });
}

function getLastSevenDays() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function renderWeek() {
  const days = getLastSevenDays();
  const scores = days.map(d => scoreForDay(dateKey(d)));
  const maxAbs = Math.max(20, ...scores.map(Math.abs));
  els.weekChart.innerHTML = "";

  days.forEach((d, i) => {
    const score = scores[i];
    const height = Math.max(4, Math.round((Math.abs(score) / maxAbs) * 95));
    const col = document.createElement("div");
    col.className = "day-col";
    col.innerHTML = `
      <div class="bar-wrap"><div class="bar ${score < 0 ? "negative" : ""}" style="height:${height}%"></div></div>
      <div class="day-score">${score}</div>
      <div class="day-name">${d.toLocaleDateString(undefined, { weekday: "narrow" })}</div>
    `;
    els.weekChart.appendChild(col);
  });

  const total = scores.reduce((a, b) => a + b, 0);
  els.weekTotal.textContent = `${total} pts`;
}

function calculateStreak() {
  let streak = 0;
  const d = new Date();
  d.setHours(12,0,0,0);

  for (let i = 0; i < 365; i++) {
    const key = dateKey(d);
    if (scoreForDay(key) > 0) streak++;
    else if (i === 0) { /* today can still be unfinished */ }
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function renderManageList() {
  els.manageList.innerHTML = "";
  state.habits.forEach(h => {
    const btn = document.createElement("button");
    btn.className = "manage-item";
    btn.innerHTML = `<span>${escapeHtml(h.name)}</span><small>${h.type === "good" ? "+" : "−"}${h.points} pts</small>`;
    btn.addEventListener("click", () => {
      els.manageDialog.close();
      openHabitDialog(h.type, h);
    });
    els.manageList.appendChild(btn);
  });
}

function render() {
  const today = new Date();
  els.todayLabel.textContent = today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  els.todayScore.textContent = scoreForDay(dateKey());
  els.streakCount.textContent = calculateStreak();
  renderHabits("good", els.goodList);
  renderHabits("bad", els.badList);
  renderWeek();
  renderManageList();
}

function openHabitDialog(type, habit = null) {
  els.habitForm.reset();
  els.habitType.value = type;
  els.habitId.value = habit?.id || "";
  els.habitName.value = habit?.name || "";
  els.habitPoints.value = habit?.points || (type === "good" ? 10 : 5);
  els.dialogTitle.textContent = habit ? "Edit habit" : `Add ${type} habit`;
  els.deleteHabitBtn.classList.toggle("hidden", !habit);
  els.habitDialog.showModal();
  setTimeout(() => els.habitName.focus(), 50);
}

document.querySelectorAll(".small-add").forEach(btn => {
  btn.addEventListener("click", () => openHabitDialog(btn.dataset.type));
});

document.querySelector("#settingsBtn").addEventListener("click", () => {
  renderManageList();
  els.manageDialog.showModal();
});

document.querySelector("#closeManageBtn").addEventListener("click", () => els.manageDialog.close());

els.habitForm.addEventListener("submit", event => {
  event.preventDefault();
  const name = els.habitName.value.trim();
  const points = Number(els.habitPoints.value);
  const type = els.habitType.value;
  const id = els.habitId.value;

  if (!name || !Number.isFinite(points) || points < 1) return;

  if (id) {
    const habit = state.habits.find(h => h.id === id);
    if (habit) Object.assign(habit, { name, points, type });
  } else {
    state.habits.push({ id: crypto.randomUUID(), name, points, type });
  }

  saveState();
  els.habitDialog.close();
  render();
});

els.deleteHabitBtn.addEventListener("click", () => {
  const id = els.habitId.value;
  if (!id) return;
  state.habits = state.habits.filter(h => h.id !== id);
  Object.values(state.logs).forEach(log => delete log[id]);
  saveState();
  els.habitDialog.close();
  render();
});

document.querySelector("#resetTodayBtn").addEventListener("click", () => {
  if (confirm("Clear all checkoffs for today?")) {
    state.logs[dateKey()] = {};
    saveState();
    render();
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();
