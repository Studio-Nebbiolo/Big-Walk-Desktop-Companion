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
  const items = []; // 바닥에 생겨나는 소품들
  let nextItemAt = performance.now() / 1000 + 20 + Math.random() * 20;
  const ITEM_LIFETIME = 180; // 아무도 안 주우면 3분 뒤 사라진다
  const MAX_FREE_ITEMS = 2;

  // 빨간 오뚜기 이벤트
  let daruma = null;
  let nextDarumaAt = performance.now() / 1000 + 90 + Math.random() * 90;
  const DARUMA_IDLE_FLARE = 180; // 3분 동안 아무도 안 건드리면 신호탄을 쏜다
  const DARUMA_MAX_LIFE = 600; // 10분 동안 못 모으면 조용히 사라진다
  let flareMission = null; // { char, item }
  let slotSignature = '';

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
    const keep = new Set(next.characters.map((c) => c.id));
    for (const c of chars) if (!keep.has(c.cfg.id)) c.dropItem(false);
    if (!next.items) {
      for (let i = items.length - 1; i >= 0; i--) if (!items[i].heldBy && !items[i].mission) items.splice(i, 1);
    }
    if (!next.daruma && daruma) endDaruma(true);
    chars = next.characters.map((cfg, i) => {
      const existing = byId.get(cfg.id);
      if (existing) {
        existing.cfg = cfg;
        existing.globalSize = next.size;
        existing.showShadow = next.shadows;
        return existing;
      }
      const c = new Character(cfg, {
        x: (W / (next.characters.length + 1)) * (i + 1) + (Math.random() - 0.5) * 60,
        h: H * 0.6, // 새로 추가된 친구는 위에서 떨어진다
      });
      c.globalSize = next.size;
      c.showShadow = next.shadows;
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

  const overDaruma = (x, y) => !!daruma && daruma.hitTest(x, y, groundY(), settings.size);

  function updateHover(x, y) {
    mouse = { x, y };
    hover = pick(x, y);
    const onDaruma = !hover && overDaruma(x, y);
    setIgnore(!hover && !onDaruma);
    canvas.style.cursor = hover ? 'grab' : onDaruma ? 'pointer' : 'default';
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
    if (overDaruma(e.clientX, e.clientY) && !pick(e.clientX, e.clientY)) {
      // 오뚜기 클릭: 휘청이고, 모두 폴짝 뛰며 손을 들었다 내렸다 한다. 20번이면 수집!
      const got = daruma.hit(e.clientX);
      for (const c of chars) c.celebrate();
      if (got) api.collectDaruma();
      return;
    }
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

  // --- 소품 ----------------------------------------------------------------
  function updateItems(dt, now) {
    const sec = now / 1000;
    const free = items.filter((it) => !it.heldBy);
    if (settings.items && sec > nextItemAt) {
      nextItemAt = sec + 30 + Math.random() * 45;
      if (free.length < MAX_FREE_ITEMS) {
        const ids = Items.TYPE_IDS;
        items.push({
          type: ids[Math.floor(Math.random() * ids.length)],
          x: 90 + Math.random() * Math.max(10, W - 180),
          h: H * 0.5,
          vy: 0,
          dir: Math.random() < 0.5 ? -1 : 1,
          heldBy: null,
          touched: now,
          alpha: 1,
        });
      }
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.heldBy) {
        it.touched = now;
        continue;
      }
      it.x = Math.max(60, Math.min(W - 60, it.x));
      if (it.h > 0 || it.vy > 0) {
        it.vy -= 1900 * dt;
        it.h += it.vy * dt;
        if (it.h <= 0) {
          it.h = 0;
          it.vy = it.vy < -300 ? -it.vy * 0.35 : 0;
        }
      }
      if (it.mission) it.touched = now;
      if (now - it.touched > ITEM_LIFETIME * 1000) {
        it.alpha -= dt;
        if (it.alpha <= 0) items.splice(i, 1);
      }
    }
  }

  // --- 빨간 오뚜기 ------------------------------------------------------------
  function spawnDaruma() {
    const margin = Math.min(220, W / 4);
    daruma = new Daruma(margin + Math.random() * Math.max(10, W - margin * 2), H * 0.7);
    slotSignature = '';
    flareMission = null;
  }

  function endDaruma(silent) {
    if (daruma && silent) daruma.done = true;
    daruma = null;
    flareMission = null;
    slotSignature = '';
    for (const c of chars) c.setDirective(null);
    nextDarumaAt = performance.now() / 1000 + 300 + Math.random() * 300;
  }

  // 모두 오뚜기 주변에 겹치지 않게 자리를 잡는다: 오뚜기 양옆으로 가까운 자리부터 채운다.
  function assignSlots() {
    const s = settings.size;
    const sig = chars.map((c) => c.cfg.id).join(',') + '|' + Math.round(W) + '|' + s;
    if (sig === slotSignature) return;
    slotSignature = sig;
    const first = 70 * s;
    const gap = 68 * s;
    const lo = 50 * s;
    const hi = W - 50 * s;
    const cand = [];
    for (let k = 0; k < 24; k++) {
      for (const side of [-1, 1]) {
        const x = daruma.x + side * (first + k * gap);
        if (x >= lo && x <= hi) cand.push(x);
      }
    }
    cand.sort((a, b) => Math.abs(a - daruma.x) - Math.abs(b - daruma.x));
    const slots = cand.slice(0, chars.length);
    const order = chars.slice().sort((a, b) => Math.abs(a.x - daruma.x) - Math.abs(b.x - daruma.x));
    for (const c of order) {
      let best = 0;
      for (let i = 1; i < slots.length; i++) if (Math.abs(slots[i] - c.x) < Math.abs(slots[best] - c.x)) best = i;
      const x = slots.splice(best, 1)[0] ?? c.x;
      const keep = c.directive?.fire ? { fire: true, item: c.directive.item, fired: c.directive.fired } : {};
      c.setDirective({ ...keep, x, face: Math.sign(daruma.x - x) || 1 });
    }
  }

  // 3분 동안 아무 반응이 없으면 신호탄을 쏜다.
  // 신호탄을 든 친구가 쏘고, 없으면 바닥의 신호탄을 주워 와서, 그것도 없으면 신호탄이 떨어지면 주워 와서 쏜다.
  function updateFlareMission(now) {
    if (!flareMission) {
      if ((now - daruma.lastInteract) / 1000 < DARUMA_IDLE_FLARE) return;
      const able = chars.filter((c) => !['drag', 'air'].includes(c.state));
      if (!able.length) return;
      const holder = able.find((c) => c.item?.type === 'flare');
      if (holder) {
        flareMission = { char: holder, item: holder.item };
      } else {
        let item = items.find((it) => it.type === 'flare' && !it.heldBy);
        if (!item) {
          item = {
            type: 'flare',
            x: Math.max(80, Math.min(W - 80, daruma.x + (Math.random() < 0.5 ? -1 : 1) * 160)),
            h: H * 0.5,
            vy: 0,
            dir: 1,
            heldBy: null,
            touched: now,
            alpha: 1,
            mission: true,
          };
          items.push(item);
        }
        const near = able.slice().sort((a, b) => Math.abs(a.x - item.x) - Math.abs(b.x - item.x))[0];
        flareMission = { char: near, item };
      }
      const c = flareMission.char;
      c.setDirective({ ...(c.directive || {}), fire: true, fired: false, item: flareMission.item });
      return;
    }
    const m = flareMission;
    // 다른 친구가 신호탄을 먼저 집었다면 그 친구가 쏜다
    if (m.item?.heldBy && m.item.heldBy !== m.char) {
      m.char.setDirective({ ...m.char.directive, fire: false });
      m.char = m.item.heldBy;
      m.char.setDirective({ ...(m.char.directive || {}), fire: true, fired: false, item: m.item });
    }
    if (!chars.includes(m.char) || (!m.item?.heldBy && !items.includes(m.item))) {
      if (chars.includes(m.char)) m.char.setDirective({ ...m.char.directive, fire: false });
      flareMission = null;
      return;
    }
    if (m.char.directive?.fired) {
      m.char.setDirective({ ...m.char.directive, fire: false });
      if (m.item) m.item.mission = false;
      flareMission = null;
      daruma.lastInteract = now; // 다시 3분을 센다
    }
  }

  function updateDaruma(dt, now) {
    const sec = now / 1000;
    if (!daruma) {
      if (settings.daruma && !paused && sec > nextDarumaAt && W > 200) spawnDaruma();
      return;
    }
    daruma.update(dt);
    if (daruma.done) return endDaruma(false);
    if (daruma.collected) {
      if (chars.some((c) => c.directive)) for (const c of chars) c.setDirective(null);
      return;
    }
    if ((now - daruma.born) / 1000 > DARUMA_MAX_LIFE) return endDaruma(true);
    assignSlots();
    updateFlareMission(now);
  }

  // --- 루프 ----------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);
    if (settings) {
      updateItems(dt, now);
      updateDaruma(dt, now);
      const world = { width: W, height: H, speed: settings.speed, paused, items, others: settings.greet ? chars : null };
      for (const c of chars) {
        c.update(dt, world);
        c.lookAt(mouse && (c === hover || c === drag?.char) ? mouse.x : null, mouse?.y, groundY());
      }
      // 뒤에 있는 캐릭터(드래그 중인 캐릭터는 맨 앞)
      for (const it of items) if (!it.heldBy) Items.drawResting(ctx, it, groundY(), settings.size, settings.shadows);
      if (daruma) daruma.draw(ctx, groundY(), settings.size, settings.shadows);
      const order = chars.slice().sort((a, b) => (a === drag?.char) - (b === drag?.char));
      for (const c of order) c.draw(ctx, groundY());
    }
    requestAnimationFrame(frame);
  }

  // 테스트·디버그용: 오뚜기 이벤트를 바로 일으키거나 상태를 들여다본다
  window.BigWalkDebug = {
    spawnDaruma: () => spawnDaruma(),
    skipIdle: () => daruma && (daruma.lastInteract -= DARUMA_IDLE_FLARE * 1000),
    get daruma() { return daruma; },
    get chars() { return chars; },
    get items() { return items; },
    get mission() { return flareMission; },
  };

  api.onSettings(applySettings);
  api.getSettings().then((s) => {
    applySettings(s);
    requestAnimationFrame(frame);
  });
})();
