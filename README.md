# 냥이 (Nyangi) 🐱

윈도우 화면 위를 걸어다니는 고양이 AI 친구.
**"야옹아"** 하고 부르면 대답하고, Gemini로 수다를 떱니다.

용도는 **순수하게 재미**입니다. 컴퓨터 앞에 오래 앉아 있는 사람이 심심하지 않게 하는 것.
비서도 아니고 돌봄 서비스도 아닙니다 — 창도 없고, 로그인도 없고, 그냥 화면에 고양이가 삽니다.

> **설계상 일부러 뺀 것**: 주식·투자 관련 의견, 전망, 추천은 어떤 식으로 물어봐도 답하지 않습니다.
> 화면 내용도 읽지 않습니다. 고양이가 아는 척하면 곤란한 영역이라 시스템 프롬프트에서 막아 뒀습니다.

---

## 어떻게 동작하나

```
마이크 (항상 듣지만 인터넷으로 아무것도 안 보냄)
  │
  ├─ 컴퓨터 안에서 소리 크기만 잰다 (VAD)
  │     말소리가 나면 그 구간만 잘라서 WAV로 만든다
  │
  ├─ 평소:  잘린 조각 → Gemini Flash-Lite
  │           "이 소리에 '야옹아'가 있니?" → Y / N (토큰 몇 개)
  │
  └─ 불렸으면 25초 동안 대화 모드
        잘린 조각 → Gemini Flash
          받아쓰기 + 대답을 한 번에 받아온다
        → 말풍선 + 윈도우 내장 한국어 TTS로 읽어줌
```

조용할 때는 네트워크 요청이 **0건**입니다. 사람 목소리가 감지된 구간만 나갑니다.

다만 TV를 켜 놓은 방이라면 말소리가 계속 감지됩니다.
그래서 판정 호출에 **분당 12회 · 하루 400회** 상한을 걸어 두었습니다.
상한에 걸리면 음성 호출만 쉬고, 고양이를 클릭해서 글씨로 묻는 건 계속 됩니다.

