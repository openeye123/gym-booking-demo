export const SLOTS = Object.freeze([
  { id: "10:00", start: "10:00", end: "12:00" },
  { id: "12:30", start: "12:30", end: "14:00" },
  { id: "14:00", start: "14:00", end: "16:00" },
  { id: "16:00", start: "16:00", end: "18:00" },
  { id: "18:00", start: "18:00", end: "20:00" },
  { id: "20:00", start: "20:00", end: "22:00" },
]);

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function upcomingDates(now = new Date()) {
  return Array.from({ length: 3 }, (_, offset) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12)
  );
}

export function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function slotDateTime(key, time) {
  const [year, month, day] = key.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

export function weekdayLabel(date) {
  return WEEKDAYS[date.getDay()];
}

export function shortDateLabel(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function longDateLabel(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
