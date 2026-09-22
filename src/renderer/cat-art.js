'use strict';

/**
 * 고양이 그림 (SVG).
 *
 * 그림 방침
 *  - 150px 남짓으로 작게 보이는 그림이다. 디테일을 늘리면 뭉개져서 지저분해 보인다.
 *    실루엣을 굵게, 안쪽은 비우는 쪽이 항상 낫다.
 *  - 몸통·머리 윤곽선은 한 줄로 그린다 (도형을 겹치면 선이 안쪽에서 비쳐 지저분하다).
 *    무늬와 배는 clipPath 로 몸통 안에만 칠한다.
 *  - 머리를 몸통보다 크게 잡는다. 같은 크기면 어른 고양이처럼 보여서 안 귀엽다.
 *
 * pet.css 가 잡고 쓰는 클래스(바꾸면 애니메이션이 깨진다):
 *   shadow / tail-group / body-group / head-group / face
 *   leg + leg-back-far, leg-front-far, leg-back-near, leg-front-near
 *   ear + ear-l, ear-r / eyes / eye + eye-l, eye-r / eyes-closed
 *   mouth / blush
 *
 * 사진 기반 그림으로 바꾸고 싶으면 설정의 customSkinPath 에 PNG 경로를 넣으면 된다.
 */

const SKINS = {
  ginger: {   // 치즈 태비 (기본)
    label: '치즈',
    fur: '#F7A95C', furDark: '#E68E42', belly: '#FFF1DE',
    stripe: '#D2762B', ear: '#F9BBA8', nose: '#E8776B',
    eye: '#5A9E68', line: '#9C5A20'
  },
  tuxedo: {   // 턱시도 (검정+흰색)
    label: '턱시도',
    fur: '#474652', furDark: '#35343F', belly: '#FBF8F3',
    stripe: '#3A3944', ear: '#D2918C', nose: '#E0737F',
    eye: '#E8C158', line: '#1F1E27'
  },
  gray: {     // 회색 고등어
    label: '고등어',
    fur: '#A6B1BD', furDark: '#8A97A4', belly: '#EFF3F7',
    stripe: '#707D8B', ear: '#DDAEA9', nose: '#CE7480',
    eye: '#6FA8C9', line: '#4E5966'
  },
  cream: {    // 크림색
    label: '크림',
    fur: '#F6E1C8', furDark: '#E3C7A4', belly: '#FFFAF1',
    stripe: '#D6B38B', ear: '#F3BCB2', nose: '#DB8F87',
    eye: '#93AC6F', line: '#A9834F'
  }
};

// 실루엣 하나로 읽히도록 몸통과 머리는 같은 굵기의 선을 쓴다
const LINE_W = 2.2;

/** 몸통 실루엣. 뒤쪽(왼쪽)에 뒷다리 두덩을 만들어 고양이 옆모습처럼 보이게 한다. */
const BODY_PATH =
  'M 89 41 C 89 31, 78 26, 64 26 C 47 26, 33 30, 27 43 ' +
  'C 21 55, 25 68, 37 71 C 51 75, 75 74, 87 67 C 93 63, 93 49, 89 41 Z';

/** 꼬리. 끝이 말리면 고리가 생겨 도넛처럼 보이므로 위로 트인 S 곡선으로 둔다. */
const TAIL_PATH = 'M 36 55 C 24 58, 12 52, 11 40 C 10 30, 16 22, 24 21';

/** 머리. 둥근 사각형에 가깝게 — 완전한 타원은 밋밋하다. */
const FACE_PATH =
  'M 100 13 C 115 13, 127 24, 127 38 C 127 47, 122 54, 114 58 ' +
  'C 106 62, 94 62, 86 58 C 78 54, 73 47, 73 38 C 73 24, 85 13, 100 13 Z';

let uid = 0;

/** 캡슐 모양 다리 하나. 짧고 뭉툭해야 귀엽다 (가늘고 길면 곤충처럼 보인다). */
function leg(cls, x, c, far) {
  return `<g class="leg ${cls}"><rect x="${x}" y="63" width="13" height="26" rx="6.5"
    fill="${far ? c.furDark : c.fur}" stroke="${c.line}" stroke-width="${far ? 0 : LINE_W}"/></g>`;
}

/**
 * @param {string} skinName  SKINS 의 키
 * @returns {string} SVG 문자열 (한 페이지에 여러 개 그려도 서로 간섭하지 않는다)
 */
