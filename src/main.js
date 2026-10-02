const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, clipboard, globalShortcut, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { PALETTE, PARTS, BY_ID, randomColors } = require('./shared/palette');
const ShareCode = require('./shared/sharecode');
const I18n = require('./shared/i18n');

const STAGE_HEIGHT = 320; // 작업표시줄 위로 캐릭터가 뛰어놀 공간
const CURSOR_POLL_MS = 50;
const MOUSE_REASSERT_MS = 1000; // 창의 클릭 통과 상태를 주기적으로 다시 지정한다
const DEFAULT_HOTKEY = 'CommandOrControl+Alt+H';
const HOTKEY_RE = /^((CommandOrControl|Ctrl|Alt|Shift|Super)\+){1,3}([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete)$/;

let companionWin = null;
let settingsWin = null;
let tray = null;
let settings = null;
let cursorTimer = null;
let ignoringMouse = true;

// --- 설정 ------------------------------------------------------------------

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  speed: 1,
  size: 1,
  greet: true,
  shadows: true,
  items: true,
  daruma: true,
  darumaCount: 0,
  hideHotkey: DEFAULT_HOTKEY,
  paused: false,
  launchAtStartup: false,
  language: 'auto', // 'auto' = Windows 표시 언어를 따른다
};

// --- 언어 ------------------------------------------------------------------

// Windows 표시 언어 목록 (예: ['pt-BR', 'en-US']). 앱이 준비된 뒤에만 정확하다.
function systemLocales() {
  const list = [];
  try {
    list.push(...(app.getPreferredSystemLanguages?.() || []));
  } catch {}
  try {
    list.push(app.getLocale());
  } catch {}
  return list;
}

// 지금 화면에 쓸 번역 함수
const tr = () => I18n.translator(I18n.resolve(settings?.language, systemLocales()));

// 처음 실행할 때의 친구 넷: 이름은 그때의 언어로 짓는다 (그 뒤엔 사용자 이름이라 바뀌지 않는다)
function defaultCharacters() {
  const names = tr().names();
  return [
    { id: 'c1', name: names[0], colors: { head: 'amber', body: 'gray', legs: 'crimson' } },
    { id: 'c2', name: names[1], colors: { head: 'royal', body: 'rust', legs: 'amber' } },
    { id: 'c3', name: names[2], colors: { head: 'orange', body: 'royal', legs: 'lime' } },
    { id: 'c4', name: names[3], colors: { head: 'green', body: 'orange', legs: 'charcoal' } },
  ];
}

const clampNum = (v, lo, hi, def) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : def);

// 설정 창에서 온 값은 그대로 믿지 않고 팔레트에 있는 색만 남긴다.
function sanitize(input) {
  const s = input && typeof input === 'object' ? input : {};
  const chars = Array.isArray(s.characters) ? s.characters : defaultCharacters();
  const seen = new Set();
  return {
    speed: clampNum(s.speed, 0.3, 3, 1),
    size: clampNum(s.size, 0.6, 1.8, 1),
    greet: s.greet !== false,
    shadows: s.shadows !== false,
    items: s.items !== false,
    daruma: s.daruma !== false,
    darumaCount: Math.max(0, Math.floor(clampNum(s.darumaCount, 0, 1e9, 0))),
    hideHotkey: typeof s.hideHotkey === 'string' && (s.hideHotkey === '' || HOTKEY_RE.test(s.hideHotkey)) ? s.hideHotkey : DEFAULT_HOTKEY,
    paused: !!s.paused,
    launchAtStartup: !!s.launchAtStartup,
    language: I18n.isLang(s.language) ? s.language : 'auto',
    characters: chars.slice(0, 20).map((c, i) => {
      let id = typeof c.id === 'string' && c.id ? c.id.slice(0, 40) : `c${Date.now()}${i}`;
      while (seen.has(id)) id += 'x';
      seen.add(id);
      const fallback = randomColors();
      let src = c.colors || {};
      // 예전 4부위 설정(head/torso/body/legs)을 3부위로 옮긴다.
      if (src.torso) src = { head: src.head, body: src.torso, legs: src.body };
      const colors = {};
      for (const p of PARTS) colors[p.id] = BY_ID[src[p.id]] ? src[p.id] : fallback[p.id];
      return {
        id,
        name: String(c.name ?? tr()('friendN', { n: i + 1 })).slice(0, 20),
        colors,
      };
    }),
  };
}

