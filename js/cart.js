// Gemeinsamer Teller: Gerichte-Fahrt, Speisekarte, Seitenleiste und Bucher teilen diesen Stand.

const MAX_PER_DISH = 9;
const items = new Map(); // Name → { name, price, thumb, qty }
const meta = { day: "", time: "" };
const listeners = new Set();
let lastAdded = null;

function emit() { listeners.forEach((fn) => fn()); }

export const cart = {
  /** Menge um delta ändern (legt das Gericht bei Bedarf an). */
  change(name, price, thumb, delta) {
    const cur = items.get(name) || { name, price, thumb, qty: 0 };
    const qty = Math.max(0, Math.min(MAX_PER_DISH, cur.qty + delta));
    items.set(name, { ...cur, price: price ?? cur.price, thumb: thumb || cur.thumb, qty });
    lastAdded = delta > 0 ? name : null;
    emit();
  },
  qty: (name) => items.get(name)?.qty ?? 0,
  list: () => [...items.values()].filter((i) => i.qty > 0),
  count: () => cart.list().reduce((n, i) => n + i.qty, 0),
  total: () => cart.list().reduce((sum, i) => sum + i.qty * i.price, 0),
  lastAdded: () => lastAdded,
  meta: () => ({ ...meta }),
  setMeta(patch) { Object.assign(meta, patch); lastAdded = null; emit(); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
