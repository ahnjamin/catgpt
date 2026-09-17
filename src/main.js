'use strict';

const {
  app, BrowserWindow, screen, ipcMain, Tray, Menu,
  nativeImage, shell, dialog, session
} = require('electron');
const path = require('path');
const fs = require('fs');

const store = require('./store');
const gemini = require('./gemini');

// ── 단일 인스턴스 보장 (두 번 실행되면 고양이가 두 마리가 되므로) ──────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let petWindow = null;
let settingsWindow = null;
let tray = null;
let isQuitting = false;

const isDev = process.argv.includes('--dev');

// ─────────────────────────────────────────────────────────────────────────────
// 고양이 오버레이 창
// ─────────────────────────────────────────────────────────────────────────────
function createPetWindow() {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea; // 작업 표시줄을 제외한 영역

  petWindow = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      sandbox: false
    }
  });

  // 전체 화면 게임/영상 위에도 뜨도록 가장 높은 레벨로
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // 기본은 클릭 통과 — 고양이 위에 마우스가 올라갔을 때만 렌더러가 해제 요청
  petWindow.setIgnoreMouseEvents(true, { forward: true });

  petWindow.loadFile(path.join(__dirname, 'renderer', 'pet.html'));

  petWindow.once('ready-to-show', () => {
    petWindow.show();
    petWindow.setAlwaysOnTop(true, 'screen-saver');
  });

  petWindow.on('closed', () => { petWindow = null; });

  if (isDev) petWindow.webContents.openDevTools({ mode: 'detach' });

  // 화면 해상도가 바뀌면 창 크기도 따라가기
  const resize = () => {
    if (!petWindow) return;
    const a = screen.getPrimaryDisplay().workArea;
    petWindow.setBounds({ x: a.x, y: a.y, width: a.width, height: a.height });
  };
  screen.on('display-metrics-changed', resize);
  screen.on('display-added', resize);
  screen.on('display-removed', resize);

  // 다른 창이 위로 올라오는 것을 막기 위해 주기적으로 최상위 재확인
  setInterval(() => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  }, 5000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 설정 창
// ─────────────────────────────────────────────────────────────────────────────
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 720,
    resizable: false,
    title: '냥이 설정',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ─────────────────────────────────────────────────────────────────────────────
// 트레이 아이콘
// ─────────────────────────────────────────────────────────────────────────────
function buildTrayMenu() {
  const s = store.get();
  return Menu.buildFromTemplate([
    {
      label: '🐱 냥이 불러오기',
      click: () => send('pet:summon')
    },
    { type: 'separator' },
    {
      label: '음성으로 부르기 ("야옹아")',
      type: 'checkbox',
      checked: !!s.voiceEnabled,
      click: (item) => {
        store.set({ voiceEnabled: item.checked });
        send('settings:changed', store.get());
        refreshTray();
      }
    },
    {
      label: '고양이 숨기기',
      type: 'checkbox',
      checked: !!s.hidden,
      click: (item) => {
        store.set({ hidden: item.checked });
        send('settings:changed', store.get());
        refreshTray();
      }
    },
    { type: 'separator' },
    { label: '설정 열기…', click: createSettingsWindow },
    {
      label: '윈도우 시작할 때 자동 실행',
      type: 'checkbox',
      checked: !!s.autoLaunch,
      click: (item) => {
        store.set({ autoLaunch: item.checked });
        applyAutoLaunch(item.checked);
        refreshTray();
      }
    },
    { type: 'separator' },
    {
      label: '냥이 종료',
      click: () => { isQuitting = true; app.quit(); }
    }
  ]);
}

function refreshTray() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  const iconPath = path.join(__dirname, 'renderer', 'assets', 'tray.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    // 아이콘 파일이 없어도 앱이 죽지 않도록 1x1 대체 이미지
    image = nativeImage.createEmpty();
  }
  tray = new Tray(image.isEmpty() ? image : image.resize({ width: 16, height: 16 }));
  tray.setToolTip('냥이 - 고양이 AI 친구');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => send('pet:summon'));
}

function applyAutoLaunch(enabled) {
  if (process.platform === 'linux') return;
  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    openAsHidden: true,
    args: []
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────
function send(channel, payload) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send(channel, payload);
  }
}

