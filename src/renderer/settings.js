'use strict';

const $ = (id) => document.getElementById(id);
let S = null;
let saveTimer = null;
let pending = {};

// 바뀌면 바로 저장 (입력 중에는 살짝 기다렸다가 모아서 한 번에)
function save(patch, immediate) {
  S = { ...S, ...patch };
  pending = { ...pending, ...patch };
  clearTimeout(saveTimer);
  const go = () => {
    const p = pending;
    pending = {};
    window.nyangi.setSettings(p);
  };
  if (immediate) go(); else saveTimer = setTimeout(go, 350);
}

async function init() {
  S = await window.nyangi.getSettings();
  $('version').textContent = '버전 ' + (S.appVersion || '1.0.0') + ' · 설정은 자동으로 저장됩니다';
  $('logo').innerHTML = window.CatArt.buildCatSVG(S.skin);

  // ── 1. API 키 ──────────────────────────────────────────────────────────
  $('apiKey').value = S.apiKey || '';
  $('apiKey').addEventListener('input', (e) => {
    save({ apiKey: e.target.value.trim() });
    $('testResult').textContent = '';
  });
  $('toggleKey').addEventListener('click', () => {
    const f = $('apiKey');
    f.type = f.type === 'password' ? 'text' : 'password';
  });
  $('keyLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.nyangi.openExternal('https://aistudio.google.com/apikey');
  });
  $('testKey').addEventListener('click', async () => {
    const r = $('testResult');
    r.className = 'result';
    r.textContent = '확인하는 중…';
    await window.nyangi.setSettings({ apiKey: $('apiKey').value.trim() });
    const res = await window.nyangi.testKey($('apiKey').value.trim());
    if (res.ok) {
      r.className = 'result ok';
      r.textContent = '✔ 연결 성공! 이제 냥이와 이야기할 수 있어요.';
    } else {
      r.className = 'result bad';
      r.textContent = '✖ ' + shortError(res.error);
    }
  });

  // ── 2. 고양이 ──────────────────────────────────────────────────────────
  bindText('catName');
  bindText('ownerName');
  bindText('persona');

  const skins = $('skins');
  Object.keys(window.CatArt.SKINS).forEach((name) => {
    const d = document.createElement('div');
    d.className = 'skin' + (S.skin === name ? ' on' : '');
    d.dataset.skin = name;
    d.innerHTML = window.CatArt.buildCatSVG(name);
    d.addEventListener('click', () => {
      [...skins.children].forEach(c => c.classList.remove('on'));
      d.classList.add('on');
      save({ skin: name }, true);
      $('logo').innerHTML = window.CatArt.buildCatSVG(name);
    });
    skins.appendChild(d);
  });

  bindRange('scale', 'scaleVal', v => '×' + Number(v).toFixed(1));
  bindRange('fontScale', 'fontScaleVal', v => {
    const n = Number(v);
    return n <= 1.05 ? '보통' : n >= 1.65 ? '아주 크게' : n >= 1.35 ? '크게' : '조금 크게';
  });

  // ── 3. 목소리 ──────────────────────────────────────────────────────────
  bindCheck('voiceEnabled');
  bindCheck('speakReplies');
  bindRange('micSensitivity', 'sensVal', v => {
    const n = Number(v);
    return n <= 0.025 ? '예민함' : n >= 0.06 ? '둔감함' : '보통';
  }, () => updateMeterMark());
  bindRange('speechRate', 'rateVal', v => '×' + Number(v).toFixed(2));
  bindRange('speechPitch', 'pitchVal', v => '×' + Number(v).toFixed(2));

  fillVoices();
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.onvoiceschanged = fillVoices;
  }
  $('voiceURI').addEventListener('change', (e) => save({ voiceURI: e.target.value }, true));
  $('speakTest').addEventListener('click', testSpeak);
  $('micTest').addEventListener('click', toggleMicTest);

  // ── 4. 기타 ────────────────────────────────────────────────────────────
  bindCheck('autoLaunch');
  bindCheck('hidden');

  // 먼저 말 거는 빈도: 0 을 고르면 아예 끈다
  const freq = $('chatterFreq');
  freq.value = S.idleChatter ? String(S.idleChatterMinutes || 45) : '0';
  if (!Array.from(freq.options).some(o => o.value === freq.value)) freq.value = '45';
  freq.addEventListener('change', (e) => {
    const m = Number(e.target.value);
    save(m === 0 ? { idleChatter: false } : { idleChatter: true, idleChatterMinutes: m }, true);
  });

  $('close').addEventListener('click', () => window.close());
  updateMeterMark();
}

function bindText(id) {
  const n = $(id);
  n.value = S[id] || '';
  n.addEventListener('input', (e) => save({ [id]: e.target.value }));
}

