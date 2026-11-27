/* 첫 화면 인트로 — 안전신문고 카메라 뷰파인더로 "1분 간격 2장 촬영"을 3초 안에 보여 준다.
 * <head> 의 짧은 스크립트가 재생할지 먼저 정해 html.intro-on 을 붙인다(본문이 잠깐 보였다 덮이는 깜빡임 방지).
 * 움직이는 것은 transform / opacity 만. 숫자는 requestAnimationFrame 으로 센다. */
(function () {
  'use strict';
  const root = document.documentElement;
  const el = document.getElementById('vfIntro');
  if (!el) return;
  if (!root.classList.contains('intro-on')) {
    el.remove();
    return;
  }
  const $ = (s) => el.querySelector(s);
  const timeEl = $('.vf-time');
  const shotEl = $('.vf-shot');
  const okEl = $('.vf-ok');
  const chips = el.querySelectorAll('.vf-chip');
  const params = new URLSearchParams(location.search);
  const AT = params.has('introAt') ? Number(params.get('introAt')) : null; // 점검용: 그 순간에서 멈춤

  const pad = (n) => String(n).padStart(2, '0');
  const BASE = 14 * 3600 + 2 * 60; // 14:02:00
  const show = (sec) => {
    const t = BASE + sec;
    timeEl.textContent = `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
  };
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const add = (c) => el.classList.add(c);
  const restart = (c) => {
    el.classList.remove(c);
    void el.offsetWidth; // 같은 애니메이션을 다시 걸기 위해
    el.classList.add(c);
  };

  // ── 시간표 (초) ──
  let counting = false;
  const steps = [
    [0.0, () => add('boot')],
    [0.32, () => add('focus')],
    [0.6, () => add('lock')],
    [0.78, () => { // 1차 셔터
      restart('f1');
      restart('kick');
      chips[0].classList.add('on');
      el.querySelector('.vf-live').textContent = '첫 번째 사진 촬영, 14시 2분 10초';
    }],
    [0.9, () => {
      counting = true;
      add('count');
    }],
    [1.62, () => {
      counting = false;
      show(71);
      okEl.classList.add('on');
    }],
    [1.72, () => { // 2차 셔터 (1차와 0.94초 간격)
      restart('f2');
      shotEl.textContent = '2 / 2';
      chips[1].classList.add('on');
      el.querySelector('.vf-live').textContent = '1분 뒤 두 번째 사진 촬영, 14시 3분 11초';
    }],
    [1.8, () => add('develop')],
    [2.65, () => end(false)],
  ];

  let t0 = 0;
  let next = 0;
  let raf = 0;
  let done = false;
  function tick(now) {
    if (done) return;
    if (!t0) t0 = now;
    const t = AT != null ? AT : (now - t0) / 1000;
    const last = AT != null ? steps.length - 1 : steps.length; // 점검 모드는 끝내지 않고 그 순간에 멈춤
    while (next < last && steps[next][0] <= t) steps[next++][1]();
    if (counting) {
      const p = Math.min(1, Math.max(0, (t - 0.9) / 0.7));
      show(10 + Math.round(61 * easeOut(p))); // 14:02:10 → 14:03:11
    }
    if (AT != null) return;
    raf = requestAnimationFrame(tick);
  }

  function end(fast) {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    el.style.display = 'block'; // intro-on 을 떼도 마지막 페이드는 보이게
    el.style.pointerEvents = 'none';
    root.classList.remove('intro-on'); // 스크롤·클릭 바로 풀기
    if (fast) add('out');
    setTimeout(() => el.remove(), fast ? 220 : 60);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('wheel', skip);
  }
  const skip = () => end(true);
  const onKey = (e) => {
    if (e.key === 'Escape') skip();
  };
  el.addEventListener('pointerdown', skip);
  el.querySelector('.vf-skip').addEventListener('click', skip);
  window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', skip, { passive: true });
  // 인트로 중 움직임 멈춤을 켜거나 다른 탭으로 가면 바로 끝
  document.addEventListener('click', (e) => e.target.closest && e.target.closest('#pauseBtn') && skip());
  document.addEventListener('visibilitychange', () => document.hidden && skip());

  show(10);
  raf = requestAnimationFrame(tick);
})();
