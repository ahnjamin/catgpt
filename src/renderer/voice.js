'use strict';

/**
 * 마이크 듣기 엔진.
 *
 * 설계 원칙
 *  - 조용할 때는 아무것도 인터넷으로 보내지 않는다. 컴퓨터 안에서 소리 크기만 잰다.
 *  - 사람 목소리가 감지된 구간만 잘라서 WAV로 만들고, 그때만 Gemini에 보낸다.
 *  - 외부 라이브러리를 쓰지 않는다 (브라우저 기본 기능만 사용).
 *
 * 흐름:  소리 크기 감시 → 말 시작 감지 → 말 끝 감지 → WAV 조각 완성 → 콜백
 */

(function () {
  const TARGET_RATE = 16000;   // Gemini에 보낼 샘플레이트
  const FRAME = 4096;          // 한 번에 처리하는 샘플 수 (48kHz 기준 약 85ms)
  const PREROLL_SEC = 0.45;    // 말 시작 직전 소리도 같이 담기 (첫 글자 잘림 방지)

  let audioCtx = null;
  let stream = null;
  let source = null;
  let processor = null;

  let running = false;
  let muted = false;           // 고양이가 말하는 동안 잠깐 귀를 막는다

  let cfg = {
    threshold: 0.035,          // 말 시작으로 볼 소리 크기 (RMS)
    onsetFrames: 2,            // 이만큼 연속으로 커야 "말 시작"
    silenceFrames: 9,          // 이만큼 연속으로 작으면 "말 끝"
    maxSeconds: 6,             // 한 조각 최대 길이
    minSeconds: 0.35           // 이보다 짧으면 잡음으로 보고 버림
  };

  let onUtterance = null;      // (payload) => void
  let onLevel = null;          // (rms) => void  (설정 창의 마이크 막대용)

  // 상태
  let speaking = false;
  let loudRun = 0;
  let quietRun = 0;
  let voicedFrames = 0;        // 실제로 소리가 있었던 프레임 수 (잡음 걸러내기용)
  let collected = [];          // Float32Array 조각들
  let collectedLen = 0;
  let preroll = [];            // 최근 프레임들 (말 시작 전 소리)
  let prerollLen = 0;
  let srcRate = 48000;

  // ── 공개 API ───────────────────────────────────────────────────────────────

  async function start(options) {
    if (running) return { ok: true };
    Object.assign(cfg, options || {});

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        },
        video: false
      });
    } catch (err) {
      return { ok: false, error: describeMicError(err) };
    }

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      srcRate = audioCtx.sampleRate || 48000;

      source = audioCtx.createMediaStreamSource(stream);
      processor = audioCtx.createScriptProcessor(FRAME, 1, 1);
      processor.onaudioprocess = handleFrame;

      source.connect(processor);
      // 소리를 실제로 내보내지는 않지만, 일부 환경에서 목적지에 연결해야 동작한다
      const silent = audioCtx.createGain();
      silent.gain.value = 0;
      processor.connect(silent);
      silent.connect(audioCtx.destination);

      running = true;
      resetState();
      return { ok: true };
    } catch (err) {
      stop();
      return { ok: false, error: '마이크를 준비하지 못했습니다: ' + err.message };
    }
  }

  function stop() {
    running = false;
    resetState();
    try { if (processor) { processor.onaudioprocess = null; processor.disconnect(); } } catch (_) {}
    try { if (source) source.disconnect(); } catch (_) {}
    try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (_) {}
    try { if (audioCtx && audioCtx.state !== 'closed') audioCtx.close(); } catch (_) {}
    processor = source = stream = audioCtx = null;
  }

  /** 고양이가 말하는 동안 자기 목소리를 듣지 않게 잠시 귀를 막는다. */
  function setMuted(v) {
    muted = !!v;
    if (muted) resetState();
  }

  function configure(patch) {
    Object.assign(cfg, patch || {});
  }

  function isRunning() { return running; }

  // ── 내부 ───────────────────────────────────────────────────────────────────

  function resetState() {
    speaking = false;
    loudRun = 0;
    quietRun = 0;
    voicedFrames = 0;
    collected = [];
    collectedLen = 0;
    preroll = [];
    prerollLen = 0;
  }

  function handleFrame(ev) {
    if (!running) return;

    const input = ev.inputBuffer.getChannelData(0);
    const rms = computeRms(input);
    if (onLevel) onLevel(rms);

    if (muted) return;

    const copy = new Float32Array(input.length);
    copy.set(input);

    if (!speaking) {
      // 말 시작 전 소리를 잠깐 저장해 둔다
      preroll.push(copy);
      prerollLen += copy.length;
      const maxPre = Math.floor(PREROLL_SEC * srcRate);
      while (prerollLen - preroll[0].length > maxPre) {
        prerollLen -= preroll.shift().length;
      }

      if (rms > cfg.threshold) {
        loudRun++;
        if (loudRun >= cfg.onsetFrames) {
          speaking = true;
          quietRun = 0;
          voicedFrames = loudRun;
          collected = preroll.slice();
          collectedLen = prerollLen;
          preroll = [];
          prerollLen = 0;
        }
      } else {
        loudRun = 0;
      }
      return;
    }

    // 말하는 중
    collected.push(copy);
    collectedLen += copy.length;

    if (rms < cfg.threshold * 0.6) {
      quietRun++;
    } else {
      quietRun = 0;
      if (rms > cfg.threshold * 0.8) voicedFrames++;
    }

    const seconds = collectedLen / srcRate;
    const ended = quietRun >= cfg.silenceFrames;
    const tooLong = seconds >= cfg.maxSeconds;

    if (ended || tooLong) {
      const chunks = collected;
      const quiet = quietRun;
      const voiced = voicedFrames;
      resetState();

      // 실제로 말소리가 있었던 시간이 너무 짧으면 잡음으로 보고 버린다
      const frameSec = FRAME / srcRate;
      if (voiced * frameSec < cfg.minSeconds) return;

      // 끝부분의 긴 침묵은 잘라낸다 (보낼 용량과 요금을 줄이기 위해)
      const keepTail = 3;
      if (!tooLong && quiet > keepTail) {
        chunks.splice(chunks.length - (quiet - keepTail), quiet - keepTail);
      }
      const total = chunks.reduce((n, c) => n + c.length, 0);

      // 무거운 작업은 다음 틱으로 넘겨 오디오 처리를 막지 않는다
      setTimeout(() => finish(chunks, total, tooLong), 0);
    }
  }

  function finish(chunks, total, truncated) {
    if (!onUtterance) return;
    const seconds = total / srcRate;
    const merged = mergeFloat(chunks, total);
    const down = downsample(merged, srcRate, TARGET_RATE);
    const wav = encodeWav(down, TARGET_RATE);
    onUtterance({
      base64: arrayBufferToBase64(wav),
      mimeType: 'audio/wav',
      seconds: Math.round(seconds * 100) / 100,
      truncated: !!truncated
    });
  }

  function computeRms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  function mergeFloat(chunks, total) {
    const out = new Float32Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  function downsample(buf, from, to) {
    if (to >= from) return buf;
    const ratio = from / to;
    const outLen = Math.floor(buf.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(Math.floor((i + 1) * ratio), buf.length);
      let sum = 0, n = 0;
      for (let j = start; j < end; j++) { sum += buf[j]; n++; }
      out[i] = n ? sum / n : 0;
    }
    return out;
  }

  /** 16bit PCM mono WAV 파일 만들기 */
  function encodeWav(samples, rate) {
    const bytesPerSample = 2;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);

    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);          // PCM 헤더 크기
    view.setUint16(20, 1, true);           // PCM 형식
    view.setUint16(22, 1, true);           // 채널 수
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);          // 비트 깊이
    writeStr(36, 'data');
    view.setUint32(40, samples.length * bytesPerSample, true);

    let off = 44;
    for (let i = 0; i < samples.length; i++, off += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
  }

  function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  function describeMicError(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return '마이크 사용이 차단되어 있습니다. 윈도우 [설정] → [개인 정보] → [마이크]에서 "데스크톱 앱이 마이크에 액세스하도록 허용"을 켜 주세요.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return '마이크를 찾지 못했습니다. 마이크가 연결되어 있는지 확인해 주세요.';
    }
    if (name === 'NotReadableError') {
      return '다른 프로그램이 마이크를 쓰고 있어서 사용할 수 없습니다.';
    }
    return '마이크를 켤 수 없습니다: ' + (err && err.message ? err.message : String(err));
  }

  window.Voice = {
    start, stop, setMuted, configure, isRunning,
    set onUtterance(fn) { onUtterance = fn; },
    get onUtterance() { return onUtterance; },
    set onLevel(fn) { onLevel = fn; },
    get onLevel() { return onLevel; }
  };
})();
