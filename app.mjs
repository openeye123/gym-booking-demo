import {
  SLOTS,
  dateKey,
  dateFromKey,
  slotDateTime,
  upcomingDates,
  weekdayLabel,
  shortDateLabel,
  longDateLabel,
} from "./booking-data.mjs";

const STORAGE_KEY = "sysu-gym-reservations-v1";
const AVAILABILITY_KEY = "sysu-gym-availability-v1";
const SAMPLE_FULL_SLOT_IDS = ["16:00", "20:00"];
const dateTabs = document.querySelector("#date-tabs");
const slotList = document.querySelector("#slot-list");
const selectedDateLabel = document.querySelector("#selected-date-label");
const activeList = document.querySelector("#active-reservations");
const historyList = document.querySelector("#history-reservations");
const activeCount = document.querySelector("#active-count");
const historyCount = document.querySelector("#history-count");
const cancelDialog = document.querySelector("#cancel-dialog");
const cancelDescription = document.querySelector("#cancel-description");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsForm = document.querySelector("#settings-form");
const quotaSettings = document.querySelector("#quota-settings");
const settingsDateSelect = document.querySelector("#settings-date-select");
const slotSettings = document.querySelector("#slot-settings");
const settingsError = document.querySelector("#settings-error");
const toast = document.querySelector("#toast");

let bookings = readBookings() ?? [];
let availability = readAvailability() ?? {};
let selectedDate = dateKey(new Date());
let pendingCancelId = null;
let newBookingId = null;
let settingsDraft = null;
let toastTimer;

function readBookings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
      dateKey(dateFromKey(item.date)) === item.date &&
      SLOTS.some((slot) => slot.id === item.slotId) &&
      (item.status === "active" || item.status === "cancelled")
    );
  } catch {
    return null;
  }
}

function saveBookings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    return true;
  } catch {
    return false;
  }
}

function readAvailability() {
  try {
    const raw = localStorage.getItem(AVAILABILITY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(key) &&
      dateKey(dateFromKey(key)) === key &&
      value && Number.isSafeInteger(value.remaining) && Array.isArray(value.fullSlots)
    ).map(([key, value]) => [key, {
      remaining: value.remaining,
      fullSlots: [...new Set(value.fullSlots.filter((id) => SLOTS.some((slot) => slot.id === id)))],
    }]));
  } catch {
    return null;
  }
}

function saveAvailability() {
  try {
    localStorage.setItem(AVAILABILITY_KEY, JSON.stringify(availability));
    return true;
  } catch {
    return false;
  }
}

