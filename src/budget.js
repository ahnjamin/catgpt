'use strict';

/**
 * 하루에 보낼 수 있는 웨이크워드 판정 횟수를 센다.
 *
 * 왜 필요한가: TV 소리가 계속 나는 방에서는 렌더러의 분당 상한(12회)에 계속 걸려
 * 시간당 700회 넘게 나갈 수 있다. 무료 한도를 하루 만에 태우면 고양이가
 * 이유도 없이 대답을 못 하게 된다.
 *
 * 앱을 껐다 켜면 초기화된다. 일부러 파일에 저장하지 않는다 —
 * 이건 안전장치이지 과금 장부가 아니고, 어머니가 앱을 다시 켰다는 건
 * 쓰고 싶다는 뜻이기 때문이다.
 */
function createBudget(limit, clock) {
  const now = clock || (() => new Date());
  let day = null;
  let used = 0;

  return {
    /** 한 번 쓸 수 있으면 true. 상한을 넘었으면 false. */
    take() {
      const today = dayKey(now());
      if (today !== day) { day = today; used = 0; }
      if (used >= limit) return false;
      used++;
      return true;
    },
    get used() { return used; },
    get limit() { return limit; }
  };
}

/**
 * 현지 시간 기준 날짜 키. UTC로 자르면 한국에서는 오전 9시에 초기화된다.
 *
 * 구글의 RPD 는 태평양 시간 자정에 초기화되므로 우리와 시점이 다르다.
 * 맞추지 않는다 — 이건 구글 계량기의 사본이 아니라 그보다 낮은 자체 바닥이고,
 * 어느 쪽 자정이 먼저 오든 한도 안에 있으면 된다.
 */
function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

module.exports = { createBudget, dayKey };