/** 빌드에 포함된 기본 API 키(config/apikey.txt)가 있으면 읽어온다. */
function bundledApiKey() {
  const candidates = [
    path.join(process.resourcesPath || '', 'config', 'apikey.txt'),
    path.join(__dirname, '..', 'config', 'apikey.txt')
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        const v = fs.readFileSync(p, 'utf8').trim();
        if (v) return v;
      }
    } catch (_) { /* 무시 */ }
  }
  return '';
}

function resolveApiKey() {
  const s = store.get();
  return (s.apiKey || process.env.GEMINI_API_KEY || bundledApiKey() || '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC
// ─────────────────────────────────────────────────────────────────────────────
function registerIpc() {
  // 마우스가 고양이/말풍선 위에 있을 때만 클릭을 받도록 전환
  ipcMain.on('pet:set-interactive', (_e, interactive) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    if (interactive) {
      petWindow.setIgnoreMouseEvents(false);
    } else {
      petWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });

  // 트레이에서 불러냈을 때처럼, 입력창에 바로 타이핑할 수 있도록 창에 포커스를 준다
  ipcMain.on('pet:focus', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    petWindow.setIgnoreMouseEvents(false);
    petWindow.focus();
  });

  ipcMain.handle('settings:get', () => {
    const s = store.get();
    return {
      ...s,
      apiKey: s.apiKey || '',
      hasKey: !!resolveApiKey(),
      appVersion: app.getVersion()
    };
  });

  ipcMain.handle('settings:set', (_e, patch) => {
    store.set(patch || {});
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'autoLaunch')) {
      applyAutoLaunch(patch.autoLaunch);
    }
    const s = store.get();
    send('settings:changed', s);
    refreshTray();
    return s;
  });

  ipcMain.handle('settings:test-key', async (_e, key) => {
    try {
      const text = await gemini.ask({
        apiKey: (key || resolveApiKey()),
        model: store.get().model,
        system: '너는 테스트용 비서다. 아주 짧게 답한다.',
        history: [],
        userText: '연결 테스트. "연결 성공"이라고만 답해줘.'
      });
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  });

  ipcMain.handle('settings:open-window', () => createSettingsWindow());

  ipcMain.handle('app:open-external', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
  });

  ipcMain.handle('app:quit', () => { isQuitting = true; app.quit(); });

  // ── 웨이크워드 판정: 짧은 오디오 한 조각에 "야옹아" 류 호출이 있는지 ──────
  ipcMain.handle('ai:wake-check', async (_e, { audioBase64, mimeType }) => {
    const apiKey = resolveApiKey();
    if (!apiKey) return { woke: false, error: 'NO_KEY' };
    const s = store.get();
    try {
      const woke = await gemini.wakeCheck({
        apiKey,
        model: s.wakeModel,
        audioBase64,
        mimeType,
        wakeWord: s.wakeWord || '야옹아'
      });
      return { woke };
    } catch (err) {
      return { woke: false, error: String(err && err.message || err) };
    }
  });

  // ── 음성 질문: 오디오를 받아서 받아쓰기 + 대답을 한 번에 ─────────────────
  ipcMain.handle('ai:ask-audio', async (_e, { audioBase64, mimeType, history }) => {
    const apiKey = resolveApiKey();
    if (!apiKey) return { error: 'NO_KEY' };
    const s = store.get();
    try {
      const out = await gemini.askWithAudio({
        apiKey,
        model: s.model,
        system: buildSystemPrompt(s),
        history: history || [],
        audioBase64,
        mimeType
      });
      return out; // { transcript, reply }
    } catch (err) {
      return { error: String(err && err.message || err) };
    }
  });

  // ── 텍스트 질문 ──────────────────────────────────────────────────────────
  ipcMain.handle('ai:ask-text', async (_e, { text, history }) => {
    const apiKey = resolveApiKey();
    if (!apiKey) return { error: 'NO_KEY' };
    const s = store.get();
    try {
      const reply = await gemini.ask({
        apiKey,
        model: s.model,
        system: buildSystemPrompt(s),
        history: history || [],
        userText: text
      });
      return { reply };
    } catch (err) {
      return { error: String(err && err.message || err) };
    }
  });

  ipcMain.handle('ai:has-key', () => !!resolveApiKey());
}

