'use strict';

/**
 * 손으로 돌리는 최소 점검.  실행:  npm test
 *
 * 일렉트론이 필요 없는 순수 로직만 본다.
 * (창·마이크·TTS 는 실제로 띄워 봐야 알 수 있어서 여기서 다루지 않는다)
 */

const assert = require('node:assert');
const { createBudget, dayKey } = require('../src/budget');
const gemini = require('../src/gemini');

// ── 하루 상한 ──────────────────────────────────────────────────────────────
{
  let now = new Date('2026-09-18T10:00:00');
  const b = createBudget(3, () => now);

  assert.ok(b.take() && b.take() && b.take(), '상한까지는 통과해야 한다');
  assert.equal(b.take(), false, '상한을 넘으면 막아야 한다');
  assert.equal(b.used, 3);

  // 날짜가 바뀌면 초기화
  now = new Date('2026-09-19T00:05:00');
  assert.equal(b.take(), true, '자정을 넘기면 다시 쓸 수 있어야 한다');
  assert.equal(b.used, 1);

  // 같은 날 오전 9시(UTC 자르기의 함정)에는 초기화되면 안 된다
  now = new Date('2026-09-19T09:30:00');
  assert.ok(b.take());
  assert.equal(b.used, 2, '한국 시간 오전 9시에 초기화되면 안 된다');

  assert.notEqual(dayKey(new Date('2026-09-18T23:59:59')),
                  dayKey(new Date('2026-09-19T00:00:01')));
}

// ── 음성 응답 파싱 ─────────────────────────────────────────────────────────
{
  const ok = gemini.parseTranscriptAndReply('들은말: 오늘 뭐 했어\n대답: 낮잠 잤어요!');
  assert.equal(ok.transcript, '오늘 뭐 했어');
  assert.equal(ok.reply, '낮잠 잤어요!');

  // 전각 콜론도 받아야 한다 (한글 입력기에서 자주 나온다)
  const full = gemini.parseTranscriptAndReply('들은말： 안녕\n대답： 안녕하세요');
  assert.equal(full.transcript, '안녕');

  // 형식을 안 지키면 전체를 대답으로 본다 (말풍선이 비는 것보다 낫다)
  assert.equal(gemini.parseTranscriptAndReply('그냥 대답만 함').reply, '그냥 대답만 함');

  // 마크다운 기호는 읽어주기 전에 떨어져야 한다
  assert.equal(gemini.parseTranscriptAndReply('대답: **안녕** 하세요').reply, '안녕 하세요');
}

// ── 모델 폴백 순서 ─────────────────────────────────────────────────────────
{
  const chain = gemini.modelChain('내모델', ['a', 'b'], 'chat');
  assert.deepEqual(chain, ['내모델', 'a', 'b']);
  assert.equal(new Set(gemini.modelChain('a', ['a', 'b'], 'chat')).size, 2, '중복이 없어야 한다');

  // 성공한 모델을 기억하면 그게 맨 앞으로 온다 (매번 404 왕복을 하지 않도록)
  gemini._resolved.chat = 'b';
  assert.deepEqual(gemini.modelChain('내모델', ['a', 'b'], 'chat'), ['b', '내모델', 'a']);
  gemini._resolved.chat = null;
}

console.log('점검 통과 🐱');
