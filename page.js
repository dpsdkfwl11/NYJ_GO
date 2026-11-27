/* 불법주정차 홍보 — 화면 동작: 장면 주소·공유·움직임 멈춤·가벼운 화면·퀴즈 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 알림 ──
  const toastEl = $('toast');
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2400);
  }

  // ── 스크롤하면 주소 끝(#장면)도 바뀌게: 그대로 복사해 보내면 그 장면부터 열림 ──
  const sections = [...document.querySelectorAll('main > section[id]')];
  let hashTimer = null;
  function syncHash() {
    const mid = window.innerHeight * 0.5;
    let cur = null;
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) cur = s;
    }
    if (!cur) return;
    const want = cur.id === '처음' ? '' : `#${cur.id}`;
    if (decodeURIComponent(location.hash) !== want) history.replaceState(null, '', want || location.pathname + location.search);
  }
  const howSec = document.getElementById('신고방법');
  function syncPast() {
    body.classList.toggle('past', howSec.getBoundingClientRect().top < 64);
  }
  window.addEventListener('scroll', syncPast, { passive: true });
  syncPast();
  window.addEventListener('scroll', () => {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(syncHash, 250);
  }, { passive: true });

  // ── 장면 공유 ──
  async function share(id, text) {
    const url = `${location.origin === 'null' ? location.href.split('#')[0] : location.origin + location.pathname}#${encodeURIComponent(id)}`;
    const title = '불법주정차 주민신고';
    if (navigator.share) {
      try {
        await navigator.share({ title, text: text || title, url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('링크를 복사했습니다. 붙여 넣어 보내세요.');
    } catch (_) {
      window.prompt('아래 링크를 복사해 보내세요.', url);
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-share]');
    if (b) share(b.dataset.share, b.dataset.text);
  });

  // ── 움직임 멈춤 (자동으로 움직이는 화면을 멈출 수 있게) ──
  const pauseBtn = $('pauseBtn');
  function setPaused(v) {
    body.classList.toggle('paused', v);
    pauseBtn.setAttribute('aria-pressed', String(v));
    pauseBtn.querySelector('.lbl').textContent = v ? '움직임 재생' : '움직임 멈춤';
    pauseBtn.querySelector('.i-pause').style.display = v ? 'none' : '';
    pauseBtn.querySelector('.i-play').style.display = v ? '' : 'none';
  }
  pauseBtn.addEventListener('click', () => setPaused(!body.classList.contains('paused')));
  if (reduce) setPaused(true);

  // ── 가벼운 화면 (3D 대신 장면 사진) ──
  const liteBtn = $('liteBtn');
  function syncLite() {
    const lite = body.classList.contains('no3d');
    liteBtn.setAttribute('aria-pressed', String(lite));
    liteBtn.querySelector('.lbl').textContent = lite ? '3D 화면' : '가벼운 화면';
    liteBtn.title = lite ? '3D 거리로 보기' : '3D 대신 사진으로 가볍게 보기 (데이터·배터리 절약)';
  }
  new MutationObserver(syncLite).observe(body, { attributes: true, attributeFilter: ['class'] });
  syncLite();
  liteBtn.addEventListener('click', () => {
    const lite = body.classList.contains('no3d');
    try {
      if (lite) localStorage.removeItem('street-q');
      else localStorage.setItem('street-q', 'off');
    } catch (_) {}
    location.reload();
  });

  // ── 퀴즈 ──
  const QUIZ = [
    {
      img: 'img/q1.jpg',
      alt: '빨간 연석이 칠해진 소화전 바로 앞에 흰 승용차가 서 있는 사진',
      badge: '평일 오후 2시',
      q: '빨간 연석이 칠해진 소화전 바로 앞에 차가 서 있습니다.',
      a: 1,
      ok: '맞아요, 신고 대상입니다.',
      why: '소화전 주변 5m 안입니다. 빨간 연석 구간이라 과태료도 2배(승용차 기준 8만 원)입니다.',
    },
    {
      img: 'img/q2.jpg',
      alt: '초등학교 정문 앞 어린이보호구역 도로에 흰 승용차가 서 있는 사진',
      badge: '토요일 오후 3시',
      q: '초등학교 정문 앞 어린이보호구역 도로에 차가 서 있습니다.',
      a: 0,
      ok: '맞아요, 이 시간에는 주민신고 대상이 아닙니다.',
      why: '어린이보호구역 정문 앞 도로는 평일 오전 8시부터 오후 8시까지가 신고 대상입니다. 토요일은 해당되지 않습니다.',
    },
    {
      img: 'img/q3.jpg',
      alt: '횡단보도 앞 흰 정지선 뒤에 승용차가 멈춰 있는 사진',
      badge: '평일 오전 9시',
      q: '횡단보도 앞, 흰 정지선 뒤에 차가 멈춰 있습니다.',
      a: 0,
      ok: '맞아요, 신고 대상이 아닙니다.',
      why: '정지선을 넘지 않았습니다. 정지선을 넘어 횡단보도에 걸쳐 서 있어야 신고 대상입니다.',
    },
  ];
  const card = $('quizCard');
  let qi = 0;
  let score = 0;
  function renderQ() {
    const d = QUIZ[qi];
    card.innerHTML = `
      <div class="q-media"><img id="qImg" src="${d.img}" alt="${d.alt}" width="800" height="600" loading="lazy" /><span class="q-badge">${d.badge}</span></div>
      <div class="q-body">
        <p class="q-no">${qi + 1} / ${QUIZ.length}</p>
        <h3 id="qText">${d.q}</h3>
        <div class="q-btns" role="group" aria-labelledby="qText">
          <button type="button" data-a="1" aria-pressed="false">신고 대상이에요</button>
          <button type="button" data-a="0" aria-pressed="false">아니에요</button>
        </div>
        <div class="q-result" id="qResult" role="status" hidden>
          <b id="qResTitle"></b>
          <p id="qResText"></p>
          <button class="btn" type="button" id="qNext">${qi + 1 < QUIZ.length ? '다음 문제' : '결과 보기'}</button>
        </div>
      </div>`;
  }
  function renderDone(focus) {
    const msg = score === QUIZ.length ? '모두 맞혔어요! 이제 신고 기준을 정확히 아시네요.' : score >= 2 ? '거의 다 맞혔어요. 헷갈린 부분은 위 장면에서 다시 보세요.' : '헷갈리는 기준이 많죠. 위 장면을 한 번 더 보면 금방 익숙해집니다.';
    card.innerHTML = `
      <div class="q-done" style="grid-column:1/-1">
        <b tabindex="-1" id="qDoneTitle">${QUIZ.length}문제 중 ${score}개 맞혔어요</b>
        <p>${msg}</p>
        <div class="btns">
          <button class="btn" type="button" id="qAgain">다시 풀기</button>
          <button class="btn line2" type="button" data-share="퀴즈" data-text="이 차, 신고 대상일까요? 불법주정차 퀴즈 3문제">퀴즈 공유하기</button>
        </div>
      </div>`;
    if (focus) $('qDoneTitle').focus();
  }
  card.addEventListener('click', (e) => {
    const ans = e.target.closest('.q-btns button');
    if (ans && !ans.disabled) {
      const d = QUIZ[qi];
      const right = Number(ans.dataset.a) === d.a;
      if (right) score++;
      for (const b of card.querySelectorAll('.q-btns button')) b.disabled = true;
      ans.setAttribute('aria-pressed', 'true');
      ans.classList.add(right ? 'right' : 'wrong');
      $('qResTitle').textContent = right ? d.ok : `아쉬워요. ${d.a ? '신고 대상입니다.' : '신고 대상이 아닙니다.'}`;
      $('qResText').textContent = d.why;
      $('qResult').hidden = false;
      $('qNext').focus({ preventScroll: true });
      return;
    }
    if (e.target.id === 'qNext') {
      qi++;
      if (qi < QUIZ.length) {
        renderQ();
        $('qText').setAttribute('tabindex', '-1');
        $('qText').focus({ preventScroll: true });
      } else renderDone(true);
      return;
    }
    if (e.target.id === 'qAgain') {
      qi = 0;
      score = 0;
      renderQ();
      $('qText').setAttribute('tabindex', '-1');
      $('qText').focus({ preventScroll: true });
    }
  });
  renderQ();
})();
