import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCDKbVG2J-IRNOsT7XKeRMMStaDGM1HZRc",
  authDomain: "habit-quest-31489.firebaseapp.com",
  projectId: "habit-quest-31489",
  storageBucket: "habit-quest-31489.firebasestorage.app",
  messagingSenderId: "725666329057",
  appId: "1:725666329057:web:3150244e6265c96c0c22a0"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

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
  preferences: { range: "week", chartType: "bar" },
  createdAt: Date.now()
};

let state = loadLocal();
let user = null;
let unsubscribeCloud = null;
let cloudSaveTimer = null;
let calendarCursor = new Date();

const $ = selector => document.querySelector(selector);
const els = {
  authScreen: $("#authScreen"), app: $("#app"), authStatus: $("#authStatus"),
  syncBadge: $("#syncBadge"), todayGrade: $("#todayGrade"), letterGrade: $("#letterGrade"),
  gradeRing: $("#gradeRing"), gradeMessage: $("#gradeMessage"), todayDate: $("#todayDate"),
  todayScore: $("#todayScore"), pointsPossible: $("#pointsPossible"), streakCount: $("#streakCount"),
  dashboardWeeklyAvg: $("#dashboardWeeklyAvg"), goodList: $("#goodList"), badList: $("#badList"),
  chartTitle: $("#chartTitle"), rangeAverage: $("#rangeAverage"), barChart: $("#barChart"),
  lineChart: $("#lineChart"), habitStats: $("#habitStats"), calendarMonth: $("#calendarMonth"),
  calendarGrid: $("#calendarGrid"), dayDetail: $("#dayDetail"), habitDialog: $("#habitDialog"),
  habitForm: $("#habitForm"), habitType: $("#habitType"), habitId: $("#habitId"),
  habitName: $("#habitName"), habitPoints: $("#habitPoints"), dialogTitle: $("#dialogTitle"),
  deleteHabitBtn: $("#deleteHabitBtn"), settingsDialog: $("#settingsDialog"),
  signedInAs: $("#signedInAs"), manageList: $("#manageList")
};

