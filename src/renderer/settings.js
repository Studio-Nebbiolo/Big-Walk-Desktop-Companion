(() => {
  const api = window.companion;
  const { PALETTE, PARTS, colorHex, randomColors } = window.Palette;
  const $ = (id) => document.getElementById(id);

  let settings = null;
  let selectedId = new URLSearchParams(location.search).get('select');
  let part = 'head';

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
  bindGlobal('paused', 'paused', (t) => t.checked);
  bindGlobal('startup', 'launchAtStartup', (t) => t.checked);

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
      sctx.fillStyle = '#b8a888';
      sctx.fillRect(0, ground, w, h - ground);
      sctx.fillStyle = 'rgba(0,0,0,.12)';
      sctx.fillRect(0, ground, w, 3);
      preview.draw(sctx, ground);
    }

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
  api.onSelect((id) => select(id));

  api.getSettings().then((s) => {
    settings = s;
    render();
    requestAnimationFrame(frame);
  });
})();