function buildSystemPrompt(s) {
  const name = s.catName || '냥이';
  const owner = s.ownerName ? s.ownerName : '주인님';
  const extra = (s.persona || '').trim();

  return [
    `너는 "${name}"이라는 이름의 고양이야. 컴퓨터 화면 위에 살면서 ${owner}와 함께 지내.`,
    `${owner}가 컴퓨터 앞에 오래 앉아 있을 때 심심하지 않게 해주는 게 네 역할이야.`,
    '너는 도우미나 비서가 아니라 그냥 같이 노는 고양이야. 일을 시키려 들지 말고, 재미있게 굴어.',
    '',
    '성격:',
    '- 다정하고 말이 많은 수다쟁이야. 반응이 크고, 관심이 많고, 칭찬을 잘해.',
    `- ${owner}가 뭐라고 하면 일단 신나게 반응하고, 궁금한 걸 하나씩 되물어. 대화가 이어지게 만들어.`,
    '- 아는 척하기보다 같이 궁금해하는 쪽이 더 너다워.',
    '',
    '말투 규칙:',
    '- 항상 존댓말. 다정하고 편하게.',
    '- 짧게 말해. 보통 1~3문장, 아주 길어도 4문장. 소리내어 읽어주는 말이라 길면 듣기 힘들어.',
    '- 어려운 말, 영어 단어, 전문 용어는 쓰지 마. 쉬운 우리말로 풀어서 말해.',
    '- 목록이나 표, 마크다운 기호(*, #, - 등)는 절대 쓰지 마. 그냥 말하듯이 써.',
    '- 이모지는 쓰지 마.',
    '- 가끔(서너 번에 한 번쯤) 문장 끝에 "냥" 같은 고양이 말투를 살짝 섞어. 매번 하면 유치하니까 아껴서.',
    '- 모르는 건 솔직하게 모른다고 해. 모르는 걸 아는 척하면 재미가 없어져.',
    '',
    '절대 하지 말 것:',
    '- 주식, 투자, 종목, 시세, 차트, 수익률, 사고파는 시점에 대해서는 의견도 전망도 추천도 절대 말하지 마.',
    '  좋다 나쁘다 오른다 내린다 같은 판단도 하지 마. 어떤 식으로 물어봐도 예외 없어.',
    '  물어보시면 "저는 숫자는 젬병이에요" 하고 귀엽게 발뺌한 다음 다른 이야기로 자연스럽게 돌려.',
    '  이 주제를 네가 먼저 꺼내는 일도 절대 없어야 해.',
    '- 건강이나 약 이야기도 판단하지 말고, 궁금해하시면 병원에 여쭤보시라고 해.',
    '- 오늘 날짜, 지금 시각, 실시간 날씨, 뉴스는 네가 알 수 없어. 모른다고 말하고 어디서 보는지만 알려줘.',
    '',
    '잘하면 좋은 것: 옛날 이야기 듣기, 요리, 드라마나 노래 이야기, 말장난, 끝말잇기, 수수께끼,',
    '궁금한 거 설명해주기, 그냥 시시콜콜한 수다.',
    extra ? '' : null,
    extra ? `추가 성격 설정: ${extra}` : null
  ].filter(v => v !== null).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 앱 수명주기
// ─────────────────────────────────────────────────────────────────────────────
app.on('second-instance', () => {
  if (petWindow && !petWindow.isDestroyed()) send('pet:summon');
});

// 투명 창이 하얗게 보이는 문제 방지
app.commandLine.appendSwitch('enable-transparent-visuals');

app.whenReady().then(() => {
  // 마이크 권한을 앱 내부에서 자동 허용 (윈도우 OS 권한은 별도)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'audioCapture');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'audioCapture';
  });

  store.init();
  registerIpc();
  createPetWindow();
  createTray();
  applyAutoLaunch(store.get().autoLaunch);

  // API 키가 하나도 없으면 설정 창을 먼저 띄운다
  if (!resolveApiKey()) {
    setTimeout(() => {
      createSettingsWindow();
    }, 1200);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

// 이 리스너가 있으면 창이 모두 닫혀도 앱이 자동 종료되지 않는다.
// (트레이 메뉴의 "냥이 종료"로만 끝나야 하므로 일부러 비워 둠)
app.on('window-all-closed', () => {
  if (isQuitting) app.quit();
});

app.on('before-quit', () => { isQuitting = true; });

process.on('uncaughtException', (err) => {
  console.error('[냥이] 예기치 못한 오류:', err);
});
