'use strict';

/**
 * 고양이의 행동, 말풍선, 대화 흐름을 담당한다.
 */

const $ = (id) => document.getElementById(id);

const el = {
  pet: $('pet'),
  catWrap: $('catWrap'),
  catArt: $('catArt'),
  bubble: $('bubble'),
  bubbleText: $('bubbleText'),
  askBox: $('askBox'),
  askInput: $('askInput'),
  askSend: $('askSend'),
  toast: $('toast'),
  earRing: $('earRing'),
  zzz: $('zzz')
};

let settings = null;

// ── 고양이 상태 ────────────────────────────────────────────────────────────
const S = {
  x: 200,              // 화면 왼쪽부터의 위치(px)
  dir: 1,              // 1 = 오른쪽, -1 = 왼쪽
  speed: 42,           // px/초
  behavior: 'walk',    // walk | sit | sleep
  mode: 'idle',        // idle | awake(대화 중)
  busy: false,         // AI 응답을 기다리는 중
  lastInteraction: Date.now(),
  history: [],         // [{role, text}]
  nextBehaviorAt: 0,
  wakeCalls: [],       // 최근 웨이크워드 판정 호출 시각들 (사용량 보호)
  askOpen: false,
  interactive: false
};

const CAT_WIDTH = () => el.pet.offsetWidth || 150;

// ─────────────────────────────────────────────────────────────────────────────
// 시작
// ─────────────────────────────────────────────────────────────────────────────
async function init() {
  settings = await window.nyangi.getSettings();
  applySettings(settings, true);

  window.nyangi.onSettingsChanged((s) => {
    const skinChanged = s.skin !== settings.skin || s.scale !== settings.scale;
    const voiceChanged = s.voiceEnabled !== settings.voiceEnabled ||
                         s.micSensitivity !== settings.micSensitivity;
    settings = s;
    applySettings(s, skinChanged);
    if (voiceChanged) restartVoice();
  });

  window.nyangi.onSummon(() => summon());

  bindInteraction();
  startBlinking();
  requestAnimationFrame(loop);
  scheduleNextBehavior(1500);

  // API 키 확인
  const hasKey = await window.nyangi.hasKey();
  if (!hasKey) {
    showToast(
      '<b>냥이</b>를 쓰려면 먼저 Gemini API 키를 넣어야 해요.<br>설정 창에서 키를 붙여넣어 주세요.',
      { button: '설정 열기', onClick: () => window.nyangi.openSettings() }
    );
  } else {
    setTimeout(() => {
      say(pick([
        '안녕하세요! 저 왔어요. 심심하면 "야옹아" 하고 불러주세요.',
        '저 오늘도 출근했어요! 할 일은 없지만요.',
        '왔어요 왔어요. 여기서 왔다 갔다 하고 있을 테니까 심심하면 부르세요!',
        '안녕하세요! 오늘은 무슨 재미있는 일 있으셨어요?'
      ]), 6500);
    }, 2500);
  }

  if (settings.voiceEnabled) restartVoice();
  scheduleIdleChatter();
}

function applySettings(s, rebuildArt) {
  if (rebuildArt) {
    if (s.skin === 'custom' && s.customSkinPath) {
      el.catArt.innerHTML =
        `<img src="file://${s.customSkinPath.replace(/\\/g, '/')}" style="width:100%;display:block" alt="">`;
    } else {
      el.catArt.innerHTML = window.CatArt.buildCatSVG(s.skin);
    }
    document.documentElement.style.setProperty('--cat-w', Math.round(150 * (s.scale || 1)) + 'px');
  }
  el.pet.classList.toggle('hidden-away', !!s.hidden);
}

// ─────────────────────────────────────────────────────────────────────────────
// 움직임
// ─────────────────────────────────────────────────────────────────────────────
let lastTs = 0;