function buildCatSVG(skinName) {
  const c = SKINS[skinName] || SKINS.ginger;
  const n = ++uid;                 // id 는 매번 달라야 한다
  const clipBody = 'clipBody' + n;
  const clipFace = 'clipFace' + n;

  return `
<svg class="catSvg" viewBox="0 0 140 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <clipPath id="${clipBody}"><path d="${BODY_PATH}"/></clipPath>
    <clipPath id="${clipFace}"><path d="${FACE_PATH}"/></clipPath>
  </defs>

  <!-- 바닥 그림자 -->
  <ellipse class="shadow" cx="70" cy="92" rx="38" ry="5" fill="rgba(0,0,0,.18)"/>

  <!-- 꼬리: 굵은 선 두 겹(바깥=윤곽, 안=털색)으로 그리면 도형보다 깔끔하다 -->
  <g class="tail-group" fill="none" stroke-linecap="round">
    <path d="${TAIL_PATH}" stroke="${c.line}" stroke-width="13"/>
    <path d="${TAIL_PATH}" stroke="${c.fur}" stroke-width="9"/>
    <path d="M 5 46 L 15 44 M 8 33 L 18 30" stroke="${c.stripe}"
          stroke-width="3" opacity=".5"/>
  </g>

  <!-- 먼 쪽 다리 (몸통 뒤에 깔린다) -->
  ${leg('leg-back-far', 33, c, true)}
  ${leg('leg-front-far', 70, c, true)}

  <!-- 몸통 -->
  <g class="body-group">
    <path d="${BODY_PATH}" fill="${c.fur}" stroke="${c.line}" stroke-width="${LINE_W}" stroke-linejoin="round"/>
    <g clip-path="url(#${clipBody})">
      <ellipse cx="62" cy="70" rx="28" ry="13" fill="${c.belly}"/>
      <g stroke="${c.stripe}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".5">
        <path d="M 38 28 q 5 9 1 17"/>
        <path d="M 52 26 q 5 10 1 18"/>
        <path d="M 66 26 q 5 10 1 18"/>
      </g>
    </g>
  </g>

  <!-- 가까운 쪽 다리 -->
  ${leg('leg-back-near', 44, c)}
  ${leg('leg-front-near', 80, c)}

  <!-- 머리 -->
  <g class="head-group">
    <!-- 귀: 끝을 둥글린 세모. 뾰족하면 작게 볼 때 거칠어 보인다 -->
    <g class="ear ear-l">
      <path d="M 82 26 C 76 14, 78 6, 86 9 C 94 12, 98 19, 98 26 Z"
            fill="${c.fur}" stroke="${c.line}" stroke-width="${LINE_W}" stroke-linejoin="round"/>
      <path d="M 85 22 C 82 15, 84 12, 88 14 C 92 16, 94 20, 94 24 Z" fill="${c.ear}"/>
    </g>
    <g class="ear ear-r">
      <path d="M 103 26 C 103 19, 107 12, 115 9 C 123 6, 125 14, 119 26 Z"
            fill="${c.fur}" stroke="${c.line}" stroke-width="${LINE_W}" stroke-linejoin="round"/>
      <path d="M 107 24 C 107 20, 109 16, 113 14 C 117 12, 119 15, 116 22 Z" fill="${c.ear}"/>
    </g>

    <!-- 얼굴 -->
    <path class="face" d="${FACE_PATH}" fill="${c.fur}" stroke="${c.line}"
          stroke-width="${LINE_W}" stroke-linejoin="round"/>
    <g clip-path="url(#${clipFace})">
      <g stroke="${c.stripe}" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".45">
        <path d="M 92 14 q 3 7 0 12"/>
        <path d="M 100 12 q 3 8 0 13"/>
        <path d="M 108 14 q 3 7 0 12"/>
      </g>
      <ellipse cx="100" cy="56" rx="17" ry="9" fill="${c.belly}" opacity=".85"/>
    </g>

    <!-- 눈: 흰자 없이 큼직하게. 홍채는 가는 고리로만 보여준다 -->
    <g class="eyes">
      <g class="eye eye-l">
        <circle cx="91" cy="38" r="7" fill="#2E2B35"/>
        <circle cx="91" cy="38" r="4.4" fill="none" stroke="${c.eye}" stroke-width="2.4"/>
        <circle cx="88.8" cy="35.2" r="2.1" fill="#fff"/>
        <circle cx="93.2" cy="41" r="1" fill="#fff" opacity=".75"/>
      </g>
      <g class="eye eye-r">
        <circle cx="110" cy="38" r="7" fill="#2E2B35"/>
        <circle cx="110" cy="38" r="4.4" fill="none" stroke="${c.eye}" stroke-width="2.4"/>
        <circle cx="107.8" cy="35.2" r="2.1" fill="#fff"/>
        <circle cx="112.2" cy="41" r="1" fill="#fff" opacity=".75"/>
      </g>
    </g>

    <!-- 감은 눈 (잠잘 때만 보임) -->
    <g class="eyes-closed" opacity="0" stroke="${c.line}" stroke-width="2.4" fill="none" stroke-linecap="round">
      <path d="M 86 38 q 5 5 10 0"/>
      <path d="M 105 38 q 5 5 10 0"/>
    </g>

    <!-- 코와 입 -->
    <path class="nose" d="M 96.5 47 Q 100.5 45 104.5 47 Q 100.5 51.5 96.5 47 Z"
          fill="${c.nose}" stroke="${c.line}" stroke-width=".8" stroke-linejoin="round"/>
    <path class="mouth" d="M 100.5 50 q -4.5 5 -8 1 M 100.5 50 q 4.5 5 8 1"
          stroke="${c.line}" stroke-width="2" fill="none" stroke-linecap="round"/>

    <!-- 수염: 얼굴 밖으로 조금만. 길면 벌레 더듬이처럼 보인다 -->
    <g class="whiskers" stroke="${c.line}" stroke-width="1.2" opacity=".45" stroke-linecap="round" fill="none">
      <path d="M 120 44 q 7 -2 11 -4"/>
      <path d="M 121 48 q 7 1 11 1"/>
      <path d="M 80 44 q -4 -1 -6 -2"/>
      <path d="M 79 48 q -4 1 -6 1"/>
    </g>

    <!-- 볼 홍조 (말할 때 살짝) -->
    <ellipse class="blush blush-l" cx="83" cy="47" rx="5" ry="3" fill="${c.nose}" opacity="0"/>
    <ellipse class="blush blush-r" cx="118" cy="47" rx="5" ry="3" fill="${c.nose}" opacity="0"/>
  </g>
</svg>`.trim();
}

window.CatArt = { SKINS, buildCatSVG };
