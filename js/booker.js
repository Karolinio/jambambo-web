// Gericht-Bucher: Teller, Tag, Ankunft, Personen → Küchenbon → WhatsApp oder E-Mail.
// Kein Server: erst das Absenden in WhatsApp/E-Mail übermittelt etwas.

import { cart } from "./cart.js";

const WHATSAPP_NUMBER = "4915219276190";
const RESERVATION_MAIL = "reservations@jambambo.com.de";
const DAYS_AHEAD = 14;
const SLOT_MINUTES = 30;
const LEAD_MINUTES = 45; // so früh muss die Küche Bescheid wissen
const LAST_ARRIVAL_BEFORE_CLOSE = 60;
const MAX_GUESTS_ONLINE = 19;
// Öffnungszeiten je Wochentag (0 = Sonntag): [öffnet, schließt] in Minuten
const OPENING = {
  0: [12 * 60, 22 * 60], 6: [12 * 60, 22 * 60],
  1: [17 * 60, 22 * 60], 2: [17 * 60, 22 * 60], 3: [17 * 60, 22 * 60], 4: [17 * 60, 22 * 60], 5: [17 * 60, 22 * 60],
};

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (iso) => new Date(`${iso}T00:00`);

function slotsFor(iso, now = new Date()) {
  const date = parseDay(iso);
  const [open, close] = OPENING[date.getDay()];
  const earliest = iso === isoDay(now) ? now.getHours() * 60 + now.getMinutes() + LEAD_MINUTES : 0;
  const slots = [];
  for (let t = open; t <= close - LAST_ARRIVAL_BEFORE_CLOSE; t += SLOT_MINUTES) slots.push({ t, disabled: t < earliest });
  return slots;
}

function renderDays(root) {
  const now = new Date();
  const frag = document.createDocumentFragment();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = isoDay(d);
    const label = document.createElement("label");
    label.className = "day";
    const input = Object.assign(document.createElement("input"), { type: "radio", name: "day", value: iso });
    input.disabled = slotsFor(iso, now).every((s) => s.disabled);
    const face = document.createElement("span");
    const wd = document.createElement("b");
    wd.textContent = i === 0 ? "Heute" : d.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
    const num = document.createElement("strong");
    num.textContent = String(d.getDate());
    const mon = document.createElement("small");
    mon.textContent = d.toLocaleDateString("de-DE", { month: "short" }).replace(".", "");
    face.append(wd, num, mon);
    label.setAttribute("aria-label", d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }));
    label.append(input, face);
    frag.append(label);
  }
  root.replaceChildren(frag);
}

function renderSlots(root, iso, selected) {
  if (!iso) { root.replaceChildren(); return; }
  const frag = document.createDocumentFragment();
  for (const { t, disabled } of slotsFor(iso)) {
    const label = document.createElement("label");
    label.className = "slot";
    const input = Object.assign(document.createElement("input"), { type: "radio", name: "time", value: hhmm(t), disabled });
    input.checked = !disabled && selected === hhmm(t);
    const face = document.createElement("span");
    face.textContent = hhmm(t);
    label.append(input, face);
    frag.append(label);
  }
  root.replaceChildren(frag);
}

function buildMessage(state) {
  const day = parseDay(state.day).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  const lines = [
    "Hallo Jambambo, ich möchte einen Teller reservieren:",
    `Name: ${state.name}`,
    `Ankunft: ${day}, ${state.time} Uhr`,
    `Personen: ${state.adults} Erwachsene${state.kids ? `, ${state.kids} Kinder` : ""}`,
  ];
  const items = cart.list();
  lines.push(items.length ? `Gerichte: ${items.map((i) => `${i.qty}× ${i.name}`).join(", ")}` : "Gerichte: entscheide ich vor Ort");
  if (state.note) lines.push(`Anmerkung: ${state.note}`);
  return lines.join("\n");
}