function loop(ts) {
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0;
  lastTs = ts;

  if (S.behavior === 'walk' && S.mode === 'idle' && !S.busy && !S.askOpen) {
    S.x += S.dir * S.speed * dt;
    const maxX = window.innerWidth - CAT_WIDTH();
    if (S.x <= 0) { S.x = 0; S.dir = 1; }
    if (S.x >= maxX) { S.x = maxX; S.dir = -1; }
  }

  el.pet.style.transform = `translateX(${Math.round(S.x)}px)`;
  el.pet.classList.toggle('face-left', S.dir === -1);

  if (ts > S.nextBehaviorAt && S.mode === 'idle' && !S.busy && !S.askOpen) {
    rollBehavior();
  }

  // 마우스가 가만히 있어도 고양이가 그 아래로 지나갈 수 있으므로 주기적으로 다시 판정
  if (ts - (S.lastHitCheck || 0) > 150) {
    S.lastHitCheck = ts;
    updateInteractive();
    if (!el.bubble.classList.contains('hidden')) clampBubble();
    if (S.askOpen) clampAsk();
  }

  requestAnimationFrame(loop);
}

function rollBehavior() {
  const r = Math.random();
  if (S.behavior === 'walk') {
    if (r < 0.45)      setBehavior('sit',   rand(4000, 9000));
    else if (r < 0.55) setBehavior('sleep', rand(12000, 30000));
    else               setBehavior('walk',  rand(5000, 12000), true);
  } else {
    setBehavior('walk', rand(6000, 14000), true);
  }
}

function setBehavior(name, durationMs, maybeTurn) {
  S.behavior = name;
  if (maybeTurn && Math.random() < 0.4) S.dir *= -1;
  scheduleNextBehavior(durationMs);
  paintState();
}

function scheduleNextBehavior(ms) {
  S.nextBehaviorAt = performance.now() + ms;
}

/** 현재 상황에 맞는 CSS 클래스를 고양이에게 입힌다 */
function paintState(override) {
  const cls = override || (
    S.busy ? 'think'
      : S.mode === 'awake' ? 'listen'
      : S.behavior === 'sleep' ? 'sleep'
      : S.behavior === 'sit' ? 'sit'
      : 'walk'
  );
  el.pet.className = 'pet state-' + cls + (settings && settings.hidden ? ' hidden-away' : '') +
                     (S.dir === -1 ? ' face-left' : '');
  el.earRing.classList.toggle('hidden', cls !== 'listen');
  el.zzz.classList.toggle('hidden', cls !== 'sleep');
}

function startBlinking() {
  const blink = () => {
    if (S.behavior !== 'sleep') {
      el.catWrap.classList.add('blinking');
      setTimeout(() => el.catWrap.classList.remove('blinking'), 200);
    }
    setTimeout(blink, rand(2800, 7000));
  };
  setTimeout(blink, 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 말풍선 / 토스트
// ─────────────────────────────────────────────────────────────────────────────
let bubbleTimer = null;

function say(text, holdMs) {
  clearTimeout(bubbleTimer);
  el.bubbleText.textContent = text;
  el.bubble.classList.remove('hidden');
  el.askBox.classList.toggle('with-bubble', S.askOpen);

  clampBubble();
  const dur = holdMs || Math.max(4000, Math.min(22000, text.length * 160));
  bubbleTimer = setTimeout(hideBubble, dur);
}

/** 화면 가장자리에서 말풍선이 잘리지 않도록 좌우로 밀어준다 */
function clampBubble() {
  const tail = document.getElementById('bubbleTail');
  el.bubble.style.transform = 'translateX(-50%)';
  if (tail) tail.style.left = '50%';

  const r = el.bubble.getBoundingClientRect();
  if (!r.width) return;

  const margin = 10;
  let shift = 0;
  if (r.left < margin) shift = margin - r.left;
  else if (r.right > window.innerWidth - margin) shift = (window.innerWidth - margin) - r.right;

  if (shift) {
    el.bubble.style.transform = `translateX(calc(-50% + ${Math.round(shift)}px))`;
    if (tail) tail.style.left = `calc(50% - ${Math.round(shift)}px)`;
  }
}

function thinking() {
  clearTimeout(bubbleTimer);
  el.bubbleText.innerHTML = '<span class="dots"><span>·</span><span>·</span><span>·</span></span>';
  el.bubble.classList.remove('hidden');
  clampBubble();
}

function hideBubble() {
  el.bubble.classList.add('hidden');
  el.askBox.classList.remove('with-bubble');
}

let toastTimer = null;
function showToast(html, opts) {
  clearTimeout(toastTimer);
  el.toast.innerHTML = html;
  if (opts && opts.button) {
    const b = document.createElement('button');
    b.className = 'toast-btn';
    b.textContent = opts.button;
    b.onclick = () => { hideToast(); opts.onClick && opts.onClick(); };
    el.toast.appendChild(document.createElement('br'));
    el.toast.appendChild(b);
  }
  el.toast.classList.remove('hidden');
  updateInteractive();
  toastTimer = setTimeout(hideToast, (opts && opts.button) ? 30000 : 9000);
}
function hideToast() {
  el.toast.classList.add('hidden');
  updateInteractive();
}

// ─────────────────────────────────────────────────────────────────────────────
// 마우스 클릭 통과 처리
// ─────────────────────────────────────────────────────────────────────────────
function bindInteraction() {
  document.addEventListener('mousemove', (e) => {
    S.pointer = { x: e.clientX, y: e.clientY };
    updateInteractive();
  });

  el.catWrap.addEventListener('click', () => {
    S.lastInteraction = Date.now();
    if (S.askOpen) { closeAsk(); return; }
    openAsk();
  });

  el.askSend.addEventListener('click', submitAsk);
  el.askInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAsk();
    if (e.key === 'Escape') closeAsk();
  });

  window.addEventListener('resize', () => {
    S.x = Math.min(S.x, window.innerWidth - CAT_WIDTH());
  });
}