function ensureAvailabilityForWindow(now) {
  const dates = upcomingDates(now).map(dateKey);
  const firstVisit = Object.keys(availability).length === 0;
  let changed = false;
  dates.forEach((key, index) => {
    if (availability[key]) return;
    availability[key] = {
      remaining: firstVisit && index < 2 ? -1 : 107,
      fullSlots: firstVisit && index === 2 ? [...SAMPLE_FULL_SLOT_IDS] : [],
    };
    changed = true;
  });
  if (changed) saveAvailability();
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function activeBookingFor(date, slotId) {
  return bookings.find((item) => item.date === date && item.slotId === slotId && item.status === "active");
}

function renderDateTabs(now) {
  const dates = upcomingDates(now);
  const keys = dates.map(dateKey);
  if (!keys.includes(selectedDate)) selectedDate = keys[0];
  dateTabs.replaceChildren();

  dates.forEach((date, index) => {
    const key = keys[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `date-tab${key === selectedDate ? " is-active" : ""}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(key === selectedDate));
    button.tabIndex = key === selectedDate ? 0 : -1;
    button.dataset.date = key;

    const day = document.createElement("span");
    day.className = "date-tab-day";
    day.textContent = weekdayLabel(date);
    const dateText = document.createElement("strong");
    dateText.className = "date-tab-date";
    dateText.textContent = shortDateLabel(date);
    const count = document.createElement("span");
    count.className = "date-tab-count";
    count.textContent = String(availability[key].remaining);
    button.append(day, dateText, count);
    button.addEventListener("click", () => selectDate(key));
    dateTabs.append(button);
  });
}

function selectDate(key, focus = false) {
  selectedDate = key;
  renderAll();
  if (focus) dateTabs.querySelector(`[data-date="${key}"]`)?.focus();
}

dateTabs.addEventListener("keydown", (event) => {
  const tabs = [...dateTabs.querySelectorAll("[role=tab]")];
  const currentIndex = tabs.findIndex((tab) => tab.dataset.date === selectedDate);
  let targetIndex;
  if (event.key === "ArrowRight") targetIndex = (currentIndex + 1) % tabs.length;
  if (event.key === "ArrowLeft") targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "Home") targetIndex = 0;
  if (event.key === "End") targetIndex = tabs.length - 1;
  if (targetIndex === undefined) return;
  event.preventDefault();
  selectDate(tabs[targetIndex].dataset.date, true);
});

function renderSlots(now) {
  selectedDateLabel.textContent = `${longDateLabel(dateFromKey(selectedDate))} · ${weekdayLabel(dateFromKey(selectedDate))}`;
  slotList.replaceChildren();

  SLOTS.forEach((slot) => {
    const row = document.createElement("div");
    row.className = "slot-row";
    const time = document.createElement("div");
    time.className = "slot-time";
    const start = document.createElement("strong");
    start.textContent = `${slot.start}–`;
    const end = document.createElement("span");
    end.textContent = slot.end;
    time.append(start, end);

    const wrap = document.createElement("div");
    wrap.className = "slot-action-wrap";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-action";
    const ownBooking = activeBookingFor(selectedDate, slot.id);
    const full = availability[selectedDate].remaining <= 0 || availability[selectedDate].fullSlots.includes(slot.id);
    const past = slotDateTime(selectedDate, slot.start) <= now;
    if (ownBooking) {
      button.classList.add("is-booked");
      button.textContent = "已约";
      button.disabled = true;
    } else if (past) {
      button.classList.add("is-past");
      button.textContent = "无法选择";
      button.disabled = true;
    } else if (full) {
      button.classList.add("is-booked");
      button.textContent = "已约";
      button.disabled = true;
    } else {
      button.setAttribute("aria-label", `${longDateLabel(dateFromKey(selectedDate))} ${slot.start}至${slot.end}，可预约`);
      button.textContent = "可预约";
      button.addEventListener("click", () => bookSlot(selectedDate, slot));
    }
    wrap.append(button);
    row.append(time, wrap);
    slotList.append(row);
  });
}

function bookSlot(date, slot) {
  const now = new Date();
  if (!upcomingDates(now).some((item) => dateKey(item) === date) || slotDateTime(date, slot.start) <= now) {
    renderAll();
    showToast("该时段已过期，请选择其他日期或时段。");
    return;
  }

  const latestAvailability = readAvailability();
  if (latestAvailability && Object.keys(latestAvailability).length) availability = latestAvailability;
  ensureAvailabilityForWindow(now);
  const dayAvailability = availability[date];
  if (dayAvailability.remaining <= 0 || dayAvailability.fullSlots.includes(slot.id)) {
    renderAll();
    showToast("该时段已约满，请选择其他时段。");
    return;
  }

  const saved = readBookings();
  if (saved) bookings = saved;
  if (activeBookingFor(date, slot.id)) {
    renderAll();
    showToast("这个时段已在“我的预约”中。");
    return;
  }

  const booking = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    date,
    slotId: slot.id,
    status: "active",
    createdAt: now.toISOString(),
  };
  bookings.push(booking);
  dayAvailability.remaining -= 1;
  newBookingId = booking.id;
  const persisted = saveBookings() && saveAvailability();
  renderAll();
  showToast(persisted ? "预约成功，已显示在“我的预约”。" : "预约已显示，但浏览器未允许保存；刷新后可能丢失。");
  document.querySelector("#my-reservations").scrollIntoView({ behavior: "smooth", block: "start" });
}

function bookingStart(booking) {
  return slotDateTime(booking.date, booking.slotId);
}

function bookingEnd(booking) {
  const slot = SLOTS.find((item) => item.id === booking.slotId);
  return slotDateTime(booking.date, slot.end);
}

function makeReservationCard(booking, historical) {
  const slot = SLOTS.find((item) => item.id === booking.slotId);
  const card = document.createElement("article");
  card.className = `reservation-card${booking.id === newBookingId ? " is-new" : ""}`;
  const main = document.createElement("div");
  main.className = "reservation-card-main";
  const title = document.createElement("strong");
  title.textContent = "深圳校区健身房-场地1";
  const when = document.createElement("p");
  when.textContent = `${longDateLabel(dateFromKey(booking.date))} ${slot.start} - ${slot.end}`;
  main.append(title, when);

  const side = document.createElement("div");
  side.className = "reservation-card-side";
  const status = document.createElement("span");
  status.className = "status-pill";
  status.textContent = historical ? (booking.status === "cancelled" ? "已取消" : "已结束") : "预约成功";
  side.append(status);
  if (!historical) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "cancel-button";
    cancel.textContent = "取消预约";
    cancel.addEventListener("click", () => askToCancel(booking));
    side.append(cancel);
  }
  card.append(main, side);
  return card;
}

function makeEmptyState(historical) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const icon = document.createElement("span");
  icon.className = "empty-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = historical ? "↶" : "▢";
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = historical ? "暂无历史预约" : "还没有预约";
  const hint = document.createElement("p");
  hint.textContent = historical ? "完成或取消的预约会保存在这里。" : "选择上方日期，再点击想要的时段即可预约。";
  copy.append(title, hint);
  empty.append(icon, copy);
  return empty;
}

function renderReservations(now) {
  const active = bookings
    .filter((booking) => booking.status === "active" && bookingEnd(booking) > now)
    .sort((a, b) => bookingStart(a) - bookingStart(b));
  const history = bookings
    .filter((booking) => booking.status === "cancelled" || bookingEnd(booking) <= now)
    .sort((a, b) => bookingStart(b) - bookingStart(a));

  activeCount.textContent = String(active.length);
  historyCount.textContent = String(history.length);
  activeList.replaceChildren(...(active.length ? active.map((booking) => makeReservationCard(booking, false)) : [makeEmptyState(false)]));
  historyList.replaceChildren(...(history.length ? history.map((booking) => makeReservationCard(booking, true)) : [makeEmptyState(true)]));
}

function askToCancel(booking) {
  const slot = SLOTS.find((item) => item.id === booking.slotId);
  pendingCancelId = booking.id;
  cancelDescription.textContent = `${longDateLabel(dateFromKey(booking.date))} ${slot.start} – ${slot.end}，深圳校区健身房 · 场地 1`;
  cancelDialog.returnValue = "";
  cancelDialog.showModal();
}

cancelDialog.addEventListener("close", () => {
  if (cancelDialog.returnValue !== "cancel" || !pendingCancelId) {
    pendingCancelId = null;
    return;
  }
  const saved = readBookings();
  if (saved) bookings = saved;
  const booking = bookings.find((item) => item.id === pendingCancelId && item.status === "active");
  pendingCancelId = null;
  if (!booking) {
    renderAll();
    showToast("这条预约已取消。");
    return;
  }
  booking.status = "cancelled";
  booking.cancelledAt = new Date().toISOString();
  const latestAvailability = readAvailability();
  if (latestAvailability && Object.keys(latestAvailability).length) availability = latestAvailability;
  if (!availability[booking.date]) availability[booking.date] = { remaining: 0, fullSlots: [] };
  availability[booking.date].remaining += 1;
  const persisted = saveBookings() && saveAvailability();
  renderAll();
  showToast(persisted ? "已取消预约，记录移至历史预约。" : "已取消，但浏览器未允许保存；刷新后可能恢复。");
});

function renderAll() {
  const now = new Date();
  ensureAvailabilityForWindow(now);
  renderDateTabs(now);
  renderSlots(now);
  renderReservations(now);
  newBookingId = null;
}

function scheduleMidnightRefresh() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 100);
  setTimeout(() => {
    renderAll();
    scheduleMidnightRefresh();
  }, nextMidnight - now);
}

function showSettingsError(message) {
  settingsError.textContent = message;
  settingsError.hidden = false;
}

function renderSlotSettings() {
  const day = settingsDraft[settingsDateSelect.value];
  slotSettings.replaceChildren();
  SLOTS.forEach((slot) => {
    const row = document.createElement("label");
    row.className = `slot-setting-row${day.fullSlots.has(slot.id) ? " is-full" : ""}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = day.fullSlots.has(slot.id);
    checkbox.setAttribute("aria-label", `${slot.start}至${slot.end}，设为已约`);
    const time = document.createElement("span");
    time.textContent = `${slot.start}–${slot.end}`;
    const status = document.createElement("strong");
    status.textContent = checkbox.checked ? "已约" : "未设满";
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) day.fullSlots.add(slot.id);
      else day.fullSlots.delete(slot.id);
      row.classList.toggle("is-full", checkbox.checked);
      status.textContent = checkbox.checked ? "已约" : "未设满";
    });
    row.append(checkbox, time, status);
    slotSettings.append(row);
  });
}

