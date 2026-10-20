// Hero-Szene: Teller (Logo) in 3D, freigestellte Zutaten schweben, weichen der Maus aus
// und landen beim Scrollen auf ihrem Viertel des Tellers. Scroll schreibt nur `progress`.
import * as THREE from "../vendor/three.module.min.js";

const PRODUCE = {
  // Viertel im Logo: green = Gemüse, earth = Getreide/Knollen, sun = Eiweiß/Pilze, fruit = Obst
  green: ["cabbage", "broccoli", "spinach", "okra", "mint"],
  earth: ["plantain", "yam", "rice", "cassava", "cocoyam", "coconut", "ginger"],
  sun: ["mushroom", "peanuts"],
  fruit: ["avocado", "papaya", "pomegranate", "onion", "tomatoes", "chili", "hibiscus", "mango", "beetroot", "lime"],
};
const MOBILE_SKIP = new Set(["cocoyam", "ginger", "onion", "lime", "mint", "cassava", "beetroot", "coconut"]);
// Winkelbereiche der Logo-Viertel in Grad (0° = rechts, gegen den Uhrzeigersinn)
const SECTORS = { green: [105, 200], earth: [18, 78], sun: [-78, -18], fruit: [212, 258] };

const FOV = 30;
const CAMERA_Z = 14;
const PLATE_THICKNESS = 0.16;
const LOGO_FILL = 0.86;
const REPEL_RADIUS = 1.7;
const REPEL_FORCE = 0.055;
const SPRING = 0.045;
const DAMPING = 0.88;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rand = (seed) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Bild fehlt: ${src}`));
    img.src = src;
  });
}

// Tellerfläche: cremeweißer Rand mit feiner Linie, Logo in der Mitte
function plateTexture(logo) {
  const size = 2048;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#fbf8f1";
  g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(30, 60, 40, 0.12)";
  g.lineWidth = 3;
  g.beginPath(); g.arc(size / 2, size / 2, size * 0.465, 0, Math.PI * 2); g.stroke();
  const d = size * LOGO_FILL;
  g.drawImage(logo, (size - d) / 2, (size - d) / 2, d, d);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export async function createHeroScene({ canvas, stage, titleEl, onPlateClick, still = false }) {
  const isMobile = () => stage.clientWidth < 832;
  const names = Object.entries(PRODUCE).flatMap(([group, list]) => list.map((name) => ({ name, group })));
  const [logo, ...images] = await Promise.all([
    loadImage("img/logo-1100.webp"),
    ...names.map((n) => loadImage(`img/produce/${n.name}.webp`)),
  ]);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  scene.add(new THREE.HemisphereLight(0xfffaf0, 0xd8d2c0, 1.6));
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
  sunLight.position.set(-4, 6, 8);
  scene.add(sunLight);

  // Teller
  const plate = new THREE.Group();
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.32, metalness: 0 });
  const faceMat = new THREE.MeshStandardMaterial({ map: plateTexture(logo), roughness: 0.55 });
  const plateMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.9, PLATE_THICKNESS, 128), [rimMat, faceMat, rimMat]);
  plateMesh.rotation.x = Math.PI / 2;
  plateMesh.rotation.y = Math.PI / 2; // Logo aufrecht
  plate.add(plateMesh);
  scene.add(plate);

  // Zutaten
  const rnd = rand(7);
  const items = names.map((n, i) => {
    const img = images[i];
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    const aspect = img.width / img.height;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(aspect >= 1 ? 1 : aspect, aspect >= 1 ? 1 / aspect : 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    scene.add(mesh);
    const [a0, a1] = SECTORS[n.group];
    return {
      ...n, mesh,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), home: new THREE.Vector3(),
      phase: rnd() * Math.PI * 2, spin: (rnd() - 0.5) * 0.25, baseRot: (rnd() - 0.5) * 1.4,
      size: 0.8 + rnd() * 0.5,
      land: { angle: THREE.MathUtils.degToRad(lerp(a0, a1, rnd())), r: lerp(0.18, 0.5, rnd()), rot: (rnd() - 0.5) * 0.8 },
      delay: rnd() * 0.18,
    };
  });

  // Layout, aus Bühnengröße abgeleitet
  const view = { w: 1, h: 1, plateX: 0, plateY: 0, plateR: 1 };
  function layout() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    view.h = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAMERA_Z;
    view.w = view.h * camera.aspect;
    const mobile = isMobile();
    view.plateX = mobile ? 0 : view.w * 0.2;
    view.plateY = mobile ? view.h * 0.17 : -view.h * 0.02;
    view.plateR = mobile ? Math.min(view.w * 0.3, view.h * 0.15) : Math.min(view.h * 0.26, view.w * 0.19);
    const hr = rand(11);
    const visible = items.filter((it) => !(mobile && MOBILE_SKIP.has(it.name)));
    items.forEach((it) => { it.mesh.visible = visible.includes(it); });
    visible.forEach((it, i) => {
      const angle = (i / visible.length) * Math.PI * 2 + hr() * 0.4;
      const z = lerp(-3, 2.4, hr());
      const spread = (CAMERA_Z - z) / CAMERA_Z; // weiter hinten = mehr Fläche sichtbar
      const rx = lerp(view.plateR * 1.45, view.w * 0.5, 0.35 + hr() * 0.6) * spread;
      const ry = lerp(view.plateR * 1.35, view.h * 0.48, 0.35 + hr() * 0.6) * spread;
      let x = view.plateX * spread + Math.cos(angle) * rx;
      let y = view.plateY * spread + Math.sin(angle) * ry;
      // Überschrift (links) und Navigation (oben) frei halten
      const titleRight = titleEl ? titleEl.getBoundingClientRect().right / w : 0.47;
      const titleEdge = ((titleRight + 0.02) * 2 - 1) * (view.w / 2) * spread;
      const half = view.plateR * 0.3 * it.size; // halbe Zutatenbreite
      if (!mobile && x - half < titleEdge) x = Math.min(view.w * 0.47 * spread, Math.max(titleEdge + half, view.plateX * spread + (view.plateX * spread - x) * 0.8));
      y = Math.min(y, view.h * 0.3 * spread);
      if (mobile) y = Math.max(y, -view.h * 0.02 * spread); // unten liegt der Titel
      it.home.set(x, y, z);
      it.scale = view.plateR * (mobile ? 0.5 : 0.44) * it.size;
      if (it.pos.lengthSq() === 0) it.pos.copy(it.home);
    });
  }

  // Zeiger
  const pointer = { ndc: new THREE.Vector2(9, 9), prev: new THREE.Vector2(9, 9), active: false };
  const raycaster = new THREE.Raycaster();
  const ray = new THREE.Vector3();
  function pointerAtDepth(z, out) {
    ray.set(pointer.ndc.x, pointer.ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
    const t = (z - camera.position.z) / ray.z;
    return out.copy(camera.position).addScaledVector(ray, t);
  }
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    pointer.active = true;
  };
  const onLeave = () => { pointer.active = false; pointer.ndc.set(9, 9); };
  let hoverPlate = false;
  // Tippen ohne vorheriges pointermove (Touch): sofort prüfen
  const onClick = (e) => {
    onMove(e);
    raycaster.setFromCamera(pointer.ndc, camera);
    if (raycaster.intersectObject(plateMesh).length > 0) onPlateClick();
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);

  let progress = 0;
  const anchor = new THREE.Vector3();
  const local = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const target = new THREE.Vector3();
  const pull = new THREE.Vector3();
  let time = 0;

  function step(dt) {
    time += dt;
    const p = progress;
    const converge = easeInOut(clamp01((p - 0.05) / 0.6));

    // Teller: kippt zur Kamera, wandert zur Mitte
    const px = lerp(view.plateX, 0, converge);
    const py = lerp(view.plateY, isMobile() ? view.h * 0.1 : view.h * 0.1, converge);
    const pr = lerp(view.plateR, view.plateR * (isMobile() ? 1.2 : 1.02), converge);
    const tiltX = lerp(-0.55, -0.12, converge) + (pointer.active ? -pointer.ndc.y * 0.08 : 0);
    const tiltY = pointer.active ? pointer.ndc.x * 0.12 * (1 - converge) : Math.sin(time * 0.4) * 0.04;
    plate.position.set(px, py, 0);
    plate.scale.setScalar(lerp(plate.scale.x || pr, pr * (hoverPlate ? 1.03 : 1), 0.12));
    plate.rotation.x = lerp(plate.rotation.x, tiltX, 0.08);
    plate.rotation.y = lerp(plate.rotation.y, tiltY, 0.08);
    plate.rotation.z = Math.sin(time * 0.25) * 0.03;
    plate.updateMatrixWorld();

    // Teller-Hover
    raycaster.setFromCamera(pointer.ndc, camera);
    hoverPlate = pointer.active && raycaster.intersectObject(plateMesh).length > 0;
    canvas.style.cursor = hoverPlate ? "pointer" : "";

    const mouseSpeed = pointer.ndc.distanceTo(pointer.prev);
    pointer.prev.copy(pointer.ndc);

    for (const it of items) {
      if (!it.mesh.visible) continue;
      const e = easeInOut(clamp01((p - 0.05 - it.delay) / 0.5));
      // Landeplatz auf dem Teller (Tellerkoordinaten → Welt)
      local.set(Math.cos(it.land.angle) * it.land.r, Math.sin(it.land.angle) * it.land.r, PLATE_THICKNESS / 2 + 0.02 + it.delay * 0.4);
      anchor.copy(local).applyMatrix4(plate.matrixWorld);
      // Schweben
      const fx = Math.sin(time * 0.6 + it.phase) * 0.12;
      const fy = Math.cos(time * 0.5 + it.phase) * 0.16;
      target.set(it.home.x + fx, it.home.y + fy, it.home.z).lerp(anchor, e);
      // Maus stößt weg
      if (pointer.active && e < 0.9) {
        pointerAtDepth(it.pos.z, hit);
        const dx = it.pos.x - hit.x;
        const dy = it.pos.y - hit.y;
        const dist = Math.hypot(dx, dy);
        if (dist < REPEL_RADIUS && dist > 0.001) {
          const f = (1 - dist / REPEL_RADIUS) ** 2 * (REPEL_FORCE + mouseSpeed * 0.9) * (1 - e);
          it.vel.x += (dx / dist) * f;
          it.vel.y += (dy / dist) * f;
          it.vel.z += f * 0.4;
        }
      }
      const k = lerp(SPRING, 0.2, e);
      it.vel.addScaledVector(pull.copy(target).sub(it.pos), k);
      it.vel.multiplyScalar(DAMPING);
      it.pos.add(it.vel);
      it.mesh.position.copy(it.pos);
      const s = lerp(it.scale, pr * 0.24 * it.size, e);
      it.mesh.scale.setScalar(s);
      const idleRot = it.baseRot + Math.sin(time * 0.3 + it.phase) * 0.2 + it.vel.x * 2;
      it.mesh.rotation.z = lerp(idleRot, it.land.rot, e);
      it.mesh.rotation.x = lerp(0, plate.rotation.x * 0.6, e);
    }
    renderer.render(scene, camera);
  }

  // Schleife nur, solange der Hero sichtbar ist
  let raf = 0;
  let last = performance.now();
  let running = false;
  const loop = (now) => {
    step(Math.min(0.05, (now - last) / 1000));
    last = now;
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  // Reduzierte Bewegung: ein ruhiges Standbild, kein Schweben
  const io = new IntersectionObserver(([entry]) => (entry.isIntersecting && !still ? start() : stop()));
  io.observe(stage);
  const ro = new ResizeObserver(() => { layout(); if (still) for (let i = 0; i < 60; i++) step(0); });
  ro.observe(stage);
  layout();
  for (let i = 0; i < (still ? 60 : 1); i++) step(0);

  return {
    setProgress(v) { progress = v; },
    relayout() { layout(); },
    destroy() {
      stop(); io.disconnect(); ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      items.forEach((it) => { it.mesh.geometry.dispose(); it.mesh.material.map.dispose(); it.mesh.material.dispose(); });
      renderer.dispose();
    },
  };
}