function hitting(node) {
  if (!S.pointer || !node || node.classList.contains('hidden')) return false;
  const r = node.getBoundingClientRect();
  if (r.width === 0) return false;
  const { x, y } = S.pointer;
  return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4;
}

function updateInteractive() {
  const want = S.askOpen ||
               !el.toast.classList.contains('hidden') ||
               hitting(el.catWrap) ||
               hitting(el.bubble);
  if (want !== S.interactive) {
    S.interactive = want;
    window.nyangi.setInteractive(want);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 텍스트로 묻기
// ─────────────────────────────────────────────────────────────────────────────
function clampAsk() {
  el.askBox.style.transform = 'translateX(-50%)';
  const r = el.askBox.getBoundingClientRect();
  if (!r.width) return;
  const margin = 10;
  let shift = 0;
  if (r.left < margin) shift = margin - r.left;
  else if (r.right > window.innerWidth - margin) shift = (window.innerWidth - margin) - r.right;
  if (shift) el.askBox.style.transform = `translateX(calc(-50% + ${Math.round(shift)}px))`;
}

function openAsk() {
  S.askOpen = true;
  el.askBox.classList.remove('hidden');
  el.askBox.classList.toggle('with-bubble', !el.bubble.classList.contains('hidden'));
  el.askInput.value = '';
  clampAsk();
  updateInteractive();
  window.nyangi.focusWindow();
  setTimeout(() => el.askInput.focus(), 40);
  if (S.behavior === 'sleep') setBehavior('sit', 8000);
  paintState();
}

function closeAsk() {
  S.askOpen = false;
  el.askBox.classList.add('hidden');
  el.askInput.blur();
  updateInteractive();
}

async function submitAsk() {
  const text = el.askInput.value.trim();
  if (!text || S.busy) return;
  el.askInput.value = '';
  await respondTo(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// 대화
// ─────────────────────────────────────────────────────────────────────────────
async function respondTo(userText) {
  S.busy = true;
  S.lastInteraction = Date.now();
  paintState('think');
  thinking();

  const res = await window.nyangi.askText({ text: userText, history: S.history });
  S.busy = false;

  if (res.error) {
    handleAiError(res.error);
    return;
  }

  S.history.push({ role: 'user', text: userText });
  S.history.push({ role: 'model', text: res.reply });
  trimHistory();

  enterAwake();
  say(res.reply);
  speak(res.reply);
}

function trimHistory() {
  while (S.history.length > 16) S.history.shift();
}

function handleAiError(error) {
  paintState();
  if (error === 'NO_KEY') {
    showToast('Gemini API 키가 없어요. 설정에서 키를 넣어주세요.', {
      button: '설정 열기', onClick: () => window.nyangi.openSettings()
    });
    return;
  }
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(error)) {
    say('오늘은 제가 너무 많이 떠들었나 봐요. 조금 있다 다시 불러주세요.');
    return;
  }
  if (/API key|401|403|PERMISSION/i.test(error)) {
    showToast('API 키에 문제가 있는 것 같아요.', {
      button: '설정 열기', onClick: () => window.nyangi.openSettings()
    });
    return;
  }
  say('어라, 인터넷 연결이 잘 안 되나 봐요. 잠시 후에 다시 말씀해 주세요.');
  console.warn('[냥이] AI 오류:', error);
}

// ─────────────────────────────────────────────────────────────────────────────
// 대화 모드 (한 번 부르면 잠시 계속 듣는다)
// ─────────────────────────────────────────────────────────────────────────────
let awakeTimer = null;

function enterAwake() {
  S.mode = 'awake';
  configureVoiceForMode();
  paintState();
  clearTimeout(awakeTimer);
  awakeTimer = setTimeout(leaveAwake, 25000);
}

function leaveAwake() {
  S.mode = 'idle';
  S.history = [];
  configureVoiceForMode();
  if (!S.askOpen) paintState();
}

function configureVoiceForMode() {
  if (!window.Voice || !window.Voice.isRunning()) return;
  if (S.mode === 'awake') {
    window.Voice.configure({ maxSeconds: 12, silenceFrames: 14, minSeconds: 0.4 });
  } else {
    window.Voice.configure({ maxSeconds: 5, silenceFrames: 9, minSeconds: 0.35 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 음성
// ─────────────────────────────────────────────────────────────────────────────
async function restartVoice() {
  window.Voice.stop();
  if (!settings.voiceEnabled) return;

  const r = await window.Voice.start({
    threshold: Number(settings.micSensitivity) || 0.035
  });

  if (!r.ok) {
    showToast('🎤 ' + r.error, { button: '설정 열기', onClick: () => window.nyangi.openSettings() });
    return;
  }

  configureVoiceForMode();
  window.Voice.onUtterance = handleUtterance;
}

async function handleUtterance(u) {
  if (S.busy) return;
  if (settings.hidden) return;

  // ── 대화 중이면 바로 질문으로 처리 ─────────────────────────────────────
  if (S.mode === 'awake') {
    S.busy = true;
    paintState('think');
    thinking();

    const res = await window.nyangi.askAudio({
      audioBase64: u.base64, mimeType: u.mimeType, history: S.history
    });
    S.busy = false;

    if (res.error) { handleAiError(res.error); return; }

    // 알아듣지 못한 경우엔 대화 기록에 남기지 않는다
    const heard = (res.transcript || '').trim();
    if (heard && !/알아들을 수 없음/.test(heard)) {
      S.history.push({ role: 'user', text: heard });
      S.history.push({ role: 'model', text: res.reply });
      trimHistory();
    }

    enterAwake();
    say(res.reply);
    speak(res.reply);
    return;
  }

  // ── 평소에는 "야옹아"인지만 싸게 확인 ─────────────────────────────────
  if (u.seconds > 3.5 || u.truncated) return;   // 호출어 치고는 너무 긴 말
  if (!allowWakeCall()) return;                 // 사용량 보호

  const res = await window.nyangi.wakeCheck({ audioBase64: u.base64, mimeType: u.mimeType });
  if (res.error === 'NO_KEY') return;
  if (!res.woke) return;

  // 불렸다!
  S.lastInteraction = Date.now();
  enterAwake();
  setBehavior('sit', 20000);
  const greet = pick([
    '네~ 부르셨어요?',
    '야옹! 저 여기 있어요.',
    '네! 무슨 일이세요?',
    '불렀어요? 말씀하세요~',
    '왜요 왜요? 무슨 일이에요?',
    '넵! 듣고 있어요.'
  ]);
  say(greet, 7000);
  speak(greet);
}

/** 1분에 12번까지만 호출어 판정을 보낸다 (조용한 집에서는 훨씬 적게 쓰인다) */
function allowWakeCall() {
  const now = Date.now();
  S.wakeCalls = S.wakeCalls.filter(t => now - t < 60000);
  if (S.wakeCalls.length >= 12) return false;
  S.wakeCalls.push(now);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 소리내어 말하기 (윈도우 내장 한국어 목소리 사용)
// ─────────────────────────────────────────────────────────────────────────────
let voicesCache = [];
function loadVoices() {
  voicesCache = window.speechSynthesis.getVoices() || [];
}
loadVoices();
if (typeof window.speechSynthesis !== 'undefined') {
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function pickKoreanVoice() {
  if (!voicesCache.length) loadVoices();
  if (settings && settings.voiceURI) {
    const chosen = voicesCache.find(v => v.voiceURI === settings.voiceURI);
    if (chosen) return chosen;
  }
  return voicesCache.find(v => /ko[-_]KR/i.test(v.lang)) ||
         voicesCache.find(v => /korean|한국/i.test(v.name)) ||
         null;
}

function speak(text) {
  if (!settings || !settings.speakReplies) { flashTalking(text); return; }
  if (typeof window.speechSynthesis === 'undefined') { flashTalking(text); return; }

  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(stripForSpeech(text));
    u.lang = 'ko-KR';
    u.rate = Number(settings.speechRate) || 1.0;
    u.pitch = Number(settings.speechPitch) || 1.2;
    const v = pickKoreanVoice();
    if (v) u.voice = v;

    u.onstart = () => { window.Voice.setMuted(true); paintState('talk'); };
    u.onend = () => { window.Voice.setMuted(false); paintState(); };
    u.onerror = () => { window.Voice.setMuted(false); paintState(); };

    window.speechSynthesis.speak(u);
  } catch (err) {
    console.warn('[냥이] 읽어주기 실패:', err);
    flashTalking(text);
  }
}

/** 소리를 못 낼 때도 입은 움직이게 */
function flashTalking(text) {
  paintState('talk');
  setTimeout(() => paintState(), Math.min(6000, 600 + text.length * 70));
}

function stripForSpeech(s) {
  return String(s).replace(/[()\[\]{}<>"'`*_#]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 가끔 먼저 말 걸기
// ─────────────────────────────────────────────────────────────────────────────
const CHATTER = [
  '아 심심해요. 저 여기서 발만 핥고 있었어요.',
  '방금 낮잠 자다가 깼어요. 꿈에서 참치를 세 마리나 먹었는데 아쉬워요.',
  '저 아까부터 여기 왔다 갔다 하는 거 보셨어요? 못 보셨죠.',
  '심심한데 끝말잇기 하실래요? 제가 먼저 할게요. 고양이!',
  '갑자기 궁금한데요, 좋아하시는 노래 뭐예요?',
  '저는 오늘 하루 종일 걸어다녔어요. 만 보는 걸은 것 같아요.',
  '사람들은 왜 화면을 그렇게 오래 봐요? 저는 세 줄 읽으면 졸린데.',
  '저 이름 마음에 드세요? 아니면 바꿔주셔도 괜찮아요.',
  '심심하면 저 부르세요. 저는 항상 한가해요.',
  '어릴 때 제일 좋아하던 간식이 뭐였어요? 갑자기 궁금해졌어요.'
];

function scheduleIdleChatter() {
  const base = Math.max(10, Number(settings && settings.idleChatterMinutes) || 45);
  // 매번 조금씩 다른 간격으로 (기계처럼 규칙적이면 고양이 같지 않다)
  const wait = (base * 0.7 + Math.random() * base * 0.6) * 60 * 1000;
  setTimeout(() => {
    if (settings && settings.idleChatter && !settings.hidden &&
        S.mode === 'idle' && !S.busy && !S.askOpen &&
        Date.now() - S.lastInteraction > Math.min(15, base * 0.5) * 60 * 1000) {
      setBehavior('sit', 10000);
      const line = pick(CHATTER);
      say(line, 9000);
      speak(line);
    }
    scheduleIdleChatter();
  }, wait);
}

// ─────────────────────────────────────────────────────────────────────────────
// 트레이에서 "불러오기"
// ─────────────────────────────────────────────────────────────────────────────
function summon() {
  S.x = Math.round(window.innerWidth / 2 - CAT_WIDTH() / 2);
  S.dir = 1;
  setBehavior('sit', 15000);
  openAsk();
  const line = '네! 무엇을 도와드릴까요?';
  say(line, 7000);
  speak(line);
  enterAwake();
}

// ─────────────────────────────────────────────────────────────────────────────
function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

init();