// 예전 이름(Magic School Companion)으로 저장된 설정이 있으면 처음 한 번 옮겨 온다.
function migrateOldSettings() {
  if (fs.existsSync(settingsPath())) return;
  for (const oldName of ['Magic School Companion', 'magic-school-companion']) {
    const oldPath = path.join(app.getPath('appData'), oldName, 'settings.json');
    try {
      if (!fs.existsSync(oldPath)) continue;
      fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
      fs.copyFileSync(oldPath, settingsPath());
      return;
    } catch {}
  }
}

function loadSettings() {
  migrateOldSettings();
  try {
    return sanitize(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')));
  } catch {
    return sanitize(DEFAULT_SETTINGS);
  }
}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  }, 300);
}

function updateSettings(next) {
  const prevStartup = settings?.launchAtStartup;
  settings = sanitize(next);
  if (prevStartup !== settings.launchAtStartup && (process.platform === 'win32' || process.platform === 'darwin')) {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup });
  }
  persist();
  for (const w of [companionWin, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('settings:changed', settings);
  }
  refreshTrayMenu();
}

// --- 컴패니언 창 -------------------------------------------------------------

function stageBounds() {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const b = display.bounds;
  // 작업표시줄이 아래에 있으면 workArea 의 아래쪽 끝이 곧 작업표시줄의 윗면이다.
  // 좌·우·위에 있거나 자동 숨김이면 화면 맨 아래를 땅으로 쓴다.
  const bottom = wa.y + wa.height < b.y + b.height ? wa.y + wa.height : b.y + b.height;
  const height = Math.min(STAGE_HEIGHT, wa.height);
  return { x: wa.x, y: bottom - height, width: wa.width, height };
}