> 무료 키의 하루 요청 수(RPD)는 **모델마다 다릅니다.** Flash-Lite 계열이 Flash 계열보다
> 훨씬 넉넉해서, 웨이크워드 판정을 Flash-Lite로 돌리는 건 비용뿐 아니라 한도 때문이기도 합니다.
> 대화용 Flash 모델의 한도가 먼저 바닥나면 `gemini.js`의 폴백 체인이 자동으로
> Flash-Lite로 내려갑니다(429 → 다음 후보). 현재 한도는
> [공식 rate limits 문서](https://ai.google.dev/gemini-api/docs/rate-limits)에서 확인하세요.

## 기술 선택 이유

| 고민한 것 | 고른 것 | 이유 |
|---|---|---|
| 웨이크워드 | 로컬 VAD + Gemini 판정 | Electron에서 `webkitSpeechRecognition`은 여전히 `network` 오류로 못 씀 ([electron#46143](https://github.com/electron/electron/issues/46143)). Vosk 한국어 소형 모델은 80MB 다운로드 + 정확도 문제. 로컬 VAD로 걸러내면 API 호출이 하루 수십 건 수준이라 무료 한도로 충분. |
| STT | Gemini 오디오 입력 | 받아쓰기와 대답을 **한 번의 호출**로 끝냄. 소형 로컬 모델보다 한국어 정확도가 훨씬 높음. |
| TTS | 윈도우 내장 `speechSynthesis` | 무료, 오프라인, 지연 없음. 한국어 윈도우에는 한국어 음성이 기본 포함. |
| 백엔드 | 없음 (앱에서 직접 호출) | 서버를 띄우면 어머니 컴퓨터가 거기에 의존하게 됨. n8n으로 바꾸고 싶으면 `src/gemini.js` 한 파일만 교체하면 됨. |
| 의존성 | electron + electron-builder **뿐** | 설치 실패 지점을 최소화. 나머지는 전부 브라우저 기본 API. |

---

## 개발자용 실행

```bash
cd nyangi
npm install
npm test           # 일렉트론 없이 도는 최소 점검 (하루 상한·응답 파싱·모델 폴백)
npm start          # 실행
npm run dev        # 개발자 도구 같이 열기
```

`package-lock.json` 은 커밋되어 있습니다. CI 는 `npm ci` 로 그대로 재현합니다.

처음 실행하면 설정 창이 뜹니다. [Google AI Studio](https://aistudio.google.com/apikey)에서
API 키를 받아 붙여넣고 **연결 확인**을 누르세요.

## 윈도우 설치 파일(.exe) 만들기

### 방법 A — 윈도우 PC에서 직접

```bash
npm install
npm run dist:win
# dist/Nyangi-Setup-1.0.0.exe 가 생깁니다
```

### 방법 B — 맥에서 빌드

`electron-builder`가 윈도우 타깃을 만들려면 Wine이 필요합니다.

```bash
brew install --cask wine-stable
npm run dist:win
```

### 방법 C — GitHub Actions (추천, 맥에서 Wine 설치 없이)

이 저장소를 GitHub에 올리기만 하면 `.github/workflows/build-windows.yml`이
윈도우 러너에서 알아서 빌드하고, **Actions → 해당 실행 → Artifacts**에서
`Nyangi-Setup-1.0.0.exe`를 내려받을 수 있습니다.

```bash
git init && git add . && git commit -m "냥이 첫 커밋"
gh repo create nyangi --private --source=. --push
```

### API 키를 미리 넣어서 배포하기

어머니가 키를 붙여넣는 과정을 생략하고 싶으면, 빌드 **전에** 키 파일을 만들어 두세요.

```bash
echo "AIza...여기에키..." > config/apikey.txt
npm run dist:win
```

설치본 안에 키가 들어가므로, 이 exe는 가족끼리만 쓰고 공개 배포하지 마세요.
(키는 앱 리소스 폴더에서 추출 가능합니다.)

---

## 조작법

| 하는 일 | 방법 |
|---|---|
| 말 걸기 (음성) | "야옹아" 하고 부른 뒤 질문 |
| 말 걸기 (키보드) | 고양이를 **클릭** → 입력창에 타이핑 |
| 이어서 묻기 | 대답 후 25초 안에는 그냥 말하면 됨 |
| 방금 한 말 다시 듣기 | 트레이 → **"방금 한 말 다시 듣기"** |
| 설정 | 작업 표시줄 오른쪽 아래 **고양이 트레이 아이콘** 우클릭 |
| 잠시 숨기기 | 트레이 → "고양이 숨기기" |
| 끄기 | 트레이 → "냥이 종료" |

## 설정에서 바꿀 수 있는 것

- Gemini API 키, 연결 테스트
- 고양이 이름 / 주인 호칭 / 성격 (시스템 프롬프트에 들어감)
- 털 색 4종, 고양이 크기, **말풍선 글자 크기**
- 음성 호출 켜기·끄기, 마이크 민감도 (실시간 막대로 확인)
- 읽어주기 켜기·끄기, 목소리·빠르기·높낮이
- 시작 시 자동 실행, 가끔 먼저 말 걸기

---

## 파일 구조

```
src/
  main.js              창·트레이·IPC·자동 실행 (메인 프로세스)
  preload.js           contextBridge로 안전하게 노출하는 API
  gemini.js            Gemini REST 호출 + 모델 폴백/기억 + 에러 변환
  store.js             settings.json 읽기/쓰기 (외부 패키지 없음)
  budget.js            웨이크워드 판정 하루 상한 (순수 함수)
  renderer/
    pet.html/css/js    고양이 행동·말풍선·대화 흐름
    cat-art.js         SVG 고양이 (털 색 팔레트 교체 가능)
    voice.js           VAD + 16kHz WAV 인코딩 (외부 패키지 없음)
    settings.html/…    설정 창
build/icon.png         앱 아이콘
config/apikey.txt      (선택) 빌드에 포함할 기본 API 키
test/smoke.js          npm test — 일렉트론이 필요 없는 로직만
```

## 오버레이 창이 바탕화면을 가리지 않는 이유

고양이 창은 **작업 영역 전체**를 덮는 투명 창 하나입니다.
그래서 "입력창이 열려 있으면 클릭을 받는다" 같은 조건을 쓰면
그동안 바탕화면 전체가 눌리지 않습니다.

그래서 이렇게 합니다.

- 창은 **항상** `setIgnoreMouseEvents(true, { forward: true })` 상태로 둔다.
- 메인 프로세스가 `screen.getCursorScreenPoint()` 로 마우스 위치를 읽어 렌더러에 보낸다.
- 렌더러가 고양이·말풍선·입력창·안내창의 실제 사각형과 비교해서,
  그 위에 있을 때만 클릭을 받도록 잠깐 푼다.

`forward: true` 로 오는 `mousemove` 만 믿지 않는 이유는, 다른 프로그램이 포커스를
잡고 있으면 전달되지 않는 경우가 있기 때문입니다
([electron#33281](https://github.com/electron/electron/issues/33281)).
`forward: true` 는 **리눅스에서 동작하지 않습니다.**

## 다음에 할 만한 것

- **사진 기반 고양이**: `설정 → 털 색`에 커스텀 항목을 추가하고
  `store.js`의 `customSkinPath`에 PNG 경로를 넣으면 그 이미지로 바뀝니다.
  걷기 애니메이션까지 살리려면 스프라이트 시트 방식으로 `cat-art.js`를 바꾸면 됩니다.
- **날씨·일정·알림**: `src/gemini.js`의 호출부를 n8n 웹훅으로 바꾸면
  Gemini 앞단에 툴 호출(날씨 API, 구글 캘린더, 약 먹을 시간 알림)을 붙일 수 있습니다.
  앱 쪽 인터페이스(`ask`, `askWithAudio`, `wakeCheck`)만 유지하면 나머지는 그대로 동작합니다.
- **기억**: 대화 기록을 `userData/memories.json`에 요약해 두고 시스템 프롬프트에 얹으면
  "지난번에 말씀하신 화분" 같은 걸 기억하게 만들 수 있습니다.

## 알려진 제약

- 실시간 정보(오늘 날씨, 뉴스, 현재 시각)는 모릅니다. 프롬프트에서 모른다고 답하도록 해 뒀습니다.
- 한국어 TTS 음성이 없는 윈도우에서는 글자만 나옵니다
  (설정 → 시간 및 언어 → 음성에서 한국어 음성 추가).
- 코드 서명을 하지 않았으므로 설치할 때 SmartScreen 경고가 뜹니다
  ("추가 정보" → "실행").

## 라이선스

MIT