function bindCheck(id) {
  const n = $(id);
  n.checked = !!S[id];
  n.addEventListener('change', (e) => save({ [id]: e.target.checked }, true));
}

function bindRange(id, valId, fmt, extra) {
  const n = $(id);
  n.value = S[id];
  $(valId).textContent = fmt(n.value);
  n.addEventListener('input', (e) => {
    $(valId).textContent = fmt(e.target.value);
    save({ [id]: Number(e.target.value) });
    if (extra) extra();
  });
}

function shortError(e) {
  const s = String(e || '');
  if (/API key not valid|API_KEY_INVALID|401|403/i.test(s)) return '키가 올바르지 않아요. 다시 붙여넣어 보세요.';
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(s)) return '오늘 사용량을 다 썼어요. 내일 다시 해보세요.';
  if (/fetch|network|ENOTFOUND|timeout|abort/i.test(s)) return '인터넷 연결을 확인해 주세요.';
  return s.slice(0, 120);
}

// ── TTS 목소리 ───────────────────────────────────────────────────────────
function fillVoices() {
  const sel = $('voiceURI');
  const voices = (speechSynthesis.getVoices() || []);
  const ko = voices.filter(v => /ko[-_]KR/i.test(v.lang) || /korean|한국/i.test(v.name));
  const list = ko.length ? ko : voices;

  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = ko.length ? '자동 (한국어 목소리)' : '자동';
  sel.appendChild(auto);

  list.forEach(v => {
    const o = document.createElement('option');
    o.value = v.voiceURI;
    o.textContent = v.name + (/ko[-_]KR/i.test(v.lang) ? '' : ` (${v.lang})`);
    sel.appendChild(o);
  });
  sel.value = S.voiceURI || '';

  if (!ko.length && voices.length && !document.getElementById('noKoVoice')) {
    $('speakTest').insertAdjacentHTML('afterend',
      '<p id="noKoVoice" class="help small" style="color:#D2544B">한국어 목소리가 없어요. 윈도우 [설정] → [시간 및 언어] → [음성]에서 한국어 음성을 추가해 주세요.</p>');
  }
  const warn = document.getElementById('noKoVoice');
  if (warn && ko.length) warn.remove();
}

function testSpeak() {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance('안녕하세요! 저는 ' + ($('catName').value || '냥이') + '예요. 잘 부탁드려요.');
  u.lang = 'ko-KR';
  u.rate = Number($('speechRate').value);
  u.pitch = Number($('speechPitch').value);
  const chosen = (speechSynthesis.getVoices() || []).find(v => v.voiceURI === $('voiceURI').value);
  if (chosen) u.voice = chosen;
  speechSynthesis.speak(u);
}

// ── 마이크 확인 ──────────────────────────────────────────────────────────
let micCtx = null, micStream = null, micProc = null, micSrc = null;

function updateMeterMark() {
  const v = Number($('micSensitivity').value);
  // 막대는 0 ~ 0.18 범위를 표시한다
  $('meterMark').style.left = Math.min(99, (v / 0.18) * 100) + '%';
}

async function toggleMicTest() {
  if (micCtx) { stopMicTest(); return; }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    micCtx = new AudioContext();
    micSrc = micCtx.createMediaStreamSource(micStream);
    micProc = micCtx.createScriptProcessor(2048, 1, 1);
    micProc.onaudioprocess = (e) => {
      const b = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
      const rms = Math.sqrt(sum / b.length);
      $('meterFill').style.width = Math.min(100, (rms / 0.18) * 100) + '%';
    };
    const g = micCtx.createGain(); g.gain.value = 0;
    micSrc.connect(micProc); micProc.connect(g); g.connect(micCtx.destination);
    $('micTest').textContent = '확인 끝내기';
  } catch (err) {
    alert('마이크를 켤 수 없습니다.\n\n윈도우 [설정] → [개인 정보 및 보안] → [마이크]에서\n"데스크톱 앱이 마이크에 액세스하도록 허용"을 켜 주세요.\n\n(' + err.name + ')');
    stopMicTest();
  }
}

function stopMicTest() {
  try { if (micProc) { micProc.onaudioprocess = null; micProc.disconnect(); } } catch (_) {}
  try { if (micSrc) micSrc.disconnect(); } catch (_) {}
  try { if (micStream) micStream.getTracks().forEach(t => t.stop()); } catch (_) {}
  try { if (micCtx) micCtx.close(); } catch (_) {}
  micProc = micSrc = micStream = micCtx = null;
  $('meterFill').style.width = '0%';
  $('micTest').textContent = '마이크 확인';
}

window.addEventListener('beforeunload', stopMicTest);

init();
