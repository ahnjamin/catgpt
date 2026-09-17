'use strict';

/**
 * Gemini REST 클라이언트 (외부 패키지 없음, Node 내장 fetch 사용)
 *
 * 공식 엔드포인트:
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   헤더: x-goog-api-key: <API 키>
 *
 * 응답에서 텍스트는 candidates[0].content.parts[*].text 에 들어온다.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 30000;

/** 모델이 없거나 이름이 바뀌었을 때 순서대로 시도할 후보들 */
const FALLBACK_CHAT = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];
const FALLBACK_WAKE = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash'
];

function modelChain(preferred, fallbacks) {
  const list = [];
  if (preferred) list.push(preferred);
  for (const m of fallbacks) if (!list.includes(m)) list.push(m);
  return list;
}

async function rawCall(model, apiKey, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* 파싱 실패 */ }

    if (!res.ok) {
      const msg = (json && json.error && json.error.message) || text.slice(0, 300);
      const err = new Error(msg || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function extractText(json) {
  const cand = json && json.candidates && json.candidates[0];
  if (!cand) {
    const block = json && json.promptFeedback && json.promptFeedback.blockReason;
    if (block) throw new Error(`응답이 차단되었습니다 (${block})`);
    throw new Error('빈 응답을 받았습니다.');
  }
  const parts = (cand.content && cand.content.parts) || [];
  const out = parts.map(p => (typeof p.text === 'string' ? p.text : '')).join('').trim();
  if (!out) {
    if (cand.finishReason && cand.finishReason !== 'STOP') {
      throw new Error(`대답이 완성되지 못했습니다 (${cand.finishReason})`);
    }
    throw new Error('대답이 비어 있습니다.');
  }
  return out;
}

/**
 * 모델 후보를 차례로 시도하고, thinkingConfig 같은 미지원 필드는 떼고 재시도한다.
 */
async function callWithFallback({ apiKey, models, body }) {
  if (!apiKey) throw new Error('API 키가 없습니다.');
  let lastErr = null;

  for (const model of models) {
    // 1차: 그대로
    try {
      return await rawCall(model, apiKey, body);
    } catch (err) {
      lastErr = err;
      const msg = String(err.message || '');

      // 미지원 필드(thinkingConfig 등) 때문이면 떼고 한 번 더
      if (err.status === 400 && /thinking|unknown name|Unknown field|Invalid JSON payload/i.test(msg)) {
        const stripped = JSON.parse(JSON.stringify(body));
        if (stripped.generationConfig) delete stripped.generationConfig.thinkingConfig;
        try {
          return await rawCall(model, apiKey, stripped);
        } catch (err2) {
          lastErr = err2;
        }
      }

      // 모델이 없으면 다음 후보로
      if (err.status === 404 || /not found|not supported|is not available/i.test(msg)) continue;

      // 키가 잘못됐거나 권한 문제면 후보를 더 돌려도 소용없다
      if (err.status === 401 || err.status === 403) throw err;

      // 그 외(429, 500 등)는 다음 후보로 한 번 더
      continue;
    }
  }
  throw lastErr || new Error('요청에 실패했습니다.');
}

function historyToContents(history) {
  // history: [{ role: 'user'|'model', text: '...' }, ...]
  return (history || [])
    .filter(h => h && typeof h.text === 'string' && h.text.trim())
    .slice(-12) // 최근 12턴만 기억 (토큰 절약)
    .map(h => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: h.text }]
    }));
}

/** 텍스트 질문 → 텍스트 대답 */
async function ask({ apiKey, model, system, history, userText }) {
  const body = {
    systemInstruction: { parts: [{ text: system || '' }] },
    contents: [
      ...historyToContents(history),
      { role: 'user', parts: [{ text: userText }] }
    ],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 400,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };
  const json = await callWithFallback({
    apiKey,
    models: modelChain(model, FALLBACK_CHAT),
    body
  });
  return extractText(json);
}

/**
 * 음성 질문 → 받아쓴 내용 + 대답
 * 한 번의 호출로 끝내기 위해 아주 단순한 구분자 형식을 쓴다.
 */
async function askWithAudio({ apiKey, model, system, history, audioBase64, mimeType }) {
  const instruction = [
    '아래 음성은 주인이 너에게 한 말이야.',
    '먼저 들은 내용을 한국어로 그대로 받아쓰고, 그다음 줄부터 대답을 해.',
    '반드시 아래 형식을 정확히 지켜. 다른 말은 붙이지 마.',
    '',
    '들은말: (여기에 받아쓴 내용)',
    '대답: (여기에 네 대답)',
    '',
    '만약 말소리가 잘 들리지 않거나 알아들을 수 없으면',
    '들은말: (알아들을 수 없음)',
    '대답: 잘 못 들었어요. 한 번만 더 말씀해 주시겠어요?',
    '이렇게 답해.'
  ].join('\n');

  const body = {
    systemInstruction: { parts: [{ text: system || '' }] },
    contents: [
      ...historyToContents(history),
      {
        role: 'user',
        parts: [
          { text: instruction },
          { inlineData: { mimeType: mimeType || 'audio/webm', data: audioBase64 } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 500,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  const json = await callWithFallback({
    apiKey,
    models: modelChain(model, FALLBACK_CHAT),
    body
  });

  const raw = extractText(json);
  return parseTranscriptAndReply(raw);
}

function parseTranscriptAndReply(raw) {
  const t = raw.match(/들은말\s*[:：]\s*([\s\S]*?)(?:\n\s*대답\s*[:：]|$)/);
  const r = raw.match(/대답\s*[:：]\s*([\s\S]*)$/);
  const transcript = t ? t[1].trim() : '';
  const reply = r ? r[1].trim() : raw.trim();
  return { transcript, reply: cleanForSpeech(reply) };
}

/** 말풍선/TTS에 들어가면 어색한 기호들을 정리 */
function cleanForSpeech(s) {
  return String(s || '')
    .replace(/[*_#`>]/g, '')
    .replace(/^\s*[-•]\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 짧은 오디오 조각에 호출어("야옹아")가 들어 있는지 예/아니오로만 판정.
 * 토큰을 거의 쓰지 않도록 대답 길이를 최소로 묶는다.
 */
async function wakeCheck({ apiKey, model, audioBase64, mimeType, wakeWord }) {
  const word = wakeWord || '야옹아';
  const prompt = [
    `이 짧은 소리에 "${word}"라고 누군가를 부르는 말이 들어 있는지 판단해.`,
    `"${word}", "야옹", "냐옹", "나비야", "고양이야" 처럼 비슷하게 부르는 소리도 모두 포함해.`,
    '들어 있으면 Y, 없으면 N. 오직 한 글자만 답해. 설명 금지.'
  ].join('\n');

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mimeType || 'audio/webm', data: audioBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  const json = await callWithFallback({
    apiKey,
    models: modelChain(model, FALLBACK_WAKE),
    body
  });

  let out = '';
  try { out = extractText(json); } catch (_) { return false; }
  return /^\s*Y/i.test(out);
}

module.exports = { ask, askWithAudio, wakeCheck, cleanForSpeech };