function createCompanion() {
  companionWin = new BrowserWindow({
    ...stageBounds(),
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  companionWin.setAlwaysOnTop(true, 'screen-saver');
  companionWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  companionWin.setIgnoreMouseEvents(true, { forward: true });
  companionWin.loadFile(path.join(__dirname, 'renderer', 'companion.html'));
  companionWin.on('closed', () => (companionWin = null));

  const reposition = () => companionWin && !companionWin.isDestroyed() && companionWin.setBounds(stageBounds());
  screen.on('display-metrics-changed', reposition);
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);

  startCursorPolling();
}

// 커서 위치는 클릭 통과 여부와 상관없이 항상 알려준다. 창의 실제 상태가 렌더러가 아는 것과
// 어긋나도(잠금 화면을 다녀온 뒤 등) 렌더러가 매번 다시 판단해 바로잡을 수 있다.
function startCursorPolling() {
  clearInterval(cursorTimer);
  let wasInside = false;
  let lastAssert = 0;
  cursorTimer = setInterval(() => {
    if (!companionWin || companionWin.isDestroyed() || !companionWin.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = companionWin.getBounds();
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (inside) companionWin.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
    else if (wasInside) companionWin.webContents.send('cursor', null);
    wasInside = inside;
    // Windows 가 창 상태를 몰래 바꿔 놓아도 1초 안에 원래대로 돌아오게 다시 지정한다
    const now = Date.now();
    if (now - lastAssert > MOUSE_REASSERT_MS) {
      lastAssert = now;
      companionWin.setIgnoreMouseEvents(ignoringMouse, { forward: true });
    }
  }, CURSOR_POLL_MS);
}

// 잠금(Win+L)·절전에서 돌아오면 Windows 가 투명 창의 마우스 처리 상태를 망가뜨릴 수 있다.
// 창을 숨겼다 다시 보여 창 스타일을 새로 적용하고, 클릭 통과와 항상 위를 처음부터 다시 건다.
// 렌더러에도 알려서 기억하던 마우스 상태(호버·드래그)를 초기화한다.
function resetCompanionMouse() {
  if (!companionWin || companionWin.isDestroyed()) return;
  const wasVisible = companionWin.isVisible();
  ignoringMouse = true;
  companionWin.setIgnoreMouseEvents(false);
  companionWin.setIgnoreMouseEvents(true, { forward: true });
  if (wasVisible) {
    companionWin.hide();
    companionWin.showInactive();
  }
  companionWin.setAlwaysOnTop(true, 'screen-saver');
  companionWin.setBounds(stageBounds());
  companionWin.webContents.send('mouse:reset');
  startCursorPolling();
}

function watchPower() {
  // 잠금 해제 직후에는 데스크톱 전환이 덜 끝났을 수 있어서, 바로 한 번 + 조금 뒤 한 번 더
  const reset = () => {
    resetCompanionMouse();
    setTimeout(resetCompanionMouse, 1500);
  };
  powerMonitor.on('unlock-screen', reset);
  powerMonitor.on('resume', reset);
  powerMonitor.on('user-did-become-active', reset);
}

// --- 설정 창 -----------------------------------------------------------------

// 메뉴 창: 홈(메뉴) / 친구 꾸미기 / 단축키 설정. charId 를 주면 꾸미기 화면에서 그 친구를 연다.
function openSettings(charId) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    settingsWin.webContents.send('settings:select', charId || null);
    return;
  }
  settingsWin = new BrowserWindow({
    width: 960,
    height: 780,
    minWidth: 780,
    minHeight: 600,
    title: 'Big Walk Companion',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#F4EBD6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'), charId ? { query: { select: charId } } : undefined);
  settingsWin.on('closed', () => (settingsWin = null));
}

// --- 숨기기 단축키 ----------------------------------------------------------------

let registeredHotkey = null;

function toggleCompanion() {
  if (!companionWin || companionWin.isDestroyed()) return;
  if (companionWin.isVisible()) companionWin.hide();
  else {
    companionWin.showInactive();
    resetCompanionMouse();
  }
  refreshTrayMenu();
}

// 단축키를 등록한다. 다른 프로그램이 이미 쓰고 있으면 실패하고 이전 단축키를 유지한다.
function registerHotkey(accel) {
  if (registeredHotkey) globalShortcut.unregister(registeredHotkey);
  registeredHotkey = null;
  if (!accel) return { ok: true };
  let ok = false;
  try {
    ok = globalShortcut.register(accel, toggleCompanion);
  } catch {
    ok = false;
  }
  if (ok) registeredHotkey = accel;
  return ok ? { ok: true } : { ok: false, error: tr()('hotkey.taken') };
}

// --- 트레이 --------------------------------------------------------------------

function refreshTrayMenu() {
  if (!tray) return;
  const t = tr();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('tray.open'), click: () => openSettings() },
      { label: t('tray.add'), click: addRandomCharacter, enabled: settings.characters.length < 20 },
      { type: 'separator' },
      {
        label: t('tray.pause'),
        type: 'checkbox',
        checked: settings.paused,
        click: (item) => updateSettings({ ...settings, paused: item.checked }),
      },
      {
        label: t('tray.hide'),
        accelerator: registeredHotkey || undefined,
        registerAccelerator: false,
        type: 'checkbox',
        checked: companionWin ? !companionWin.isVisible() : false,
        click: (item) => {
          if (!companionWin) return;
          if (item.checked) companionWin.hide();
          else {
            companionWin.showInactive();
            resetCompanionMouse();
          }
        },
      },
      { type: 'separator' },
      { label: t('tray.collected', { n: settings.darumaCount }), enabled: false },
      { type: 'separator' },
      { label: t('tray.quit'), click: () => app.quit() },
    ]),
  );
}

