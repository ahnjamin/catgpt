'use strict';

/**
 * 고양이 그림 (SVG).
 * 나중에 사진 기반 그림으로 바꾸고 싶으면 SKINS에 팔레트를 추가하거나,
 * 설정에서 customSkinPath 에 PNG 경로를 넣으면 그 이미지를 대신 쓴다.
 */

const SKINS = {
  ginger: {   // 치즈 태비 (기본)
    label: '치즈',
    fur: '#F2A65A', furDark: '#DC8B3E', belly: '#FFE6C7',
    stripe: '#C9752F', ear: '#F7B9A4', nose: '#E4776B', eye: '#3C6E47'
  },
  tuxedo: {   // 턱시도 (검정+흰색)
    label: '턱시도',
    fur: '#3A3A42', furDark: '#26262C', belly: '#F6F4F0',
    stripe: '#2C2C33', ear: '#C98C88', nose: '#D96A78', eye: '#D9B44A'
  },
  gray: {     // 회색 고등어
    label: '고등어',
    fur: '#9AA5B1', furDark: '#7C8894', belly: '#E8EDF2',
    stripe: '#6B7683', ear: '#D8A6A2', nose: '#C9707E', eye: '#6FA8C9'
  },
  cream: {    // 크림색
    label: '크림',
    fur: '#F3DCC0', furDark: '#DFC29E', belly: '#FFF6E9',
    stripe: '#D2AE85', ear: '#F0B7AE', nose: '#D98B84', eye: '#8FA96B'
  }
};

let uid = 0;

/**
 * @param {string} skinName  SKINS 의 키
 * @returns {string} SVG 문자열 (한 페이지에 여러 개 그려도 서로 간섭하지 않는다)
 */
