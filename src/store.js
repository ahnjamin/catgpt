'use strict';

/**
 * 아주 단순한 설정 저장소.
 * 외부 패키지 없이 userData 폴더의 settings.json 파일 하나만 쓴다.
 *   Windows: C:\Users\<이름>\AppData\Roaming\Nyangi\settings.json
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = {
  // ── 연결 ──────────────────────────────────────────────
  apiKey: '',                       // Google AI Studio에서 받은 Gemini API 키
  model: 'gemini-3.5-flash',        // 대화용 모델
  wakeModel: 'gemini-3.5-flash-lite', // "야옹아" 판정용 (싸고 빠른 모델)

  // ── 고양이 ────────────────────────────────────────────
  catName: '냥이',
  ownerName: '',                    // 예: "할머니" — 비우면 "주인님"
  persona: '',                      // 추가 성격 설정 (자유 입력)
  skin: 'ginger',                   // ginger | tuxedo | gray | custom
  customSkinPath: '',               // 사진 기반 커스텀 이미지(선택)
  scale: 1.0,                       // 고양이 크기 배율
  hidden: false,                    // 화면에서 잠시 숨기기

  // ── 음성 ──────────────────────────────────────────────
  voiceEnabled: true,
  wakeWord: '야옹아',
  micSensitivity: 0.035,            // 0.01(예민) ~ 0.08(둔감)
  speakReplies: true,               // 대답을 소리내어 읽기
  speechRate: 1.0,
  speechPitch: 1.25,                // 살짝 높은 톤 = 고양이 느낌
  voiceURI: '',                     // 사용할 TTS 목소리 (비우면 자동)

  // ── 기타 ──────────────────────────────────────────────
  autoLaunch: true,
  idleChatter: true,                // 가끔 먼저 말 걸기
  idleChatterMinutes: 45            // 20=자주, 45=보통, 90=가끔
};

let cache = null;
let filePath = null;

function resolvePath() {
  if (!filePath) filePath = path.join(app.getPath('userData'), 'settings.json');
  return filePath;
}

function init() {
  const p = resolvePath();
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      cache = { ...DEFAULTS, ...raw };
    } else {
      cache = { ...DEFAULTS };
      persist();
    }
  } catch (err) {
    console.error('[냥이] 설정을 읽지 못해 기본값으로 시작합니다:', err.message);
    cache = { ...DEFAULTS };
  }
  return cache;
}

function get() {
  if (!cache) init();
  return { ...cache };
}

function set(patch) {
  if (!cache) init();
  cache = { ...cache, ...(patch || {}) };
  persist();
  return { ...cache };
}

function persist() {
  try {
    const p = resolvePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('[냥이] 설정을 저장하지 못했습니다:', err.message);
  }
}

module.exports = { init, get, set, DEFAULTS };
