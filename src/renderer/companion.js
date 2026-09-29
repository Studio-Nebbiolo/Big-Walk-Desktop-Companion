// 작업표시줄 바로 위에 놓인 투명 창. 캐릭터가 없는 곳은 마우스가 통과한다.
(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const api = window.companion;

  let settings = null;
  let chars = [];
  let W = 0;
  let H = 0;
  let paused = false;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const groundY = () => H;

  function applySettings(next) {
    settings = next;
    paused = !!next.paused;
    const byId = new Map(chars.map((c) => [c.cfg.id, c]));
    chars = next.characters.map((cfg, i) => {
      const existing = byId.get(cfg.id);
      if (existing) {
        existing.cfg = cfg;
        existing.globalSize = next.size;
        return existing;
      }
      const c = new Character(cfg, {
        x: (W / (next.characters.length + 1)) * (i + 1) + (Math.random() - 0.5) * 60,
        h: H * 0.6, // 새로 추가된 친구는 위에서 떨어진다
      });
      c.globalSize = next.size;
      c.state = 'air';
      c.afterLand = 'wave';
      return c;
    });
  }

  // --- 마우스 ---------------------------------------------------------------
  let ignoring = true;
  let hover = null;
  let drag = null; // { char, startX, startY, offX, offY, moved, samples }
  let mouse = null;

  function setIgnore(v) {
    if (v === ignoring) return;
    ignoring = v;
    api.setIgnoreMouse(v);
  }

  function pick(x, y) {
    for (let i = chars.length - 1; i >= 0; i--) {
      if (chars[i].hitTest(x, y, groundY())) return chars[i];
    }
    return null;
  }

  function updateHover(x, y) {
    mouse = { x, y };
    hover = pick(x, y);
    setIgnore(!hover);
    canvas.style.cursor = hover ? 'grab' : 'default';
  }

  const onMove = (e) => {
    mouse = { x: e.clientX, y: e.clientY };
    if (drag) {
      const d = drag;
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4 && !d.moved) {
        d.moved = true;
        d.char.grab();
      }
      if (d.moved) {
        d.char.x = e.clientX - d.offX;
        d.char.h = Math.max(0, Math.min(H - d.char.height - 24 * d.char.scale, groundY() - e.clientY - d.offY));
        d.samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        if (d.samples.length > 6) d.samples.shift();
      }
      return;
    }
    updateHover(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('mousemove', onMove);

  // 클릭 통과 상태에서는 mousemove 가 오지 않는 플랫폼이 있어 메인 프로세스가 커서 위치를 알려준다.
  api.onCursor((p) => {
    if (drag) return;
    if (!p) {
      if (mouse && ignoring) {
        mouse = null;
        hover = null;
      }
      return;
    }
    updateHover(p.x, p.y);
  });

  canvas.addEventListener('pointerleave', () => {
    if (drag) return;
    mouse = null;
    hover = null;
    setIgnore(true);
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const c = pick(e.clientX, e.clientY);
    if (!c) return;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    drag = {
      char: c,
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - c.x,
      offY: groundY() - e.clientY - c.h,
      moved: false,
      samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }],
    };
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = 'grab';
    if (!d.moved) {
      d.char.poke();
      return;
    }
    const a = d.samples[0];
    const b = d.samples[d.samples.length - 1];
    const dt = Math.max(16, b.t - a.t) / 1000;
    d.char.release((b.x - a.x) / dt, -(b.y - a.y) / dt);
    const still = pick(e.clientX, e.clientY);
    setIgnore(!still);
  });

  canvas.addEventListener('dblclick', (e) => {
    const c = pick(e.clientX, e.clientY);
    if (c) api.openSettings(c.cfg.id);
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const c = pick(e.clientX, e.clientY);
    if (c) api.showCharacterMenu(c.cfg.id);
  });

  // --- 루프 ----------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);
    if (settings) {
      const world = { width: W, height: H, speed: settings.speed, paused, others: settings.greet ? chars : null };
      for (const c of chars) {
        c.update(dt, world);
        c.lookAt(mouse && (c === hover || c === drag?.char) ? mouse.x : null, mouse?.y, groundY());
      }
      // 뒤에 있는 캐릭터(드래그 중인 캐릭터는 맨 앞)
      const order = chars.slice().sort((a, b) => (a === drag?.char) - (b === drag?.char));
      for (const c of order) c.draw(ctx, groundY());
    }
    requestAnimationFrame(frame);
  }

  api.onSettings(applySettings);
  api.getSettings().then((s) => {
    applySettings(s);
    requestAnimationFrame(frame);
  });
})();
