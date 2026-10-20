// „Dein Teller“: Hinzufügen an jedem Gericht, Pille unten rechts, Seitenleiste (Vorbild: sweetgreen).
import { cart } from "./cart.js";

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const priceOf = (text) => Number((text.match(/\d+(?:,\d+)?/) || ["0"])[0].replace(",", "."));
const thumbFrom = (img) => img?.getAttribute("src")?.replace("-900.", "-480.") || "";
const STACK_MAX = 3;
// Ohne Auswahl zeigt die Pille drei Gerichte als Appetit-Anreiz
const TEASER = ["ndole", "jollof", "kokki"].map((k) => ({ thumb: `img/dishes/${k}-480.webp` }));
const TOAST_MS = 1800;

function addButton(label, extraClass) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `add ${extraClass}`;
  b.setAttribute("aria-label", label);
  b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg><span class="add__n"></span>';
  return b;
}

/** Hinzufügen-Knöpfe an Gerichte-Fahrt und Speisekarte anbringen. */
function injectAddButtons() {
  const targets = [];
  document.querySelectorAll(".dish-card").forEach((card) => {
    const name = card.querySelector("h3").textContent.trim();
    const btn = addButton(`${name} zum Teller hinzufügen`, "add--card");
    card.querySelector(".dish-card__text").append(btn);
    targets.push({ btn, name, price: priceOf(card.querySelector(".price").textContent), thumb: thumbFrom(card.querySelector("img")) });
  });
  document.querySelectorAll(".dishes li").forEach((li) => {
    const priceEl = li.querySelector(".price");
    if (!priceEl || !/\d/.test(priceEl.textContent)) return;
    const h3 = li.querySelector("h3");
    const name = [...h3.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").trim();
    const btn = addButton(`${name} zum Teller hinzufügen`, "add--row");
    li.append(btn);
    targets.push({ btn, name, price: priceOf(priceEl.textContent), thumb: thumbFrom(li.querySelector("img")) });
  });
  targets.forEach(({ btn, name, price, thumb }) => {
    btn.addEventListener("click", () => cart.change(name, price, thumb, 1));
  });
  cart.subscribe(() => targets.forEach(({ btn, name }) => {
    const q = cart.qty(name);
    btn.classList.toggle("is-in", q > 0);
    btn.querySelector(".add__n").textContent = q > 0 ? String(q) : "";
  }));
}

export function initTray({ goToBooking }) {
  injectAddButtons();
  const pill = document.querySelector("[data-tray-pill]");
  const drawer = document.querySelector("[data-tray]");
  const overlay = document.querySelector("[data-tray-overlay]");
  if (!pill || !drawer) return;
  const els = {
    stack: pill.querySelector("[data-tray-stack]"),
    title: pill.querySelector("[data-tray-title]"),
    sub: pill.querySelector("[data-tray-sub]"),
    when: drawer.querySelector("[data-tray-when]"),
    list: drawer.querySelector("[data-tray-list]"),
    total: drawer.querySelector("[data-tray-total]"),
    close: drawer.querySelector("[data-tray-close]"),
    go: drawer.querySelector("[data-tray-go]"),
  };
  let toastTimer = 0;

  function renderPill(withToast = true) {
    const items = cart.list();
    const count = cart.count();
    els.stack.replaceChildren(...(items.length ? items : TEASER).slice(0, STACK_MAX).map((i) => Object.assign(document.createElement("img"), { src: i.thumb, alt: "", width: 80, height: 80 })));
    pill.classList.toggle("has-items", count > 0);
    const added = withToast ? cart.lastAdded() : null;
    if (added) {
      els.title.textContent = `${added} ist auf deinem Teller`;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => renderPill(false), TOAST_MS);
      pill.classList.remove("is-bump"); void pill.offsetWidth; pill.classList.add("is-bump");
    } else {
      els.title.textContent = count ? "Dein Teller" : "Teller reservieren";
    }
    els.sub.textContent = count ? `${count} ${count === 1 ? "Gericht" : "Gerichte"} · ${euro.format(cart.total())}` : "";
  }

  function renderDrawer() {
    const { day, time } = cart.meta();
    els.when.textContent = day
      ? `${new Date(`${day}T00:00`).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}${time ? ` um ${time}` : ""}`
      : "Tag und Uhrzeit wählen";
    const items = cart.list();
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "tray__empty";
      li.textContent = "Noch leer – füge Gerichte aus der Karte hinzu.";
      els.list.replaceChildren(li);
    } else {
      els.list.replaceChildren(...items.map((i) => {
        const li = document.createElement("li");
        const img = Object.assign(document.createElement("img"), { src: i.thumb, alt: "", width: 120, height: 120 });
        const text = document.createElement("div");
        const h = document.createElement("h4"); h.textContent = i.name;
        const p = document.createElement("span"); p.textContent = euro.format(i.price);
        text.append(h, p);
        const qty = document.createElement("div");
        qty.className = "qty";
        const minus = Object.assign(document.createElement("button"), { type: "button", textContent: "−" });
        minus.setAttribute("aria-label", `Eins weniger: ${i.name}`);
        minus.addEventListener("click", () => cart.change(i.name, i.price, i.thumb, -1));
        const out = Object.assign(document.createElement("output"), { textContent: String(i.qty) });
        const plus = Object.assign(document.createElement("button"), { type: "button", textContent: "+" });
        plus.setAttribute("aria-label", `Eins mehr: ${i.name}`);
        plus.addEventListener("click", () => cart.change(i.name, i.price, i.thumb, 1));
        qty.append(minus, out, plus);
        li.append(img, text, qty);
        return li;
      }));
    }
    els.total.textContent = euro.format(cart.total());
  }

  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    renderDrawer();
    document.documentElement.classList.add("tray-open");
    drawer.hidden = false;
    overlay.hidden = false;
    requestAnimationFrame(() => { drawer.classList.add("is-open"); overlay.classList.add("is-open"); els.close.focus(); });
  }
  function close() {
    drawer.classList.remove("is-open");
    overlay.classList.remove("is-open");
    document.documentElement.classList.remove("tray-open");
    setTimeout(() => { drawer.hidden = true; overlay.hidden = true; }, 450);
    lastFocus?.focus?.();
  }
  pill.addEventListener("click", open);
  els.close.addEventListener("click", close);
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("is-open")) close(); });
  drawer.querySelector("[data-tray-when-btn]").addEventListener("click", () => { close(); goToBooking(); });
  els.go.addEventListener("click", () => { close(); goToBooking(); });

  cart.subscribe(() => { renderPill(); if (drawer.classList.contains("is-open")) renderDrawer(); });
  renderPill(false);

  // Sichtbar ab dem ersten Abschnitt, nicht über dem Bucher und der Fußzeile
  const hideZones = [document.getElementById("reservieren"), document.querySelector(".site-footer")];
  const inView = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? inView.add(e.target) : inView.delete(e.target)));
    update();
  }, { threshold: 0.05 });
  hideZones.forEach((z) => z && io.observe(z));
  function update() {
    pill.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.8 && inView.size === 0);
  }
  window.addEventListener("scroll", update, { passive: true });
  update();
}
