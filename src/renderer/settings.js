(() => {
  const api = window.companion;
  const { PALETTE, PARTS, colorHex, randomColors } = window.Palette;
  const $ = (id) => document.getElementById(id);

  let settings = null;
  let selectedId = new URLSearchParams(location.search).get('select');
  let part = 'head';

  // --- 화면 전환: 홈(메뉴) / 커스터마이징 / 단축키 ---------------------------
  let view = 'home';
  function go(next) {
    view = next;
    for (const v of ['home', 'custom', 'hotkey']) $(`view-${v}`).hidden = v !== next;
    if (next === 'hotkey') loadHotkey();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) go(b.dataset.go);
  });
  if (selectedId) go('custom');

  const current = () => settings.characters.find((c) => c.id === selectedId);

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      api.saveSettings(settings);
    }, 120);
  }

  function editChar(fn) {
    const c = current();
    if (!c) return;
    fn(c);
    save();
    render();
  }

  // --- 목록 -----------------------------------------------------------------
  const miniChars = new Map(); // id -> { char, canvas }

  function renderList() {
    const list = $('char-list');
    list.textContent = '';
    const alive = new Set();
    for (const cfg of settings.characters) {
      alive.add(cfg.id);
      const li = document.createElement('li');
      li.classList.toggle('active', cfg.id === selectedId);
      const canvas = document.createElement('canvas');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = cfg.name;
      li.append(canvas, name);
      li.onclick = () => select(cfg.id);
      list.append(li);

      let m = miniChars.get(cfg.id);
      if (!m) {
        m = { char: new Character(cfg, { state: 'idle' }) };
        m.char.dir = 1;
        miniChars.set(cfg.id, m);
      }
      m.char.cfg = cfg;
      m.canvas = canvas;
    }
    for (const id of miniChars.keys()) if (!alive.has(id)) miniChars.delete(id);
    $('add-char').disabled = settings.characters.length >= 20;
  }

  // --- 편집기 ---------------------------------------------------------------
  function renderEditor() {
    const c = current();
    $('char-panel').style.display = c ? '' : 'none';
    if (!c) return;

    if (document.activeElement !== $('char-name')) $('char-name').value = c.name;
    $('remove-char').disabled = settings.characters.length <= 1;
    $('share-code').value = ShareCode.encode(c);

    const tabs = $('part-tabs');
    tabs.textContent = '';
    for (const p of PARTS) {
      const b = document.createElement('button');
      b.classList.toggle('on', p.id === part);
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = colorHex(c.colors[p.id]);
      b.append(dot, p.name);
      b.onclick = () => {
        part = p.id;
        renderEditor();
      };
      tabs.append(b);
    }

    const sw = $('swatches');
    sw.textContent = '';
    for (const col of PALETTE) {
      const b = document.createElement('button');
      b.style.background = col.hex;
      b.title = col.name;
      b.setAttribute('aria-label', col.name);
      b.classList.toggle('on', c.colors[part] === col.id);
      b.onclick = () => editChar((ch) => (ch.colors[part] = col.id));
      sw.append(b);
    }
  }

  function renderGlobal() {
    $('speed').value = settings.speed;
    $('speed-out').textContent = `${settings.speed.toFixed(1)}x`;
    $('size').value = settings.size;
    $('size-out').textContent = `${Math.round(settings.size * 100)}%`;
    $('greet').checked = settings.greet;
    $('shadows').checked = settings.shadows;
    $('items').checked = settings.items;
    $('daruma').checked = settings.daruma;
    $('collect-count').textContent = settings.darumaCount;
    $('paused').checked = settings.paused;
    $('startup').checked = settings.launchAtStartup;
  }

  function render() {
    if (!current()) selectedId = settings.characters[0]?.id;
    renderList();
    renderEditor();
    renderGlobal();
    if (preview && preview.cfg.id !== selectedId) preview = null;
  }

  function select(id) {
    selectedId = id;
    render();
  }

  // --- 이벤트 ---------------------------------------------------------------
  $('char-name').addEventListener('input', (e) => {
    const c = current();
    if (!c) return;
    c.name = e.target.value;
    save();
    renderList();
  });
  $('randomize').addEventListener('click', () => editChar((c) => (c.colors = randomColors())));
  $('remove-char').addEventListener('click', () => {
    if (settings.characters.length <= 1) return;
    settings.characters = settings.characters.filter((c) => c.id !== selectedId);
    selectedId = null;
    save();
    render();
  });
  $('add-char').addEventListener('click', () => {
    if (settings.characters.length >= 20) return;
    const id = `c${Date.now()}`;
    settings.characters.push({
      id,
      name: `친구 ${settings.characters.length + 1}`,
      colors: randomColors(),
    });
    selectedId = id;
    part = 'head';
    save();
    render();
  });

  // --- 공유 코드 -------------------------------------------------------------
  let copiedTimer = null;
  $('share-copy').addEventListener('click', () => {
    api.copyText($('share-code').value);
    $('share-copy').textContent = '복사됨 ✓';
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => ($('share-copy').textContent = '복사'), 1500);
  });
  $('share-code').addEventListener('focus', (e) => e.target.select());

  const importMsg = (text, kind = '') => {
    $('import-msg').textContent = text;
    $('import-msg').className = `msg ${kind}`;
  };
  const toggleImport = (open) => {
    $('import-box').hidden = !open;
    $('import-open').hidden = open;
    if (open) {
      $('import-code').value = '';
      importMsg('');
      $('import-code').focus();
    }
  };
  $('import-open').addEventListener('click', () => toggleImport(true));
  $('import-cancel').addEventListener('click', () => toggleImport(false));
  $('import-paste').addEventListener('click', async () => {
    $('import-code').value = (await api.readClipboard()).trim();
    importMsg('');
    $('import-code').focus();
  });
  $('import-code').addEventListener('input', () => importMsg(''));
  $('import-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('import-add').click();
    if (e.key === 'Escape') toggleImport(false);
  });
  $('import-add').addEventListener('click', () => {
    if (settings.characters.length >= 20) return importMsg('친구는 20명까지만 함께할 수 있어요.', 'error');
    const r = ShareCode.decode($('import-code').value);
    if (r.error) return importMsg(r.error, 'error');
    const id = `c${Date.now()}`;
    settings.characters.push({ id, name: r.name, colors: r.colors });
    selectedId = id;
    part = 'head';
    save();
    render();
    toggleImport(false);
  });

  const bindGlobal = (id, key, parse) =>
    $(id).addEventListener('input', (e) => {
      settings[key] = parse(e.target);
      save();
      renderGlobal();
    });
  bindGlobal('speed', 'speed', (t) => +t.value);
  bindGlobal('size', 'size', (t) => +t.value);
  bindGlobal('greet', 'greet', (t) => t.checked);
  bindGlobal('shadows', 'shadows', (t) => t.checked);
  bindGlobal('items', 'items', (t) => t.checked);
  bindGlobal('daruma', 'daruma', (t) => t.checked);
  bindGlobal('paused', 'paused', (t) => t.checked);
  bindGlobal('startup', 'launchAtStartup', (t) => t.checked);

  // --- 홈 화면 장면: 친구들이 오뚜기 주변을 오가며 신기해한다 ------------------
  let homeChars = null;
  let homeDaruma = null;
  let homeIcon = null;
  function drawHome(dt) {
    const { ctx, w, h } = fit($('home-stage'));
    const ground = h - 26;
    if (!homeChars || homeChars.sig !== settings.characters.map((c) => c.id).join()) {
      const list = settings.characters.slice(0, 6);
      homeDaruma = new Daruma(w * 0.68, 0);
      homeChars = list.map((cfg, i) => {
        const c = new Character(cfg, { x: w * 0.68 + (i % 2 ? 1 : -1) * (70 + Math.floor(i / 2) * 64) });
        c.state = 'marvel';
        return c;
      });
      homeChars.sig = settings.characters.map((c) => c.id).join();
      homeChars.forEach((c) => c.setDirective({ x: c.x, face: Math.sign(homeDaruma.x - c.x) || 1 }));
    }
    const s = Math.min(1, (ground - 10) / (homeChars[0]?.height || 150) / 1.15);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#E2C48C';
    ctx.fillRect(0, ground, w, h - ground);
    ctx.fillStyle = '#2B2A33';
    ctx.fillRect(0, ground, w, 3);
    homeDaruma.update(dt);
    homeDaruma.draw(ctx, ground, s, true);
    for (const c of homeChars) {
      c.globalSize = s;
      c.update(dt, { width: w, height: h, speed: 1 });
      c.draw(ctx, ground);
    }
    // 모은 오뚜기 아이콘
    const ic = fit($('collect-icon'));
    if (!homeIcon) homeIcon = new Daruma(ic.w / 2, 0);
    homeIcon.x = ic.w / 2;
    homeIcon.update(dt);
    if (Math.random() < dt * 0.4) homeIcon.wobbleV += (Math.random() - 0.5) * 6;
    ic.ctx.clearRect(0, 0, ic.w, ic.h);
    homeIcon.draw(ic.ctx, ic.h - 4, (ic.h - 10) / DarumaShape.HEIGHT, true);
  }
  $('home-stage').addEventListener('click', () => {
    homeDaruma?.hit(0);
    homeChars?.forEach((c) => c.celebrate());
  });

  // --- 단축키 설정 ---------------------------------------------------------------
  const KEY_LABEL = { CommandOrControl: 'Ctrl', Super: 'Win' };
  let capturing = false;
  function showKeys(accel) {
    const box = $('hotkey-keys');
    box.textContent = '';
    if (!accel) {
      const span = document.createElement('span');
      span.className = 'off';
      span.textContent = '단축키를 쓰지 않아요';
      box.append(span);
      return;
    }
    accel.split('+').forEach((k, i) => {
      if (i) {
        const plus = document.createElement('span');
        plus.className = 'plus';
        plus.textContent = '+';
        box.append(plus);
      }
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = KEY_LABEL[k] || k;
      box.append(key);
    });
  }
  const hotkeyMsg = (text, kind = '') => {
    $('hotkey-msg').textContent = text;
    $('hotkey-msg').className = `msg center ${kind}`;
  };
  async function loadHotkey() {
    capturing = false;
    $('hotkey-change').textContent = '바꾸기';
    const st = await api.getHotkey();
    showKeys(st.accel);
    hotkeyMsg(st.accel && !st.active ? '이 단축키는 지금 다른 프로그램이 쓰고 있어서 동작하지 않아요. 다른 조합으로 바꿔 주세요.' : '', st.accel && !st.active ? 'error' : '');
  }
  async function applyHotkey(accel) {
    const r = await api.setHotkey(accel);
    if (r.ok) {
      showKeys(r.accel);
      hotkeyMsg(r.accel ? '저장했어요! 지금 바로 눌러 보세요.' : '숨기기 단축키를 껐어요.', 'ok');
    } else {
      hotkeyMsg(r.error, 'error');
      const st = await api.getHotkey();
      showKeys(st.accel);
    }
  }
  // 키보드 이벤트를 Electron 단축키 형식(Ctrl+Alt+H)으로 바꾼다
  function toAccelerator(e) {
    const mods = [];
    if (e.ctrlKey) mods.push('CommandOrControl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Super');
    const c = e.code;
    let key = null;
    if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
    else if (/^Digit[0-9]$/.test(c)) key = c.slice(5);
    else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) key = c;
    else if (c === 'Space') key = 'Space';
    else if (c.startsWith('Arrow')) key = c.slice(5);
    else if (['Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete'].includes(c)) key = c;
    return { mods, key };
  }
  $('hotkey-change').addEventListener('click', () => {
    capturing = true;
    $('hotkey-change').textContent = '누르는 중…';
    const box = $('hotkey-keys');
    box.textContent = '';
    const w = document.createElement('span');
    w.className = 'waiting';
    w.textContent = '원하는 키 조합을 눌러 주세요 (Esc: 취소)';
    box.append(w);
    hotkeyMsg('');
  });
  window.addEventListener('keydown', (e) => {
    if (!capturing) return;
    e.preventDefault();
    if (e.code === 'Escape') return loadHotkey();
    const { mods, key } = toAccelerator(e);
    if (!key) {
      if (mods.length) showKeys(mods.join('+') + '+…');
      return;
    }
    if (!mods.length) return hotkeyMsg('Ctrl · Alt · Shift 중 하나 이상과 함께 눌러 주세요.', 'error');
    capturing = false;
    $('hotkey-change').textContent = '바꾸기';
    applyHotkey([...mods, key].join('+'));
  });
  $('hotkey-reset').addEventListener('click', () => applyHotkey('CommandOrControl+Alt+H'));
  $('hotkey-clear').addEventListener('click', () => applyHotkey(''));

  // --- 나가기 ---------------------------------------------------------------------
  let quitChar = null;
  function drawQuitFace(dt) {
    const { ctx, w, h } = fit($('quit-face'));
    const cfg = current() || settings.characters[0];
    if (!quitChar || quitChar.cfg !== cfg) {
      quitChar = new Character(cfg, { x: w / 2, state: 'wave' });
      quitChar.dir = 1;
    }
    quitChar.globalSize = 1;
    quitChar.globalSize = (h - 8) / quitChar.height;
    if (quitChar.state !== 'wave') quitChar.setState('wave', 99);
    quitChar.update(dt, { width: w, speed: 0 });
    quitChar.x = w / 2;
    ctx.clearRect(0, 0, w, h);
    quitChar.draw(ctx, h - 3);
  }
  $('quit-open').addEventListener('click', () => ($('quit-modal').hidden = false));
  $('quit-cancel').addEventListener('click', () => ($('quit-modal').hidden = true));
  $('quit-ok').addEventListener('click', () => api.quitApp());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('quit-modal').hidden) $('quit-modal').hidden = true;
  });

  // --- 미리보기 -------------------------------------------------------------
  const stage = $('preview');
  const sctx = stage.getContext('2d');
  let preview = null;
  const PREVIEW_CYCLE = ['walk', 'idle', 'wave', 'walk', 'sit', 'idle', 'sleep', 'idle'];
  let cycleIdx = 0;

  function fit(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  stage.addEventListener('click', () => preview?.poke());

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const c = current();
    if (c) {
      const { w, h } = fit(stage);
      const ground = h - 34;
      if (!preview) {
        preview = new Character(c, { x: w / 2, state: 'wave' });
        preview.dir = 1;
      }
      preview.cfg = c;
      preview.globalSize = 1;
      preview.globalSize = (ground - 40) / preview.height;
      // 미리보기에서는 무대 가운데 부근을 왔다 갔다 하도록 좁은 세계를 준다.
      const half = Math.min(w / 2, 170);
      preview.x -= w / 2 - half;
      if (preview.state !== 'air' && preview.stateT >= preview.stateDur) {
        cycleIdx = (cycleIdx + 1) % PREVIEW_CYCLE.length;
        preview.setState(PREVIEW_CYCLE[cycleIdx]);
        preview.stateT = 0;
      }
      preview.update(dt, { width: half * 2, height: ground, speed: 1 });
      preview.x += w / 2 - half;

      sctx.clearRect(0, 0, w, h);
      sctx.fillStyle = '#E2C48C';
      sctx.fillRect(0, ground, w, h - ground);
      sctx.fillStyle = '#2B2A33';
      sctx.fillRect(0, ground, w, 3);
      preview.draw(sctx, ground);
    }

    if (view === 'home') drawHome(dt);
    if (!$('quit-modal').hidden) drawQuitFace(dt);

    for (const m of miniChars.values()) {
      if (!m.canvas?.isConnected) continue;
      const { ctx, w, h } = fit(m.canvas);
      m.char.globalSize = 1;
      m.char.globalSize = Math.min(0.7, (h - 6) / m.char.height);
      m.char.x = w / 2;
      m.char.update(dt, { width: w, speed: 0, paused: true });
      m.char.x = w / 2;
      ctx.clearRect(0, 0, w, h);
      m.char.draw(ctx, h - 2);
    }
    requestAnimationFrame(frame);
  }

  api.onSettings((s) => {
    // 방금 보낸 저장 요청이 돌아온 경우엔 로컬 편집 상태를 유지한다.
    if (saveTimer) return;
    settings = s;
    render();
  });
  api.onSelect((id) => {
    if (id) {
      select(id);
      go('custom');
    } else if (view === 'hotkey') {
      loadHotkey();
    }
  });

  api.getSettings().then((s) => {
    settings = s;
    render();
    requestAnimationFrame(frame);
  });
})();