export function initBooker(form) {
  if (!form) return;
  const els = {
    days: form.querySelector("[data-days]"),
    slots: form.querySelector("[data-slots]"),
    when: form.querySelector("[data-bon-when]"),
    guests: form.querySelector("[data-bon-guests]"),
    name: form.querySelector("[data-bon-name]"),
    items: form.querySelector("[data-bon-items]"),
    total: form.querySelector("[data-bon-total]"),
    bon: form.querySelector(".summary"),
    status: form.querySelector("[data-reserve-status]"),
  };
  const state = { day: "", time: "", adults: 2, kids: 0, name: "", note: "" };
  const picks = [...form.querySelectorAll(".plate-pick")];

  const setError = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg || ""; };

  function renderBon() {
    els.when.textContent = state.day
      ? `${parseDay(state.day).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}${state.time ? ` · ${state.time}` : ""}`
      : "–";
    els.guests.textContent = `${state.adults} Erwachsene${state.kids ? ` · ${state.kids} Kinder` : ""}`;
    els.name.textContent = state.name || "–";
    const items = cart.list();
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "summary__empty";
      li.textContent = "Noch kein Gericht gewählt";
      els.items.replaceChildren(li);
    } else {
      els.items.replaceChildren(...items.map(({ name: n, qty: q, price, thumb }) => {
        const li = document.createElement("li");
        const img = Object.assign(document.createElement("img"), { src: thumb, alt: "", width: 120, height: 120 });
        const s = document.createElement("span");
        const b = document.createElement("b"); b.textContent = `${q}× `;
        s.append(b, n);
        const p = document.createElement("span"); p.textContent = euro.format(q * price);
        li.append(img, s, p);
        return li;
      }));
    }
    els.total.textContent = euro.format(cart.total());
    els.bon.classList.remove("is-bump");
    void els.bon.offsetWidth; // Animation neu starten
    els.bon.classList.add("is-bump");
  }

  // Teller-Karten spiegeln den gemeinsamen Stand
  function syncPicks() {
    picks.forEach((li) => {
      const q = cart.qty(li.dataset.dish);
      li.querySelector("output").textContent = String(q);
      li.querySelector('[data-qty="-1"]').disabled = q === 0;
      li.dataset.count = String(q);
      li.classList.toggle("is-picked", q > 0);
    });
  }
  picks.forEach((li) => {
    const thumb = li.querySelector("img").getAttribute("src");
    li.querySelectorAll("[data-qty]").forEach((b) => b.addEventListener("click", () => cart.change(li.dataset.dish, Number(li.dataset.price), thumb, Number(b.dataset.qty))));
  });
  cart.subscribe(() => { syncPicks(); renderBon(); });
  syncPicks();

  form.querySelectorAll("[data-stepper]").forEach((box) => {
    const key = box.dataset.stepper;
    const min = key === "adults" ? 1 : 0;
    const out = box.querySelector("output");
    const update = () => {
      out.textContent = String(state[key]);
      box.querySelector('[data-step="-1"]').disabled = state[key] <= min;
      box.querySelector('[data-step="1"]').disabled = state.adults + state.kids >= MAX_GUESTS_ONLINE;
    };
    box.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
      state[key] = Math.max(min, state[key] + Number(b.dataset.step));
      form.querySelectorAll("[data-stepper]").forEach((x) => x.dispatchEvent(new Event("sync")));
      renderBon();
    }));
    box.addEventListener("sync", update);
    update();
  });

  // Schritt für Schritt: ein Panel sichtbar, Navigation zeigt Fortschritt
  const panels = [...form.querySelectorAll("[data-panel]")];
  const navButtons = [...form.querySelectorAll("[data-goto]")];
  const prev = form.querySelector("[data-prev]");
  const next = form.querySelector("[data-next]");
  let step = 1;
  const done = () => ({
    1: cart.count() > 0,
    2: Boolean(state.day),
    3: Boolean(state.time),
    4: state.name.length >= 2,
  });
  function goto(n, focus = true) {
    step = Math.max(1, Math.min(4, n));
    panels.forEach((p) => { p.hidden = Number(p.dataset.panel) !== step; });
    const d = done();
    navButtons.forEach((b) => {
      const k = Number(b.dataset.goto);
      if (k === step) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      b.classList.toggle("is-done", k !== step && d[k]);
    });
    prev.hidden = step === 1;
    next.hidden = step === 4;
    if (focus) panels[step - 1].querySelector("input:not(:disabled), button")?.focus({ preventScroll: true });
  }
  navButtons.forEach((b) => b.addEventListener("click", () => goto(Number(b.dataset.goto))));
  prev.addEventListener("click", () => goto(step - 1));
  next.addEventListener("click", () => goto(step + 1));
  goto(1, false);

  renderDays(els.days);
  form.addEventListener("change", (e) => {
    if (e.target.name === "day") {
      state.day = e.target.value;
      if (state.time && slotsFor(state.day).find((s) => hhmm(s.t) === state.time)?.disabled !== false) state.time = "";
      renderSlots(els.slots, state.day, state.time);
      setError("b-day-err", "");
      cart.setMeta({ day: state.day, time: state.time });
      setTimeout(() => goto(3), 250);
    }
    if (e.target.name === "time") { state.time = e.target.value; setError("b-time-err", ""); cart.setMeta({ day: state.day, time: state.time }); setTimeout(() => goto(4), 250); }
  });
  form.addEventListener("input", (e) => {
    if (e.target.name === "name") { state.name = e.target.value.trim(); setError("b-name-err", ""); e.target.removeAttribute("aria-invalid"); renderBon(); }
    if (e.target.name === "note") state.note = e.target.value.trim();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const errors = [];
    if (!state.day) { setError("b-day-err", "Bitte wähle einen Tag."); errors.push(els.days.querySelector("input:not(:disabled)")); }
    if (!state.time) { setError("b-time-err", "Bitte wähle deine Ankunftszeit."); errors.push(els.slots.querySelector("input:not(:disabled)") || els.days); }
    if (state.name.length < 2) {
      setError("b-name-err", "Bitte gib deinen Namen an.");
      form.elements.name.setAttribute("aria-invalid", "true");
      errors.push(form.elements.name);
    }
    if (errors.length) {
      goto(!state.day ? 2 : !state.time ? 3 : 4, false);
      els.status.className = "reserve__status is-error";
      els.status.textContent = "Bitte ergänze die markierten Angaben.";
      errors[0]?.focus();
      return;
    }
    const text = buildMessage(state);
    const viaMail = e.submitter?.dataset.channel === "mail";
    els.status.className = "reserve__status";
    els.status.textContent = viaMail ? "Dein E-Mail-Programm öffnet sich – einfach absenden." : "WhatsApp öffnet sich – einfach absenden.";
    if (viaMail) {
      window.location.href = `mailto:${RESERVATION_MAIL}?subject=${encodeURIComponent(`Teller reservieren ${state.day} ${state.time}`)}&body=${encodeURIComponent(text)}`;
    } else {
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    }
  });
  renderBon();
  return { goto };
}
