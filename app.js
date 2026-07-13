const STORAGE_KEY = "habitQuest.v1";

const defaultState = {
  habits: [
    { id: crypto.randomUUID(), name: "Workout or intentional movement", points: 20, type: "good" },
    { id: crypto.randomUUID(), name: "Study focused for 45 minutes", points: 15, type: "good" },
    { id: crypto.randomUUID(), name: "Night routine completed", points: 10, type: "good" },
    { id: crypto.randomUUID(), name: "Doomscrolling over 30 minutes", points: 10, type: "bad" },
    { id: crypto.randomUUID(), name: "Skipped a planned responsibility", points: 15, type: "bad" }
  ],
  logs: {},
  snapshots: {},
  preferences: { range: "week", chartType: "bar" }
};

let state = loadState();
let resizeTimer;

const els = {
  todayScore: document.querySelector("#todayScore"),
  todayGrade: document.querySelector("#todayGrade"),
  pointsPossible: document.querySelector("#pointsPossible"),
  todayLabel: document.querySelector("#todayLabel"),
  streakCount: document.querySelector("#streakCount"),
  goodList: document.querySelector("#goodList"),
  badList: document.querySelector("#badList"),
  barChart: document.querySelector("#barChart"),
  lineChart: document.querySelector("#lineChart"),
  chartTitle: document.querySelector("#chartTitle"),
  rangeAverage: document.querySelector("#rangeAverage"),
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
    if (saved?.habits && saved?.logs) {
      saved.snapshots ||= {};
      saved.preferences ||= { range: "week", chartType: "bar" };
      return saved;
    }
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

function currentPossiblePoints() {
  return state.habits.filter(h => h.type === "good").reduce((sum, h) => sum + h.points, 0);
}

function rawScoreForDay(key) {
  const log = state.logs[key] || {};
  return state.habits.reduce((sum, h) => {
    if (!log[h.id]) return sum;
    return sum + (h.type === "good" ? h.points : -h.points);
  }, 0);
}

function syncSnapshot(key = dateKey()) {
  const possible = currentPossiblePoints();
  const raw = rawScoreForDay(key);
  const grade = possible > 0 ? Math.max(0, Math.min(100, Math.round((raw / possible) * 100))) : 0;
  state.snapshots[key] = { raw, possible, grade };
}

function toggleHabit(id) {
  const log = logFor();
  log[id] = !log[id];
  syncSnapshot();
  saveState();
  render();
}

function metricsForDay(key) {
  if (key === dateKey()) syncSnapshot(key);
  if (state.snapshots[key]) return state.snapshots[key];

  // Backward compatibility for days recorded before this update.
  if (state.logs[key]) {
    const possible = currentPossiblePoints();
    const raw = rawScoreForDay(key);
    const grade = possible > 0 ? Math.max(0, Math.min(100, Math.round((raw / possible) * 100))) : 0;
    return { raw, possible, grade };
  }

  return { raw: 0, possible: 0, grade: 0 };
}

function gradeClass(grade) {
  if (grade >= 90) return "grade-a";
  if (grade >= 80) return "grade-b";
  if (grade >= 70) return "grade-c";
  return "grade-f";
}

function gradeColor(grade) {
  const styles = getComputedStyle(document.documentElement);
  if (grade >= 90) return styles.getPropertyValue("--good").trim();
  if (grade >= 80) return styles.getPropertyValue("--yellow").trim();
  if (grade >= 70) return styles.getPropertyValue("--orange").trim();
  return styles.getPropertyValue("--bad").trim();
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

function dayAtNoon(date = new Date()) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d;
}

function rangeData(range) {
  const now = dayAtNoon();
  const data = [];

  if (range === "week") {
    for (let i = 6; i >= 0; i--) {
      const d = dayAtNoon(now);
      d.setDate(d.getDate() - i);
      data.push({
        label: d.toLocaleDateString(undefined, { weekday: "narrow" }),
        grade: metricsForDay(dateKey(d)).grade
      });
    }
    return { title: "Weekly grade", data };
  }

  if (range === "month") {
    for (let i = 29; i >= 0; i--) {
      const d = dayAtNoon(now);
      d.setDate(d.getDate() - i);
      data.push({
        label: d.getDate().toString(),
        grade: metricsForDay(dateKey(d)).grade
      });
    }
    return { title: "30-day grade", data };
  }

  if (range === "year") {
    for (let i = 11; i >= 0; i--) {
      const start = dayAtNoon(now);
      start.setDate(1);
      start.setMonth(start.getMonth() - i);
      const end = dayAtNoon(start);
      end.setMonth(end.getMonth() + 1);
      const grades = [];
      for (let d = dayAtNoon(start); d < end && d <= now; d.setDate(d.getDate() + 1)) {
        const key = dateKey(d);
        if (state.logs[key] || state.snapshots[key]) grades.push(metricsForDay(key).grade);
      }
      data.push({
        label: start.toLocaleDateString(undefined, { month: "short" }),
        grade: grades.length ? Math.round(grades.reduce((a,b) => a+b, 0) / grades.length) : 0
      });
    }
    return { title: "One-year grade", data };
  }

  // Five-year view: one bar/point per month, up to 60 points.
  for (let i = 59; i >= 0; i--) {
    const start = dayAtNoon(now);
    start.setDate(1);
    start.setMonth(start.getMonth() - i);
    const end = dayAtNoon(start);
    end.setMonth(end.getMonth() + 1);
    const grades = [];
    for (let d = dayAtNoon(start); d < end && d <= now; d.setDate(d.getDate() + 1)) {
      const key = dateKey(d);
      if (state.logs[key] || state.snapshots[key]) grades.push(metricsForDay(key).grade);
    }
    data.push({
      label: start.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      grade: grades.length ? Math.round(grades.reduce((a,b) => a+b, 0) / grades.length) : 0
    });
  }
  return { title: "Five-year grade", data };
}

function renderBarChart(data, range) {
  els.barChart.innerHTML = "";
  els.barChart.style.gridTemplateColumns = `repeat(${data.length}, minmax(${range === "month" || range === "fiveYear" ? "24px" : "38px"}, 1fr))`;
  els.barChart.style.width = data.length > 30 ? `${Math.max(100, data.length * 4)}%` : "100%";

  data.forEach((item, index) => {
    const cell = document.createElement("div");
    cell.className = "bar-item";
    const showLabel = range === "week" || range === "year" || 
      (range === "month" && index % 3 === 0) ||
      (range === "fiveYear" && index % 6 === 0);
    cell.innerHTML = `
      <div class="bar-wrap">
        <div class="bar ${gradeClass(item.grade)}" style="height:${Math.max(2, item.grade)}%"></div>
      </div>
      <div class="bar-grade">${item.grade}%</div>
      <div class="bar-label">${showLabel ? item.label : ""}</div>
    `;
    els.barChart.appendChild(cell);
  });
}

function renderLineChart(data) {
  const canvas = els.lineChart;
  const shell = canvas.parentElement;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, shell.clientWidth);
  const height = 260;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);

  const pad = { left: 34, right: 18, top: 20, bottom: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const lineColor = getComputedStyle(document.documentElement).getPropertyValue("--line").trim();
  const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();

  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  [0, 25, 50, 75, 100].forEach(v => {
    const y = pad.top + plotH - (v / 100) * plotH;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(`${v}`, pad.left - 7, y);
  });

  if (!data.length) return;
  const xAt = i => data.length === 1 ? pad.left + plotW / 2 : pad.left + (i / (data.length - 1)) * plotW;
  const yAt = grade => pad.top + plotH - (grade / 100) * plotH;

  for (let i = 0; i < data.length - 1; i++) {
    ctx.strokeStyle = gradeColor(Math.round((data[i].grade + data[i+1].grade) / 2));
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(xAt(i), yAt(data[i].grade));
    ctx.lineTo(xAt(i+1), yAt(data[i+1].grade));
    ctx.stroke();
  }

  data.forEach((item, i) => {
    ctx.fillStyle = gradeColor(item.grade);
    ctx.beginPath();
    ctx.arc(xAt(i), yAt(item.grade), data.length > 35 ? 2.5 : 4, 0, Math.PI * 2);
    ctx.fill();
  });

  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  ctx.fillStyle = muted;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  data.forEach((item, i) => {
    if (i % labelStep === 0 || i === data.length - 1) {
      ctx.fillText(item.label, xAt(i), height - pad.bottom + 10);
    }
  });
}