function openSettings() {
  const now = new Date();
  const dates = upcomingDates(now);
  ensureAvailabilityForWindow(now);
  settingsDraft = Object.fromEntries(dates.map((date) => {
    const key = dateKey(date);
    return [key, {
      remainingText: String(availability[key].remaining),
      fullSlots: new Set(availability[key].fullSlots),
    }];
  }));
  quotaSettings.replaceChildren();
  settingsDateSelect.replaceChildren();
  dates.forEach((date) => {
    const key = dateKey(date);
    const row = document.createElement("div");
    row.className = "quota-setting-row";
    const label = document.createElement("label");
    label.htmlFor = `quota-${key}`;
    label.textContent = `${weekdayLabel(date)} ${shortDateLabel(date)}`;
    const input = document.createElement("input");
    input.id = `quota-${key}`;
    input.type = "number";
    input.step = "1";
    input.inputMode = "numeric";
    input.value = settingsDraft[key].remainingText;
    input.addEventListener("input", () => {
      settingsDraft[key].remainingText = input.value;
      settingsError.hidden = true;
    });
    row.append(label, input);
    quotaSettings.append(row);

    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${longDateLabel(date)} ${weekdayLabel(date)}`;
    settingsDateSelect.append(option);
  });
  settingsDateSelect.value = settingsDraft[selectedDate] ? selectedDate : dateKey(dates[0]);
  renderSlotSettings();
  settingsError.hidden = true;
  settingsDialog.showModal();
  document.querySelector("#settings-title").focus();
}

settingsDateSelect.addEventListener("change", renderSlotSettings);
settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!settingsDraft) return;
  const currentKeys = upcomingDates(new Date()).map(dateKey);
  if (currentKeys.some((key) => !settingsDraft[key])) {
    showSettingsError("日期已经更新，请关闭设置后重新打开。");
    return;
  }
  for (const key of currentKeys) {
    const raw = settingsDraft[key].remainingText.trim();
    if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
      showSettingsError("剩余名额请输入整数，可以是负数。");
      document.querySelector(`#quota-${key}`).focus();
      return;
    }
  }
  currentKeys.forEach((key) => {
    availability[key] = {
      remaining: Number(settingsDraft[key].remainingText),
      fullSlots: [...settingsDraft[key].fullSlots],
    };
  });
  const persisted = saveAvailability();
  settingsDialog.close();
  renderAll();
  showToast(persisted ? "名额和时段状态已保存。" : "设置已显示，但浏览器未允许保存；刷新后可能丢失。");
});
settingsDialog.addEventListener("close", () => { settingsDraft = null; });
document.querySelector("#open-settings").addEventListener("click", openSettings);
document.querySelector("#settings-close").addEventListener("click", () => settingsDialog.close());
document.querySelector("#settings-cancel").addEventListener("click", () => settingsDialog.close());

document.querySelector("#go-bookings").addEventListener("click", () => {
  document.querySelector("#my-reservations").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#return-button").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
document.querySelector("#queue-button").addEventListener("click", () => {
  showToast("本地演示版暂不提供候补排队。");
});
document.querySelector("#logout-button").addEventListener("click", () => {
  showToast("本地演示版没有登录状态。");
});
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) bookings = readBookings() ?? bookings;
  else if (event.key === AVAILABILITY_KEY) availability = readAvailability() ?? availability;
  else return;
  renderAll();
});
window.addEventListener("focus", renderAll);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) renderAll();
});
setInterval(renderAll, 30_000);
scheduleMidnightRefresh();
renderAll();
