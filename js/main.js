// Jambambo — Steuerung: Hero-Szene, Scroll-Sequenzen, Speisekarte, Reservierung.
import { initBooker } from "./booker.js";
import { initTray } from "./tray.js";
import { cart } from "./cart.js";

document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const desktop = window.matchMedia("(min-width: 52.01rem)");
const { gsap, ScrollTrigger } = window;
const hasGsap = Boolean(gsap && ScrollTrigger);
if (hasGsap) gsap.registerPlugin(ScrollTrigger);

// Ohne Probe-Kontext: iOS begrenzt WebGL-Kontexte. Fehler fängt der try/catch in initHeroScene.
const webglAvailable = () => "WebGLRenderingContext" in window;

/* ---------- Hero: Szene + „Alles kommt auf den Teller“ ---------- */
const heroProgress = { value: 0, scene: null };

// Synchron anlegen, damit die Pin-Reihenfolge (Hero vor Gerichte-Fahrt) stimmt
function initHeroScroll() {
  if (reducedMotion || !hasGsap) { document.documentElement.classList.add("no-hero-motion"); return; }
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: "[data-hero]",
      start: "top top",
      end: "+=140%",
      pin: true,
      scrub: 1,
      anticipatePin: 1,
      onUpdate: (self) => {
        heroProgress.value = self.progress;
        heroProgress.scene?.setProgress(self.progress);
      },
    },
  });
  tl.to("[data-hero-title] .line", { yPercent: -40, opacity: 0, stagger: 0.04, duration: 0.3 }, 0.05)
    .to("[data-hero-foot]", { y: 30, autoAlpha: 0, duration: 0.2 }, 0.05)
    .fromTo("[data-hero-promise]", { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.25 }, 0.62)
    .to({}, { duration: 0.13 });
}

async function initHeroScene() {
  const stage = document.querySelector("[data-hero-stage]");
  const canvas = document.querySelector("[data-hero-canvas]");
  if (!stage || !canvas || !webglAvailable()) { canvas?.remove(); return; }
  try {
    const { createHeroScene } = await import("./hero-scene.js");
    const scene = await createHeroScene({
      canvas,
      stage,
      titleEl: document.querySelector("[data-hero-title]"),
      still: reducedMotion,
      onPlateClick: () => document.getElementById("reservieren").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" }),
    });
    scene.setProgress(heroProgress.value);
    heroProgress.scene = scene;
    document.documentElement.classList.add("has-webgl");
  } catch (error) {
    // Szene ist optional: das statische Tellerbild bleibt stehen
    canvas.remove();
    console.warn("Hero-Szene nicht geladen:", error);
  }
}

/* ---------- Gerichte: horizontale Fahrt, Teller drehen sich ---------- */
function initRide() {
  if (reducedMotion || !hasGsap) return;
  const mm = gsap.matchMedia();
  mm.add("(min-width: 52.01rem)", () => {
    const track = document.querySelector("[data-ride-track]");
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
    const st = { trigger: "[data-ride]", start: "top top", end: () => `+=${distance() * 1.8}`, scrub: 1, invalidateOnRefresh: true };
    gsap.to(track, { x: () => -distance(), ease: "none", scrollTrigger: { ...st, pin: true, anticipatePin: 1 } });
  });
}

/* ---------- Drei Schritte: Bild wechselt mit dem Schritt ---------- */
function initSteps() {
  const steps = [...document.querySelectorAll("[data-step]")];
  const images = [...document.querySelectorAll("[data-steps-visual] img")];
  if (!steps.length) return;
  const activate = (i) => {
    steps.forEach((s, j) => s.classList.toggle("is-active", i === j));
    images.forEach((img, j) => img.classList.toggle("is-active", i === j));
  };
  activate(0);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) activate(steps.indexOf(e.target));
  }, { rootMargin: "-45% 0px -45% 0px" });
  steps.forEach((s) => io.observe(s));
}

/* ---------- Speisekarte: Tabs (WAI-ARIA) + Bild am Mauszeiger ---------- */
function initTabs() {
  const list = document.querySelector("[data-tabs]");
  if (!list) return;
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    }
    if (focus) tab.focus();
    if (hasGsap) ScrollTrigger.refresh();
  };
  list.addEventListener("click", (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) select(tab, false);
  });
  list.addEventListener("keydown", (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length], true);
  });
}