function renderHistory() {
  const range = state.preferences.range;
  const chartType = state.preferences.chartType;
  const result = rangeData(range);
  els.chartTitle.textContent = result.title;

  const recorded = result.data.filter(x => x.grade > 0);
  const average = recorded.length ? Math.round(recorded.reduce((sum, x) => sum + x.grade, 0) / recorded.length) : 0;
  els.rangeAverage.textContent = `${average}% avg`;

  document.querySelectorAll("#rangeControls button").forEach(btn => btn.classList.toggle("active", btn.dataset.range === range));
  document.querySelectorAll("#chartTypeControls button").forEach(btn => btn.classList.toggle("active", btn.dataset.chart === chartType));

  els.barChart.classList.toggle("hidden", chartType !== "bar");
  els.lineChart.classList.toggle("hidden", chartType !== "line");

  if (chartType === "bar") renderBarChart(result.data, range);
  else renderLineChart(result.data);
}

function calculateStreak() {
  let streak = 0;
  const d = dayAtNoon();
  for (let i = 0; i < 3650; i++) {
    const key = dateKey(d);
    const grade = metricsForDay(key).grade;
    if (grade > 0) streak++;
    else if (i !== 0) break;
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
  syncSnapshot();
  saveState();

  const today = new Date();
  const metrics = metricsForDay(dateKey());
  els.todayLabel.textContent = today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  els.todayScore.textContent = metrics.raw;
  els.todayGrade.textContent = `${metrics.grade}%`;
  els.todayGrade.style.color = gradeColor(metrics.grade);
  els.pointsPossible.textContent = `of ${metrics.possible} possible`;
  els.streakCount.textContent = calculateStreak();

  renderHabits("good", els.goodList);
  renderHabits("bad", els.badList);
  renderHistory();
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

document.querySelectorAll("#rangeControls button").forEach(btn => {
  btn.addEventListener("click", () => {
    state.preferences.range = btn.dataset.range;
    saveState();
    renderHistory();
  });
});

document.querySelectorAll("#chartTypeControls button").forEach(btn => {
  btn.addEventListener("click", () => {
    state.preferences.chartType = btn.dataset.chart;
    saveState();
    renderHistory();
  });
});

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

  syncSnapshot();
  saveState();
  els.habitDialog.close();
  render();
});

els.deleteHabitBtn.addEventListener("click", () => {
  const id = els.habitId.value;
  if (!id) return;
  state.habits = state.habits.filter(h => h.id !== id);
  syncSnapshot();
  saveState();
  els.habitDialog.close();
  render();
});

document.querySelector("#resetTodayBtn").addEventListener("click", () => {
  if (confirm("Clear all checkoffs for today?")) {
    state.logs[dateKey()] = {};
    syncSnapshot();
    saveState();
    render();
  }
});

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.preferences.chartType === "line") renderHistory();
  }, 150);
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