function addRandomCharacter() {
  if (settings.characters.length >= 20) return;
  const n = settings.characters.length + 1;
  updateSettings({
    ...settings,
    characters: [
      ...settings.characters,
      { id: `c${Date.now()}`, name: tr()('friendN', { n }), colors: randomColors() },
    ],
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Big Walk Companion');
  tray.on('click', () => openSettings());
  refreshTrayMenu();
}

// --- IPC -----------------------------------------------------------------------

ipcMain.handle('settings:get', () => settings);
ipcMain.handle('palette:get', () => PALETTE);
ipcMain.handle('locale:get', () => systemLocales());
ipcMain.on('settings:save', (_e, next) => updateSettings(next));
ipcMain.on('settings:open', (_e, charId) => openSettings(charId));
ipcMain.on('daruma:collected', () => updateSettings({ ...settings, darumaCount: settings.darumaCount + 1 }));
ipcMain.on('app:quit', () => app.quit());
ipcMain.handle('hotkey:get', () => ({ accel: settings.hideHotkey, active: registeredHotkey === settings.hideHotkey }));
ipcMain.handle('hotkey:set', (_e, accel) => {
  const next = String(accel ?? '');
  if (next && !HOTKEY_RE.test(next)) return { ok: false, error: tr()('hotkey.invalid') };
  const prev = settings.hideHotkey;
  const r = registerHotkey(next);
  if (!r.ok) {
    registerHotkey(prev);
    return r;
  }
  updateSettings({ ...settings, hideHotkey: next });
  return { ok: true, accel: next };
});
// 공유 코드 복사/붙여넣기 (샌드박스 렌더러는 클립보드에 직접 못 닿는다)
// (이 Electron 버전에서는 clipboard API 가 Promise 를 돌려줄 수 있어 await 한다)
ipcMain.on('clipboard:write', async (_e, text) => {
  await clipboard.writeText(String(text).slice(0, 500));
});
ipcMain.handle('clipboard:read', async () => String((await clipboard.readText()) ?? '').slice(0, 500));

ipcMain.on('mouse:ignore', (e, ignore) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win !== companionWin) return;
  ignoringMouse = !!ignore;
  win.setIgnoreMouseEvents(ignoringMouse, { forward: true });
});

ipcMain.on('character:menu', (e, charId) => {
  const c = settings.characters.find((x) => x.id === charId);
  if (!c) return;
  const t = tr();
  Menu.buildFromTemplate([
    { label: c.name, enabled: false },
    { type: 'separator' },
    { label: t('ctx.colors'), click: () => openSettings(charId) },
    { label: t('ctx.copy'), click: async () => await clipboard.writeText(ShareCode.encode(c)) },
    {
      label: t('ctx.remove'),
      enabled: settings.characters.length > 1,
      click: () => updateSettings({ ...settings, characters: settings.characters.filter((x) => x.id !== charId) }),
    },
  ]).popup({ window: BrowserWindow.fromWebContents(e.sender) });
});

// --- 앱 수명 주기 --------------------------------------------------------------

if (process.platform === 'linux') {
  // 리눅스에서 투명 창이 검게 나오는 문제 회피
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.disableHardwareAcceleration();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());

  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.hide();
    settings = loadSettings();
    createCompanion();
    watchPower();
    registerHotkey(settings.hideHotkey);
    createTray();
    if (process.env.BIG_WALK_OPEN_SETTINGS) openSettings();
  });

  // 설정 창을 닫아도 트레이에 남아 있는다.
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    clearInterval(cursorTimer);
    globalShortcut.unregisterAll();
    try {
      if (settings) fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
    } catch {}
  });
}
