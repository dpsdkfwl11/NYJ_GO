/* 첫 화면 인트로 — 3D 거리가 도로 → 건물 → 시설물 → 차 → 사람 순으로 지어지고, 끝나면 제목이 한 줄씩 올라온다.
 * 세우는 연출은 street.js 가 하고(intro-progress / intro-done 알림), 여기서는 진행 문구·건너뛰기·마무리만 맡는다.
 * <head> 의 짧은 스크립트가 재생할지 먼저 정해 html.intro-on 을 붙인다. */
(function () {
  'use strict';
  const root = document.documentElement;
  const el = document.getElementById('buildIntro');
  if (!el) return;
  if (!root.classList.contains('intro-on')) {
    el.remove();
    return;
  }
  const stepEl = el.querySelector('.bi-step');
  const bar = el.querySelector('.bi-bar i');
  let done = false;
  let lastName = '';
  window.addEventListener('intro-progress', (e) => {
    const d = e.detail || {};
    if (d.name && d.name !== lastName) {
      lastName = d.name;
      stepEl.textContent = d.name;
    }
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, d.p || 0))})`;
  });

  function finish() {
    if (done) return;
    done = true;
    root.classList.add('intro-reveal');
    root.classList.remove('intro-on'); // 스크롤·클릭 풀고, 제목·메뉴가 한 줄씩 올라옴
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
    setTimeout(() => root.classList.remove('intro-reveal'), 2200);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('wheel', skip);
    window.removeEventListener('pointerdown', skip);
  }
  function skip() {
    if (done) return;
    window.dispatchEvent(new Event('intro-skip')); // 3D 는 다 지어진 모습으로
    finish();
  }
  const onKey = (e) => {
    if (e.key === 'Escape') skip();
  };
  window.addEventListener('intro-done', finish);
  el.querySelector('.bi-skip').addEventListener('click', skip);
  window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', skip, { passive: true });
  window.addEventListener('pointerdown', skip); // 화면을 누르면(스크롤하려 하면) 바로 본문으로
  document.addEventListener('visibilitychange', () => document.hidden && skip());
  setTimeout(finish, 15000); // 3D 를 못 그리는 등 알림이 안 오면
})();
