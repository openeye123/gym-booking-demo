import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as dates from "../booking-data.mjs";

const STORAGE_KEY = "sysu-gym-reservations-v1";
const AVAILABILITY_KEY = "sysu-gym-availability-v1";
const source = readFileSync(new URL("../app.mjs", import.meta.url), "utf8").replace(/^import\s*\{[\s\S]*?\}\s*from\s*"\.\/booking-data\.mjs";/, "");

class Element {
  dataset = {};
  children = [];
  listeners = {};
  hidden = false;
  checked = false;
  textContent = "";
  classList = { add() {}, remove() {}, toggle() {} };
  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { (this.listeners[name] ??= []).push(listener); }
  fire(name) { for (const listener of this.listeners[name] ?? []) listener({}); }
  showModal() { this.open = true; }
  close(value) { this.returnValue = value; this.open = false; this.fire("close"); }
  focus() {}
  scrollIntoView() {}
}

function setup(savedStorage) {
  const records = [
    { id: "past", date: "2000-01-01", slotId: "10:00", status: "active" },
    { id: "cancelled", date: "2099-01-01", slotId: "12:30", status: "cancelled" },
    { id: "keep", date: "2000-01-02", slotId: "14:00", status: "active" },
    { id: "active", date: "2099-01-02", slotId: "18:00", status: "active" },
  ];
  const storage = savedStorage ?? new Map([[STORAGE_KEY, JSON.stringify(records)]]);
  const elements = new Map();
  let failRead = false;
  let failWrite = false;
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const context = vm.createContext({
    ...dates, Date, Set, Math, Number, JSON, Object, String,
    document: { querySelector: element, createElement: () => new Element(), addEventListener() {} },
    window: { addEventListener() {} },
    localStorage: {
      getItem(key) { if (failRead) throw Error("blocked"); return storage.get(key) ?? null; },
      setItem(key, value) { if (failWrite) throw Error("quota"); storage.set(key, value); },
    },
    setTimeout() {}, clearTimeout() {}, setInterval() {},
  });
  vm.runInContext(source, context);
  return {
    storage, element,
    run: (code) => vm.runInContext(code, context),
    records: () => JSON.parse(storage.get(STORAGE_KEY)),
    confirm: () => element("#delete-history-dialog").close("delete"),
    failRead: () => { failRead = true; },
    failWrite: () => { failWrite = true; },
  };
}

test("single deletion persists, preserves other bookings and quotas after reload", () => {
  const app = setup();
  const quotas = app.storage.get(AVAILABILITY_KEY);
  app.run('askToDeleteHistory(["past"])');
  assert.match(app.element("#delete-history-description").textContent, /2000年1月1日/);
  app.confirm();
  assert.deepEqual(app.records().map((r) => r.id), ["cancelled", "keep", "active"]);
  assert.equal(app.storage.get(AVAILABILITY_KEY), quotas);
  assert.equal(app.run("readBookings().some(record => record.id === 'past')"), false);
  assert.equal(app.element("#history-count").textContent, "2");
  const reloaded = setup(app.storage);
  assert.equal(reloaded.element("#history-count").textContent, "2");
  assert.equal(reloaded.run("bookings.some(record => record.id === 'past')"), false);
});

test("keep and Escape dismiss without deleting; reopening resets confirmation", () => {
  const app = setup();
  const before = app.storage.get(STORAGE_KEY);
  for (const result of ["keep", ""]) {
    app.run('askToDeleteHistory(["past"])');
    app.element("#delete-history-dialog").close(result);
    assert.equal(app.storage.get(STORAGE_KEY), before);
  }
  app.run('askToDeleteHistory(["past"])');
  assert.equal(app.element("#delete-history-dialog").returnValue, "");
});

test("partial bulk deletion preserves unselected history and active booking", () => {
  const app = setup();
  app.element("#manage-history").fire("click");
  assert.equal(app.element("#history-toolbar").hidden, false);
  assert.equal(app.element("#delete-selected-history").disabled, true);
  app.run('selectedHistoryIds.add("past"); selectedHistoryIds.add("cancelled"); updateHistoryControls()');
  assert.equal(app.element("#select-all-history").indeterminate, true);
  app.element("#delete-selected-history").fire("click");
  assert.match(app.element("#delete-history-description").textContent, /2 条/);
  app.confirm();
  assert.deepEqual(app.records().map((r) => r.id), ["keep", "active"]);
  assert.equal(app.element("#delete-selected-history").disabled, true);
});

test("select all excludes active bookings and ends with empty history", () => {
  const app = setup();
  app.element("#manage-history").fire("click");
  app.element("#select-all-history").checked = true;
  app.element("#select-all-history").fire("change");
  assert.equal(app.element("#delete-selected-history").textContent, "删除所选（3）");
  app.element("#delete-selected-history").fire("click");
  app.confirm();
  assert.deepEqual(app.records().map((r) => r.id), ["active"]);
  assert.equal(app.element("#manage-history").hidden, true);
  assert.equal(app.element("#history-toolbar").hidden, true);
  assert.equal(app.element("#history-count").textContent, "0");
});

test("storage write failure retains persisted and displayed history", () => {
  const app = setup();
  const before = app.storage.get(STORAGE_KEY);
  app.run('askToDeleteHistory(["past"])');
  app.failWrite();
  app.confirm();
  assert.equal(app.storage.get(STORAGE_KEY), before);
  assert.equal(app.run("bookings.length"), 4);
  assert.match(app.element("#toast").textContent, /删除未保存/);
});

test("storage read failure does not overwrite records", () => {
  const app = setup();
  const before = app.storage.get(STORAGE_KEY);
  app.run('askToDeleteHistory(["past"])');
  app.failRead();
  app.confirm();
  assert.equal(app.storage.get(STORAGE_KEY), before);
  assert.match(app.element("#toast").textContent, /无法读取/);
});

test("confirmation re-reads storage and preserves newly added records", () => {
  const app = setup();
  app.run('askToDeleteHistory(["past"])');
  const latest = app.records();
  latest.push({ id: "other-tab", date: "2099-02-01", slotId: "10:00", status: "active" });
  app.storage.set(STORAGE_KEY, JSON.stringify(latest));
  app.confirm();
  assert.deepEqual(app.records().map((r) => r.id), ["cancelled", "keep", "active", "other-tab"]);
});

test("active records are protected both before and after confirmation opens", () => {
  const app = setup();
  app.run('askToDeleteHistory(["active"])');
  assert.notEqual(app.element("#delete-history-dialog").open, true);
  app.run('askToDeleteHistory(["cancelled"])');
  const latest = app.records();
  latest.find((r) => r.id === "cancelled").status = "active";
  app.storage.set(STORAGE_KEY, JSON.stringify(latest));
  app.confirm();
  assert.equal(app.records().length, 4);
  assert.match(app.element("#toast").textContent, /发生变化/);
});