function initMenuPreview() {
  const preview = document.querySelector("[data-menu-preview]");
  if (!preview || reducedMotion || !window.matchMedia("(hover: hover)").matches) return;
  const pos = { x: 0, y: 0, tx: 0, ty: 0 };
  let raf = 0;
  const tick = () => {
    pos.x += (pos.tx - pos.x) * 0.16;
    pos.y += (pos.ty - pos.y) * 0.16;
    preview.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) rotate(${(pos.tx - pos.x) * 0.04}deg)`;
    raf = requestAnimationFrame(tick);
  };
  document.querySelector(".menu").addEventListener("pointermove", (e) => {
    const row = e.target.closest("li[data-preview]");
    pos.tx = e.clientX + 150;
    pos.ty = e.clientY;
    if (!row) { preview.classList.remove("is-on"); cancelAnimationFrame(raf); raf = 0; return; }
    if (!preview.classList.contains("is-on")) { pos.x = pos.tx; pos.y = pos.ty; }
    const src = row.dataset.preview;
    if (!preview.src.endsWith(src)) preview.src = src;
    preview.classList.add("is-on");
    if (!raf) raf = requestAnimationFrame(tick);
  });
  document.querySelector(".menu").addEventListener("pointerleave", () => {
    preview.classList.remove("is-on");
    cancelAnimationFrame(raf);
    raf = 0;
  });
}

/* ---------- Kopfzeile + mobiles Menü ---------- */
function initChrome() {
  const header = document.querySelector("[data-header]");
  const toggle = document.querySelector("[data-nav-toggle]");
  const links = document.getElementById("nav-links");
  let lastY = window.scrollY;

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    links.classList.toggle("is-open", open);
  };
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  links.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && links.classList.contains("is-open")) { setOpen(false); toggle.focus(); }
  });


  function update() {
    const y = window.scrollY;
    const pastHero = y > window.innerHeight * 0.9;
    header.classList.toggle("is-scrolled", y > 40);
    header.classList.toggle("is-hidden", pastHero && y > lastY + 4 && !links.classList.contains("is-open"));
    if (y < lastY - 4) header.classList.remove("is-hidden");
    lastY = y;
  }
  window.addEventListener("scroll", update, { passive: true });
  update();
}

/* ---------- v4: Band, Teller-Blende, Wörter, schwebende Zutaten ---------- */
function initEditorialMotion() {
  if (reducedMotion || !hasGsap) return;
  const band = document.querySelector("[data-band]");
  // Band: bleibt mittig stehen und läuft dabei ein Stück weiter – genug Zeit zum Lesen
  if (band) {
    gsap.fromTo(band, { xPercent: -4 }, {
      xPercent: -30, ease: "none",
      scrollTrigger: { trigger: band.parentElement, start: "center center", end: "+=90%", pin: true, scrub: 0.8, anticipatePin: 1 },
    });
  }
  // Teller-Blende: Abschnitt öffnet sich als wachsender Kreis – das Tellermotiv als Übergang
  // Mittelpunkt liegt 45 % Bildschirmhöhe unter der Abschnittskante: die runde Kante wächst sichtbar ins Bild
  document.querySelectorAll("[data-blende]").forEach((el) => {
    const centerY = () => window.innerHeight * 0.45;
    // Radius deckt den ganzen Abschnitt ab – auch sehr lange (Speisekarte auf dem Handy)
    const fullR = () => Math.hypot(window.innerWidth, Math.max(window.innerHeight, el.offsetHeight)) * 1.05;
    gsap.fromTo(el, { clipPath: () => `circle(0px at 50% ${centerY()}px)` }, {
      clipPath: () => `circle(${fullR()}px at 50% ${centerY()}px)`, ease: "none",
      scrollTrigger: {
        trigger: el, start: "top 92%", end: "top top", scrub: 0.6, invalidateOnRefresh: true,
        onLeave: () => gsap.set(el, { clipPath: "none" }),
        onEnterBack: () => gsap.set(el, { clipPath: `circle(${fullR()}px at 50% ${centerY()}px)` }),
      },
    });
  });
  // Konzept-Überschrift: Wort für Wort aus dem Papier
  document.querySelectorAll("[data-words]").forEach((h) => {
    h.querySelectorAll(".line").forEach((line) => {
      const target = line.querySelector("em") || line;
      const words = target.textContent.trim().split(/\s+/);
      target.replaceChildren(...words.flatMap((w, i) => {
        const span = document.createElement("span");
        span.className = "w";
        span.textContent = w;
        return i < words.length - 1 ? [span, document.createTextNode(" ")] : [span];
      }));
    });
    gsap.fromTo(h.querySelectorAll(".w"), { opacity: 0.12 }, {
      opacity: 1, stagger: 0.15, ease: "none",
      scrollTrigger: { trigger: h, start: "top 85%", end: "bottom 45%", scrub: true },
    });
  });
  // Zutaten an den Abschnittsgrenzen: eigene Geschwindigkeit, drehen sich
  document.querySelectorAll("[data-drift]").forEach((img) => {
    const amount = Number(img.dataset.drift);
    gsap.fromTo(img, { yPercent: amount * 2, rotate: -amount }, {
      yPercent: -amount * 2, rotate: amount * 2, ease: "none",
      scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: true },
    });
  });
}

/* ---------- Parallaxe + Einblenden ---------- */
function initParallax() {
  if (reducedMotion || !hasGsap) return;
  document.querySelectorAll("[data-parallax] img").forEach((img) => {
    gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: "none", scrollTrigger: { trigger: img.parentElement, scrub: true } });
  });
}

function initReveal() {
  if (reducedMotion) return;
  const targets = document.querySelectorAll(".steps__title, .menu__head, .reserve__head, .bstep, .voice, .more h2, .offer, .visit__info > *");
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  targets.forEach((el, i) => {
    el.setAttribute("data-reveal", "");
    el.style.transitionDelay = `${(i % 3) * 90}ms`;
    io.observe(el);
  });
}

initHeroScroll();
initChrome();
initTabs();
initMenuPreview();
initSteps();
initReveal();
const booker = initBooker(document.querySelector("[data-booker]"));
initTray({
  goToBooking: () => {
    const { day, time } = cart.meta();
    booker?.goto(!cart.count() ? 1 : !day ? 2 : !time ? 3 : 4, false);
    document.getElementById("reservieren").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  },
});
initRide();
initEditorialMotion();
initParallax();
initHeroScene();
desktop.addEventListener("change", () => hasGsap && ScrollTrigger.refresh());