function loadLocal() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.habits && stored?.logs) {
      stored.snapshots ||= {};
      stored.preferences ||= { range: "week", chartType: "bar" };
      return stored;
    }
  } catch {}
  return structuredClone(defaultState);
}
function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function dateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA");
}
function atNoon(date = new Date()) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d;
}
function totalPossibleGoodPoints() {
  return state.habits.filter(h => h.type === "good").reduce((sum, h) => sum + h.points, 0);
}
function rawScoreForDay(key) {
  const log = state.logs[key] || {};
  return state.habits.reduce((sum, habit) => {
    if (!log[habit.id]) return sum;
    return sum + (habit.type === "good" ? habit.points : -habit.points);
  }, 0);
}
function syncSnapshot(key = dateKey()) {
  const possible = totalPossibleGoodPoints();
  const raw = rawScoreForDay(key);
  const grade = possible > 0 ? Math.max(0, Math.min(100, Math.round(raw / possible * 100))) : 0;
  state.snapshots[key] = { raw, possible, grade };
}
function metricsForDay(key) {
  if (key === dateKey()) syncSnapshot(key);
  if (state.snapshots[key]) return state.snapshots[key];
  if (state.logs[key]) {
    const possible = totalPossibleGoodPoints();
    const raw = rawScoreForDay(key);
    return { raw, possible, grade: possible ? Math.max(0, Math.min(100, Math.round(raw / possible * 100))) : 0 };
  }
  return { raw: 0, possible: 0, grade: 0 };
}
function logFor(key = dateKey()) {
  state.logs[key] ||= {};
  return state.logs[key];
}
function isDone(habitId, key = dateKey()) {
  return Boolean(state.logs[key]?.[habitId]);
}
function queueCloudSave() {
  saveLocal();
  setSyncStatus("saving");
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(saveCloud, 350);
}
function setSyncStatus(status) {
  const map = {
    synced: ["● Synced", "#8cf0a6"],
    saving: ["● Saving", "#f3d244"],
    offline: ["● Offline", "#ff626d"],
    loading: ["● Loading", "#bcbcc3"]
  };
  const [text, color] = map[status];
  els.syncBadge.textContent = text;
  els.syncBadge.style.color = color;
}
async function saveCloud() {
  if (!user) return;
  try {
    await setDoc(doc(db, "users", user.uid, "data", "state"), {
      ...state,
      updatedAt: serverTimestamp()
    });
    setSyncStatus("synced");
  } catch (error) {
    console.error(error);
    setSyncStatus("offline");
  }
}
async function hydrateFromCloud() {
  if (!user) return;
  const ref = doc(db, "users", user.uid, "data", "state");
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    const remote = snapshot.data();
    delete remote.updatedAt;

    const localHasHistory = Object.keys(state.logs || {}).length > 0;
    const remoteHasHistory = Object.keys(remote.logs || {}).length > 0;

    if (localHasHistory && !remoteHasHistory) {
      await setDoc(ref, { ...state, updatedAt: serverTimestamp() });
    } else {
      state = remote;
      saveLocal();
    }
  } else {
    await setDoc(ref, { ...state, updatedAt: serverTimestamp() });
  }

  unsubscribeCloud?.();
  unsubscribeCloud = onSnapshot(ref, snapshot => {
    if (!snapshot.exists()) return;
    const remote = snapshot.data();
    delete remote.updatedAt;
    if (JSON.stringify(remote) !== JSON.stringify(state)) {
      state = remote;
      saveLocal();
      render();
    }
  });
}
function gradeClass(grade) {
  if (grade >= 90) return "grade-a";
  if (grade >= 80) return "grade-b";
  if (grade >= 70) return "grade-c";
  return "grade-f";
}
function gradeColor(grade) {
  const styles = getComputedStyle(document.documentElement);
  if (grade >= 90) return styles.getPropertyValue("--green").trim();
  if (grade >= 80) return styles.getPropertyValue("--yellow").trim();
  if (grade >= 70) return styles.getPropertyValue("--orange").trim();
  return styles.getPropertyValue("--red").trim();
}
function letterGrade(grade) {
  if (grade >= 90) return "A";
  if (grade >= 80) return "B";
  if (grade >= 70) return "C";
  if (grade >= 60) return "D";
  return "F";
}
function gradeMessage(grade) {
  if (grade >= 90) return "Mission accomplished";
  if (grade >= 80) return "Strong performance";
  if (grade >= 70) return "Hold the line";
  if (grade > 0) return "Recovery required";
  return "Awaiting input";
}
function toggleHabit(id) {
  const log = logFor();
  log[id] = !log[id];
  syncSnapshot();
  queueCloudSave();
  render();
}
function renderHabits(type, container) {
  const habits = state.habits.filter(h => h.type === type);
  container.innerHTML = "";

  if (!habits.length) {
    container.innerHTML = `<div class="empty-state">No ${type} habits configured.</div>`;
    return;
  }

  habits.forEach(habit => {
    const done = isDone(habit.id);
    const row = document.createElement("article");
    row.className = `habit ${habit.type} ${done ? "done" : ""}`;
    row.innerHTML = `
      <button class="check-button" aria-label="${done ? "Undo" : "Complete"} ${escapeHtml(habit.name)}">${done ? "✓" : ""}</button>
      <div>
        <span class="habit-name">${escapeHtml(habit.name)}</span>
        <div class="habit-sub">${habit.type === "good" ? "Earn points" : "Apply penalty"}</div>
      </div>
      <span class="points">${habit.type === "good" ? "+" : "−"}${habit.points}</span>
    `;
    row.querySelector(".check-button").addEventListener("click", () => toggleHabit(habit.id));
    container.appendChild(row);
  });
}
function recordedAverage(days) {
  const values = [];
  const today = atNoon();
  for (let i = 0; i < days; i++) {
    const d = atNoon(today);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    if (state.logs[key] || state.snapshots[key]) values.push(metricsForDay(key).grade);
  }
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}
function rangeData(range) {
  const now = atNoon();
  const data = [];

  if (range === "week" || range === "month") {
    const count = range === "week" ? 7 : 30;
    for (let i = count - 1; i >= 0; i--) {
      const d = atNoon(now);
      d.setDate(d.getDate() - i);
      data.push({
        label: range === "week"
          ? d.toLocaleDateString(undefined, { weekday: "narrow" })
          : String(d.getDate()),
        grade: metricsForDay(dateKey(d)).grade
      });
    }
    return { title: range === "week" ? "Weekly grade" : "30-day grade", data };
  }

  const monthCount = range === "year" ? 12 : 60;
  for (let i = monthCount - 1; i >= 0; i--) {
    const start = atNoon(now);
    start.setDate(1);
    start.setMonth(start.getMonth() - i);
    const end = atNoon(start);
    end.setMonth(end.getMonth() + 1);
    const grades = [];

    for (let d = atNoon(start); d < end && d <= now; d.setDate(d.getDate() + 1)) {
      const key = dateKey(d);
      if (state.logs[key] || state.snapshots[key]) grades.push(metricsForDay(key).grade);
    }

    data.push({
      label: start.toLocaleDateString(undefined, {
        month: "short",
        year: range === "fiveYear" ? "2-digit" : undefined
      }),
      grade: grades.length ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : 0
    });
  }

  return {
    title: range === "year" ? "One-year grade" : "Five-year grade",
    data
  };
}
function renderHistory() {
  const range = state.preferences.range;
  const chartType = state.preferences.chartType;
  const { title, data } = rangeData(range);

  els.chartTitle.textContent = title;
  const recorded = data.filter(item => item.grade > 0);
  const average = recorded.length
    ? Math.round(recorded.reduce((sum, item) => sum + item.grade, 0) / recorded.length)
    : 0;
  els.rangeAverage.textContent = `${average}% AVG`;

  document.querySelectorAll("#rangeControls button").forEach(button => {
    button.classList.toggle("active", button.dataset.range === range);
  });
  document.querySelectorAll("#chartTypeControls button").forEach(button => {
    button.classList.toggle("active", button.dataset.chart === chartType);
  });

  els.barChart.classList.toggle("hidden", chartType !== "bar");
  els.lineChart.classList.toggle("hidden", chartType !== "line");

  if (chartType === "bar") renderBars(data, range);
  else renderLine(data);
}
function renderBars(data, range) {
  els.barChart.innerHTML = "";
  els.barChart.style.gridTemplateColumns = `repeat(${data.length}, minmax(${range === "week" ? "40px" : "25px"}, 1fr))`;
  els.barChart.style.width = data.length > 30 ? `${Math.max(100, data.length * 4)}%` : "100%";

  data.forEach((item, index) => {
    const showLabel =
      range === "week" ||
      range === "year" ||
      (range === "month" && index % 3 === 0) ||
      (range === "fiveYear" && index % 6 === 0);

    const cell = document.createElement("div");
    cell.className = "bar-item";
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
function renderLine(data) {
  const canvas = els.lineChart;
  const width = Math.max(320, canvas.parentElement.clientWidth);
  const height = 270;
  const ratio = window.devicePixelRatio || 1;

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);

  const pad = { left: 34, right: 18, top: 20, bottom: 34 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();

  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  [0, 25, 50, 75, 100].forEach(value => {
    const y = pad.top + plotHeight - (value / 100) * plotHeight;
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(value, pad.left - 7, y);
  });

  const xAt = index => data.length === 1
    ? pad.left + plotWidth / 2
    : pad.left + (index / (data.length - 1)) * plotWidth;
  const yAt = grade => pad.top + plotHeight - (grade / 100) * plotHeight;

  for (let i = 0; i < data.length - 1; i++) {
    ctx.strokeStyle = gradeColor(Math.round((data[i].grade + data[i + 1].grade) / 2));
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(xAt(i), yAt(data[i].grade));
    ctx.lineTo(xAt(i + 1), yAt(data[i + 1].grade));
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  data.forEach((item, index) => {
    ctx.fillStyle = gradeColor(item.grade);
    ctx.beginPath();
    ctx.arc(xAt(index), yAt(item.grade), data.length > 35 ? 2.5 : 4, 0, Math.PI * 2);
    ctx.fill();
  });

  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  ctx.fillStyle = muted;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  data.forEach((item, index) => {
    if (index % labelStep === 0 || index === data.length - 1) {
      ctx.fillText(item.label, xAt(index), height - pad.bottom + 10);
    }
  });
}
function currentStreak() {
  let streak = 0;
  const d = atNoon();
  for (let i = 0; i < 3650; i++) {
    const grade = metricsForDay(dateKey(d)).grade;
    if (grade > 0) streak++;
    else if (i !== 0) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
function longestStreak() {
  const keys = Object.keys({ ...state.logs, ...state.snapshots }).sort();
  let best = 0;
  let current = 0;
  let previous = null;

  keys.forEach(key => {
    if (metricsForDay(key).grade <= 0) {
      current = 0;
      previous = null;
      return;
    }

    const date = new Date(`${key}T12:00:00`);
    if (previous) {
      const difference = (date - previous) / 86400000;
      current = difference === 1 ? current + 1 : 1;
    } else {
      current = 1;
    }
    best = Math.max(best, current);
    previous = date;
  });

  return best;
}
function renderStatistics() {
  $("#weeklyAvg").textContent = `${recordedAverage(7)}%`;
  $("#monthlyAvg").textContent = `${recordedAverage(30)}%`;
  $("#yearlyAvg").textContent = `${recordedAverage(365)}%`;

  const keys = Object.keys({ ...state.logs, ...state.snapshots });
  const grades = keys.map(key => metricsForDay(key).grade);
  $("#bestGrade").textContent = `${grades.length ? Math.max(...grades) : 0}%`;
  $("#longestStreak").textContent = longestStreak();

  let completions = 0;
  let goodPoints = 0;
  let penalties = 0;

  Object.values(state.logs).forEach(log => {
    Object.entries(log).forEach(([habitId, completed]) => {
      if (!completed) return;
      const habit = state.habits.find(item => item.id === habitId);
      if (!habit) return;
      completions++;
      if (habit.type === "good") goodPoints += habit.points;
      else penalties += habit.points;
    });
  });

  $("#totalCompletions").textContent = completions;
  $("#totalGoodPoints").textContent = goodPoints;
  $("#totalPenalties").textContent = penalties;

  const recordedDays = Math.max(1, Object.keys(state.logs).length);
  els.habitStats.innerHTML = "";

  state.habits.forEach(habit => {
    let count = 0;
    Object.values(state.logs).forEach(log => {
      if (log[habit.id]) count++;
    });
    const percentage = Math.round(count / recordedDays * 100);

    const card = document.createElement("article");
    card.className = "habit-stat";
    card.innerHTML = `
      <div class="habit-stat-top">
        <strong>${escapeHtml(habit.name)}</strong>
        <span>${percentage}%</span>
      </div>
      <div class="habit-stat-bar">
        <div class="habit-stat-fill" style="width:${percentage}%"></div>
      </div>
      <small class="habit-sub">${count} recorded completion${count === 1 ? "" : "s"}</small>
    `;
    els.habitStats.appendChild(card);
  });
}
function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  els.calendarMonth.textContent = calendarCursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
  els.calendarGrid.innerHTML = "";

  for (let i = 0; i < first.getDay(); i++) {
    const blank = document.createElement("div");
    blank.className = "calendar-day empty-day";
    els.calendarGrid.appendChild(blank);
  }

  for (let day = 1; day <= last.getDate(); day++) {
    const date = new Date(year, month, day, 12);
    const key = dateKey(date);
    const grade = metricsForDay(key).grade;

    const button = document.createElement("button");
    button.className = `calendar-day ${gradeClass(grade)}`;
    button.innerHTML = `<strong>${day}</strong><small>${grade}%</small>`;
    button.addEventListener("click", () => showDayDetails(key, button));
    els.calendarGrid.appendChild(button);
  }
}
function showDayDetails(key, selectedButton) {
  document.querySelectorAll(".calendar-day").forEach(button => button.classList.remove("selected"));
  selectedButton.classList.add("selected");

  const metrics = metricsForDay(key);
  const log = state.logs[key] || {};
  const completed = state.habits.filter(habit => log[habit.id]);
  const missedGood = state.habits.filter(habit => habit.type === "good" && !log[habit.id]);

  els.dayDetail.innerHTML = `
    <h3>${new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    })}</h3>
    <strong style="font-size:2.2rem;color:${gradeColor(metrics.grade)}">${metrics.grade}%</strong>
    <p class="habit-sub">${metrics.raw} of ${metrics.possible} possible points</p>
    <div class="day-list">
      ${completed.length
        ? completed.map(habit => `
            <div class="day-row">
              <span>${escapeHtml(habit.name)}</span>
              <strong>${habit.type === "good" ? "+" : "−"}${habit.points}</strong>
            </div>`).join("")
        : '<p class="status-copy">No habits recorded for this day.</p>'}
      ${missedGood.length
        ? `<div class="day-row"><span>Missed good habits</span><strong>${missedGood.length}</strong></div>`
        : ""}
    </div>
  `;
}
function renderManageList() {
  els.manageList.innerHTML = "";
  state.habits.forEach(habit => {
    const button = document.createElement("button");
    button.className = "manage-item";
    button.innerHTML = `
      <span>${escapeHtml(habit.name)}</span>
      <small>${habit.type === "good" ? "+" : "−"}${habit.points}</small>
    `;
    button.addEventListener("click", () => {
      els.settingsDialog.close();
      openHabitDialog(habit.type, habit);
    });
    els.manageList.appendChild(button);
  });
}
function render() {
  syncSnapshot();
  saveLocal();

  const todayMetrics = metricsForDay(dateKey());
  els.todayGrade.textContent = `${todayMetrics.grade}%`;
  els.todayGrade.style.color = gradeColor(todayMetrics.grade);
  els.letterGrade.textContent = letterGrade(todayMetrics.grade);
  els.gradeRing.style.setProperty("--grade", todayMetrics.grade);
  els.gradeMessage.textContent = gradeMessage(todayMetrics.grade);
  els.todayDate.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "short", day: "numeric"
  });

  els.todayScore.textContent = todayMetrics.raw;
  els.pointsPossible.textContent = `of ${todayMetrics.possible} possible`;
  els.streakCount.textContent = currentStreak();
  els.dashboardWeeklyAvg.textContent = `${recordedAverage(7)}%`;

  renderHabits("good", els.goodList);
  renderHabits("bad", els.badList);
  renderHistory();
  renderStatistics();
  renderCalendar();
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
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
}

$("#googleSignInBtn").addEventListener("click", async () => {
  els.authStatus.textContent = "Opening secure sign-in…";
  try {
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (mobile) await signInWithRedirect(auth, provider);
    else await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    els.authStatus.textContent = error.message;
  }
});

getRedirectResult(auth).catch(error => {
  console.error(error);
  els.authStatus.textContent = error.message;
});

onAuthStateChanged(auth, async currentUser => {
  user = currentUser;

  if (currentUser) {
    els.authScreen.classList.add("hidden");
    els.app.classList.remove("hidden");
    els.signedInAs.textContent = `Signed in as ${currentUser.email || currentUser.displayName}`;
    setSyncStatus("loading");

    try {
      await hydrateFromCloud();
      render();
      setSyncStatus("synced");
    } catch (error) {
      console.error(error);
      render();
      setSyncStatus("offline");
    }
  } else {
    unsubscribeCloud?.();
    els.app.classList.add("hidden");
    els.authScreen.classList.remove("hidden");
  }
});

document.querySelectorAll(".nav-button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-button").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
    button.classList.add("active");
    $(`#${button.dataset.view}View`).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

document.querySelectorAll(".text-button").forEach(button => {
  button.addEventListener("click", () => openHabitDialog(button.dataset.type));
});

$("#settingsBtn").addEventListener("click", () => els.settingsDialog.showModal());
$("#closeSettingsBtn").addEventListener("click", () => els.settingsDialog.close());
$("#signOutBtn").addEventListener("click", () => signOut(auth));

document.querySelectorAll("#rangeControls button").forEach(button => {
  button.addEventListener("click", () => {
    state.preferences.range = button.dataset.range;
    queueCloudSave();
    renderHistory();
  });
});

document.querySelectorAll("#chartTypeControls button").forEach(button => {
  button.addEventListener("click", () => {
    state.preferences.chartType = button.dataset.chart;
    queueCloudSave();
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
    const habit = state.habits.find(item => item.id === id);
    if (habit) Object.assign(habit, { name, points, type });
  } else {
    state.habits.push({ id: crypto.randomUUID(), name, points, type });
  }

  syncSnapshot();
  queueCloudSave();
  els.habitDialog.close();
  render();
});

els.deleteHabitBtn.addEventListener("click", () => {
  const id = els.habitId.value;
  state.habits = state.habits.filter(habit => habit.id !== id);
  Object.values(state.logs).forEach(log => delete log[id]);
  syncSnapshot();
  queueCloudSave();
  els.habitDialog.close();
  render();
});

$("#resetTodayBtn").addEventListener("click", () => {
  if (confirm("Clear all checkoffs for today?")) {
    state.logs[dateKey()] = {};
    syncSnapshot();
    queueCloudSave();
    render();
  }
});

$("#prevMonth").addEventListener("click", () => {
  calendarCursor.setMonth(calendarCursor.getMonth() - 1);
  renderCalendar();
});

$("#nextMonth").addEventListener("click", () => {
  calendarCursor.setMonth(calendarCursor.getMonth() + 1);
  renderCalendar();
});

window.addEventListener("resize", () => {
  if (state.preferences.chartType === "line") renderHistory();
});