function buildCatSVG(skinName) {
  const c = SKINS[skinName] || SKINS.ginger;
  const g = 'bodyGrad' + (++uid);   // 그라데이션 id는 매번 달라야 한다

  return `
<svg class="catSvg" viewBox="0 0 140 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="${g}" cx="40%" cy="30%" r="78%">
      <stop offset="0%"  stop-color="${c.fur}"/>
      <stop offset="100%" stop-color="${c.furDark}"/>
    </radialGradient>
  </defs>

  <!-- 바닥 그림자 -->
  <ellipse class="shadow" cx="66" cy="93" rx="37" ry="5"/>

  <!-- 꼬리 -->
  <g class="tail-group">
    <path class="tail" d="M28 56 C 6 54, 2 32, 15 22 C 20 18, 27 20, 26 26 C 25 32, 17 32, 17 39 C 17 48, 27 50, 34 51 Z"
          fill="${c.fur}" stroke="${c.furDark}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M13 27 C 17 22, 21 22, 24 24" stroke="${c.stripe}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".6"/>
  </g>

  <!-- 먼 쪽 다리 (몸통 뒤에 깔린다) -->
  <g class="leg leg-back-far"><rect x="39" y="55" width="9" height="33" rx="4.5" fill="${c.furDark}"/></g>
  <g class="leg leg-front-far"><rect x="75" y="55" width="9" height="33" rx="4.5" fill="${c.furDark}"/></g>

  <!-- 몸통 -->
  <g class="body-group">
    <ellipse class="body" cx="60" cy="50" rx="33" ry="21" fill="url(#${g})" stroke="${c.furDark}" stroke-width="1.5"/>
    <ellipse cx="62" cy="58" rx="24" ry="12" fill="${c.belly}" opacity=".9"/>
    <path d="M44 33 q 4 8 0 15"  stroke="${c.stripe}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/>
    <path d="M56 30 q 4 9 0 17"  stroke="${c.stripe}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/>
    <path d="M68 31 q 4 9 0 16"  stroke="${c.stripe}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/>
  </g>

  <!-- 가까운 쪽 다리 -->
  <g class="leg leg-back-near"><rect x="48" y="56" width="10" height="32" rx="5" fill="${c.fur}" stroke="${c.furDark}" stroke-width="1.2"/></g>
  <g class="leg leg-front-near"><rect x="83" y="56" width="10" height="32" rx="5" fill="${c.fur}" stroke="${c.furDark}" stroke-width="1.2"/></g>

  <!-- 머리 -->
  <g class="head-group">
    <!-- 귀 -->
    <g class="ear ear-l">
      <path d="M78 28 L 80 5 L 96 20 Z" fill="${c.fur}" stroke="${c.furDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M82 24 L 83 11 L 91 21 Z" fill="${c.ear}"/>
    </g>
    <g class="ear ear-r">
      <path d="M104 24 L 117 7 L 118 28 Z" fill="${c.fur}" stroke="${c.furDark}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M106 23 L 114 14 L 115 26 Z" fill="${c.ear}"/>
    </g>

    <!-- 얼굴 -->
    <ellipse class="face" cx="99" cy="36" rx="23" ry="20" fill="${c.fur}" stroke="${c.furDark}" stroke-width="1.5"/>
    <path d="M88 18 q 4 7 0 12" stroke="${c.stripe}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".5"/>
    <path d="M99 16 q 3 7 0 12" stroke="${c.stripe}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".5"/>
    <path d="M110 18 q 3 7 0 12" stroke="${c.stripe}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".5"/>

    <!-- 눈 -->
    <g class="eyes">
      <g class="eye eye-l">
        <ellipse class="eyeball" cx="92" cy="37" rx="5.4" ry="6" fill="#FFFFFF"/>
        <ellipse class="pupil"  cx="92" cy="37" rx="3"   ry="5"   fill="${c.eye}"/>
        <ellipse class="pupil-slit" cx="92" cy="37" rx="1.2" ry="4.4" fill="#1B1B22"/>
        <circle  class="glint"  cx="90.3" cy="34.8" r="1.4" fill="#fff" opacity=".9"/>
      </g>
      <g class="eye eye-r">
        <ellipse class="eyeball" cx="108" cy="37" rx="5.4" ry="6" fill="#FFFFFF"/>
        <ellipse class="pupil"  cx="108" cy="37" rx="3"   ry="5"   fill="${c.eye}"/>
        <ellipse class="pupil-slit" cx="108" cy="37" rx="1.2" ry="4.4" fill="#1B1B22"/>
        <circle  class="glint"  cx="106.3" cy="34.8" r="1.4" fill="#fff" opacity=".9"/>
      </g>
    </g>

    <!-- 감은 눈 (잠잘 때만 보임) -->
    <g class="eyes-closed">
      <path d="M87 38 q 5 4 10 0" stroke="${c.furDark}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M103 38 q 5 4 10 0" stroke="${c.furDark}" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>

    <!-- 코와 입 -->
    <path class="nose" d="M97 46 L 103 46 L 100 49.5 Z" fill="${c.nose}"/>
    <path class="mouth" d="M100 49.5 q -4 4 -7 1 M100 49.5 q 4 4 7 1"
          stroke="${c.furDark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>

    <!-- 수염 -->
    <g class="whiskers" stroke="${c.furDark}" stroke-width="1.1" opacity=".55" stroke-linecap="round">
      <path d="M118 42 L 133 39"/>
      <path d="M118 46 L 134 47"/>
      <path d="M82 42 L 67 39"/>
      <path d="M82 46 L 66 47"/>
    </g>

    <!-- 볼 홍조 (말할 때 살짝) -->
    <ellipse class="blush blush-l" cx="86" cy="46" rx="4.5" ry="2.8" fill="${c.nose}" opacity="0"/>
    <ellipse class="blush blush-r" cx="114" cy="46" rx="4.5" ry="2.8" fill="${c.nose}" opacity="0"/>
  </g>
</svg>`.trim();
}

window.CatArt = { SKINS, buildCatSVG };
