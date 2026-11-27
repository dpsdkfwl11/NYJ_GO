/* 불법주정차 홍보 — 3D 거리 (three.js r128)
 * 1 = 1m. 큰길은 x 방향(차도 z -6~6), 교차로 세로길은 x -5~5.
 * 카메라는 +z 쪽(앞 인도 너머)에서 길 건너편(-z)을 바라본다 → 건물·간판은 건너편에만 세운다. */
(async function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  const SHOT = params.has('shot') ? Number(params.get('shot')) : null; // 점검용: ?shot=장면번호
  const BARE = params.has('bare'); // 캡처용: 글·메뉴 숨김
  const CLEAN = params.has('clean'); // 캡처용: 화살표·말풍선 숨김
  if (BARE) document.body.classList.add('bare');
  const isMobile = () => window.innerWidth < 860;

  // 화질 단계: high / mid / low / off(미리 찍은 사진)
  const Q_ORDER = ['high', 'mid', 'low', 'off'];
  let stored = null;
  try {
    stored = localStorage.getItem('street-q');
  } catch (_) {}
  let tier = params.get('q') || stored || (window.matchMedia('(pointer: coarse)').matches || isMobile() ? 'mid' : 'high');
  if (!params.get('q') && !stored && ((navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2))) tier = 'low';
  if (!Q_ORDER.includes(tier)) tier = 'high';

  // ── 3D 대신 장면 사진 ──
  const still = document.getElementById('still');
  const stillImg = still ? still.querySelector('img') : null;
  let stillOn = false;
  function showStill() {
    if (!stillOn || !stillImg) return;
    const src = `img/${isMobile() ? 'm' : 'd'}${station}.jpg`;
    if (stillImg.dataset.src === src) return;
    stillImg.dataset.src = src;
    stillImg.classList.remove('in');
    const im = new Image();
    im.onload = () => {
      if (stillImg.dataset.src !== src) return;
      stillImg.src = src;
      requestAnimationFrame(() => stillImg.classList.add('in'));
    };
    im.src = src;
  }
  function streetReady() {
    if (window.__streetReady) return;
    window.__streetReady = true;
    window.dispatchEvent(new Event('street-ready'));
  }
  function useStills() {
    streetReady();
    window.dispatchEvent(new Event('intro-done'));
    stillOn = true;
    document.body.classList.add('no3d');
    showStill();
  }

  // ── 스크롤 → 장면 번호 ──
  const steps = [...document.querySelectorAll('.step')];
  const rail = [...document.querySelectorAll('.rail a')];
  const how = document.getElementById('신고방법');
  let station = 0;
  let lastSent = -1;
  function pick() {
    const mid = window.innerHeight / 2;
    let best = steps[0];
    let bestD = Infinity;
    for (const s of steps) {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    const pastHow = how.getBoundingClientRect().top < window.innerHeight * 0.6;
    steps.forEach((s) => s.classList.toggle('is-on', s === best && !pastHow));
    station = pastHow ? 7 : Number(best.dataset.station);
    if (BARE && SHOT != null) station = SHOT; // 캡처용: 글을 숨기면 스크롤로 장면을 알 수 없으므로
    document.body.classList.toggle('at-hero', station === 0);
    rail.forEach((a, i) => a.classList.toggle('is-on', i + 1 === station));
    showStill();
    if (station !== lastSent) {
      lastSent = station;
      window.dispatchEvent(new CustomEvent('station', { detail: station }));
    }
  }
  window.addEventListener('scroll', pick, { passive: true });
  window.addEventListener('resize', pick);
  if (SHOT != null) {
    document.documentElement.style.scrollBehavior = 'auto';
    const el = SHOT === 7 ? how : document.querySelector(`[data-station="${SHOT}"]`);
    if (el) el.scrollIntoView();
  }
  pick();

  if (!window.THREE || tier === 'off') return useStills();
  const canvas = document.getElementById('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance' });
  } catch (_) {
    return useStills(); // 3D 를 못 쓰는 기기 — 장면 사진으로
  }
  // 소프트웨어로 그리는 환경(그래픽 가속 없음)이면 사진으로
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (!params.get('q') && /swiftshader|llvmpipe|software|basic render/i.test(name)) {
      renderer.dispose();
      return useStills();
    }
  } catch (_) {}
  const FONT = '"Pretendard", "Malgun Gothic", sans-serif';
  try {
    await Promise.all([document.fonts.load(`800 40px ${FONT}`), document.fonts.load(`600 40px ${FONT}`)]);
  } catch (_) {}

  const dprFor = (q) => (q === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : q === 'mid' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1);
  renderer.setPixelRatio(dprFor(tier));
  renderer.shadowMap.enabled = tier !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const ANISO = renderer.capabilities.getMaxAnisotropy();

  // ── 도우미 ──
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pickOf = (a) => a[Math.floor(rnd() * a.length)];
  function ctex(w, h, draw, rx, ry) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = ANISO;
    if (rx || ry) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx || 1, ry || 1);
    }
    return t;
  }
  function speckle(x, w, h, n, colors, a, size) {
    x.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      x.fillStyle = pickOf(colors);
      const s = (size || 1) * (0.6 + rnd());
      x.fillRect(rnd() * w, rnd() * h, s, s);
    }
    x.globalAlpha = 1;
  }
  const std = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.88, metalness: 0.02 }, o || {}));
  const scene = new THREE.Scene();
  // 인트로: 장면에 넣는 것마다 '단계'를 적어 둔다 → 도로 → 건물 → 시설물 → 차 → 사람 순으로 세운다
  const INTRO = document.documentElement.classList.contains('intro-on') && !BARE && SHOT == null && !reduce;
  let PHASE = 'none';
  {
    const add0 = scene.add.bind(scene);
    scene.add = (...objs) => {
      for (const o of objs) if (o && !o.userData.phase) o.userData.phase = PHASE;
      return add0(...objs);
    };
  }
  function mesh(geo, mat, x, y, z, parent, noShadow) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = !noShadow;
    m.receiveShadow = true;
    (parent || scene).add(m);
    return m;
  }
  const box = (w, h, d, mat, x, y, z, p, ns) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p, ns);
  const cyl = (rt, rb, h, mat, x, y, z, p, seg) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), mat, x, y, z, p);
  // 바닥에 눕힌 판(노면 표시 등). 글씨 위쪽이 길 건너편(-z)을 향해 카메라 쪽에서 바로 읽힌다
  function decal(w, d, mat, x, z, y, rotY) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    if (rotY) m.rotation.z = rotY;
    m.position.set(x, y || 0.03, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  function textCanvas(x, s, px, color, weight, cx, cy, align) {
    x.font = `${weight || 800} ${px}px ${FONT}`;
    x.fillStyle = color;
    x.textAlign = align || 'center';
    x.textBaseline = 'middle';
    x.fillText(s, cx, cy);
  }

  // ── 하늘 · 빛 (해 질 녘) ──
  scene.background = ctex(16, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7fa6c6');
    g.addColorStop(0.45, '#d9b9a0');
    g.addColorStop(0.75, '#f3cfa6');
    g.addColorStop(1, '#f6dcbc');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(0xe9c9a6, 75, 200);
  scene.add(new THREE.HemisphereLight(0xd6e4ff, 0x6d5c49, 0.55));
  const sun = new THREE.DirectionalLight(0xffd0a0, 2.0);
  sun.position.set(-48, 36, 34);
  sun.castShadow = tier !== 'low';
  sun.shadow.mapSize.set(tier === 'high' ? 2048 : 1024, tier === 'high' ? 2048 : 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -90, right: 100, top: 45, bottom: -45, near: 1, far: 180 });
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fb8e0, 0.3);
  fill.position.set(40, 20, -30);
  scene.add(fill);

  // ── 바닥 ──
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    std(0xffffff, {
      map: ctex(256, 256, (x, w, h) => {
        x.fillStyle = '#6f6a61';
        x.fillRect(0, 0, w, h);
        speckle(x, w, h, 3000, ['#625d55', '#7b766c', '#68635a'], 0.6, 2);
      }, 60, 60),
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  PHASE = 'road';

  // 아스팔트 — 잔무늬, 덧씌운 자국, 갈라짐
  const asphaltTex = (rx, ry) =>
    ctex(512, 512, (x, w, h) => {
      x.fillStyle = '#505257';
      x.fillRect(0, 0, w, h);
      speckle(x, w, h, 9000, ['#45474c', '#5c5e63', '#3e4045', '#64666b'], 0.7, 1.4);
      x.globalAlpha = 0.18;
      for (let i = 0; i < 5; i++) {
        x.fillStyle = rnd() < 0.5 ? '#3a3c40' : '#5e6064';
        x.fillRect(rnd() * w, rnd() * h, 40 + rnd() * 120, 20 + rnd() * 60);
      }
      x.globalAlpha = 0.35;
      x.strokeStyle = '#2f3134';
      x.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        let px = rnd() * w;
        let py = rnd() * h;
        x.beginPath();
        x.moveTo(px, py);
        for (let k = 0; k < 8; k++) {
          px += (rnd() - 0.5) * 30;
          py += rnd() * 14;
          x.lineTo(px, py);
        }
        x.stroke();
      }
      x.globalAlpha = 1;
    }, rx, ry);
  decal(190, 12, std(0xffffff, { map: asphaltTex(19, 1.2), roughness: 0.95 }), 5, 0, 0.02);
  decal(10, 130, std(0xffffff, { map: asphaltTex(1, 13), roughness: 0.95 }), 0, 0, 0.021);

  // ── 노면 표시 ──
  const paint = (c) => std(c, { roughness: 0.7 });
  const white = paint(0xeeeeea);
  const yellow = paint(0xf0b62d);
  const redPaint = paint(0xc8352b);
  const skip = (x) => Math.abs(x) < 6.5 || Math.abs(x + 50) < 3; // 교차로·횡단보도
  for (let x = -90; x < 100; x += 0.5) {
    if (skip(x)) continue;
    // 중앙선(황색 겹선)
    box(0.52, 0.01, 0.12, yellow, x + 0.25, 0.035, -0.12, null, true).castShadow = false;
    box(0.52, 0.01, 0.12, yellow, x + 0.25, 0.035, 0.12, null, true).castShadow = false;
  }
  for (let x = -90; x < 100; x += 6) {
    if (skip(x) || skip(x + 3)) continue;
    // 차로 경계(흰 점선)
    box(3, 0.01, 0.13, white, x, 0.035, 3, null, true);
    box(3, 0.01, 0.13, white, x, 0.035, -3, null, true);
  }
  for (let z = -62; z < 62; z += 6) if (Math.abs(z) > 8) box(0.13, 0.01, 3, white, 0, 0.035, z, null, true);
  // 횡단보도 (x = -50): 줄무늬 + 정지선
  for (let z = -5.2; z <= 5.3; z += 0.95) box(3.4, 0.012, 0.48, white, -50, 0.036, z, null, true);
  box(0.4, 0.012, 5.6, white, -54.2, 0.036, 2.9, null, true);
  box(0.4, 0.012, 5.6, white, -45.8, 0.036, -2.9, null, true);

  // 글씨 노면 표시
  const markTex = (lines, w, h, color, frame) =>
    ctex(w, h, (x) => {
      x.clearRect(0, 0, w, h);
      if (frame) {
        x.strokeStyle = frame;
        x.lineWidth = h * 0.07;
        x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth);
      }
      lines.forEach((s, i) => textCanvas(x, s, h * (0.62 / lines.length), color, 800, w / 2, (h * (i + 0.5)) / lines.length + h * 0.02));
    });
  const markMat = (t) => std(0xffffff, { map: t, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  // 운전자가 읽는 노면 글씨: 줄마다 글자를 세로로 길게 늘이고, 첫 줄을 가장 아래(운전자 쪽)에
  function roadText(lines, wM, hM, color) {
    const W = 512;
    const H = Math.round((W * hM) / wM);
    return ctex(W, H, (x) => {
      x.clearRect(0, 0, W, H);
      const n = lines.length;
      const lh = H / n;
      lines.forEach((line, i) => {
        const row = n - 1 - i; // 첫 줄이 맨 아래
        x.save();
        x.font = `800 100px ${FONT}`;
        const tw = x.measureText(line).width;
        const sx = (W * 0.92) / tw;
        const sy = (lh * 0.78) / 100;
        x.translate(W / 2, row * lh + lh / 2);
        x.scale(sx, sy);
        x.fillStyle = color || '#ffffff';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(line, 0, 4);
        x.restore();
      });
    });
  }

  // ── 인도 · 연석 · 점자블록 ──
  const paverTex = ctex(256, 256, (x, w, h) => {
    // 2m x 2m 를 256px 로: 보도블록 20 x 10cm
    x.fillStyle = '#7d776d';
    x.fillRect(0, 0, w, h);
    const bw = 25.6;
    const bh = 12.8;
    for (let row = 0; row < h / bh; row++) {
      const off = (row % 2) * (bw / 2);
      for (let col = -1; col < w / bw + 1; col++) {
        const r = rnd();
        x.fillStyle = r < 0.07 ? '#a8857a' : r < 0.5 ? '#bcb5a8' : r < 0.85 ? '#b0a99c' : '#c6c0b4';
        x.fillRect(col * bw + off + 1, row * bh + 1, bw - 2, bh - 2);
      }
    }
    speckle(x, w, h, 2500, ['#8f887c', '#d2ccc0'], 0.35, 1);
  }, 1, 1);
  const tactileTex = ctex(64, 64, (x, w, h) => {
    x.fillStyle = '#e4ad1c';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#c99510';
    for (let i = 0; i < 4; i++) x.fillRect(8 + i * 14, 6, 6, 52); // 선형(유도) 블록
  });
  const granite = std(0xbdb8ae, { roughness: 0.7 });
  function sidewalk(x0, x1, z, depth) {
    const len = x1 - x0;
    const t = paverTex.clone();
    t.needsUpdate = true;
    t.repeat.set(len / 2, depth / 2);
    box(len, 0.18, depth, std(0xffffff, { map: t }), (x0 + x1) / 2, 0.09, z);
    // 연석 (차도 쪽)
    const cz = z + (z > 0 ? -depth / 2 : depth / 2);
    box(len, 0.2, 0.25, granite, (x0 + x1) / 2, 0.1, cz);
  }
  sidewalk(-95, -6.5, 8, 4);
  sidewalk(6.5, 100, 8, 4);
  sidewalk(-95, -6.5, -8, 4);
  sidewalk(6.5, 100, -8, 4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = paverTex.clone();
    t.needsUpdate = true;
    t.repeat.set(2, 50 / 2);
    box(4, 0.18, 52, std(0xffffff, { map: t }), sx * 7, 0.09, sz * 36);
    box(0.25, 0.2, 52, granite, sx * 5.1, 0.1, sz * 36);
  }
  // 앞 인도 점자블록(유도선) — 가운데쯤
  {
    const t = tactileTex.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 1);
    for (const [a, b] of [[-95, -6.5], [6.5, 100]]) {
      const tt = t.clone();
      tt.needsUpdate = true;
      tt.repeat.set((b - a) / 0.3, 1);
      const m = decal(b - a, 0.3, std(0xffffff, { map: tt }), (a + b) / 2, 8.6, 0.185);
      m.rotation.z = 0;
    }
  }
  // 앞 인도 뒤 화단과 낮은 담
  {
    const hedgeTex = ctex(256, 128, (x, w, h) => {
      x.fillStyle = '#3f5a30';
      x.fillRect(0, 0, w, h);
      speckle(x, w, h, 6000, ['#4f6d3a', '#34502a', '#5f7d45', '#2c4223'], 0.9, 2.2);
    }, 60, 1);
    for (const [a, b] of [[-95, -9.2], [9.2, 100]]) {
      const len = b - a;
      const t = hedgeTex.clone();
      t.needsUpdate = true;
      t.repeat.set(len / 3.2, 1);
      box(len, 0.3, 2.4, std(0x7a6f5e), (a + b) / 2, 0.15, 11.2); // 화단 경계석
      box(len - 0.6, 0.75, 1.5, std(0xffffff, { map: t, roughness: 1 }), (a + b) / 2, 0.66, 11.2);
      box(len, 0.9, 0.3, std(0xc9bfae), (a + b) / 2, 0.45, 12.6);
    }
  }

  PHASE = 'bldg';
  // ── 길 건너편 건물 ──
  const SHOPS = ['행복약국', '우리분식', '한빛안경', '미소치과', '새벽베이커리', '동네세탁', '으뜸정육점', '햇살내과', '다온카페', '청춘미용실', '바른부동산', '24시 마트', '소담한식', '열린서점'];
  const SIGN_COL = ['#1f5fa8', '#c23a2b', '#2f7d4f', '#f0a71e', '#333333', '#7a3fa0', '#0f7d86'];
  function facadeTex(w, h, style, shop, signCol, lit) {
    const P = 22; // 1m 당 px
    const cw = Math.round(w * P);
    const chh = Math.round(h * P);
    const map = ctex(cw, chh, (x) => {
      // 벽
      x.fillStyle = style.wall;
      x.fillRect(0, 0, cw, chh);
      if (style.brick) {
        x.fillStyle = style.mortar;
        for (let y = 0; y < chh; y += 4) {
          x.fillRect(0, y, cw, 1);
          for (let xx = (y / 4) % 2 ? 0 : 5; xx < cw; xx += 10) x.fillRect(xx, y, 1, 4);
        }
      } else if (style.tile) {
        x.fillStyle = style.mortar;
        for (let y = 0; y < chh; y += 6) x.fillRect(0, y, cw, 1);
        for (let xx = 0; xx < cw; xx += 6) x.fillRect(xx, 0, 1, chh);
      }
      speckle(x, cw, chh, cw * chh * 0.02, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.25)'], 0.4, 1);
      // 빗물 자국
      x.globalAlpha = 0.08;
      x.fillStyle = '#000';
      for (let i = 0; i < 6; i++) x.fillRect(rnd() * cw, 0, 2 + rnd() * 4, chh * (0.3 + rnd() * 0.5));
      x.globalAlpha = 1;
      // 위층 창
      const floors = Math.floor((h - 3.8) / 3);
      const bays = Math.max(2, Math.floor(w / 2.6));
      const bw = cw / bays;
      for (let f = 0; f < floors; f++) {
        const y = chh - (3.8 + 3 * (f + 1) - 0.8) * P;
        for (let b = 0; b < bays; b++) {
          const wx = b * bw + bw * 0.18;
          const ww = bw * 0.64;
          const wh = 1.5 * P;
          x.fillStyle = style.frame;
          x.fillRect(wx - 2, y - 2, ww + 4, wh + 4);
          const on = lit[`${f},${b}`];
          const g = x.createLinearGradient(0, y, 0, y + wh);
          g.addColorStop(0, on ? '#ffe2a8' : '#8fa3b5');
          g.addColorStop(1, on ? '#f2b964' : '#55687a');
          x.fillStyle = g;
          x.fillRect(wx, y, ww, wh);
          x.fillStyle = style.frame;
          x.fillRect(wx + ww / 2 - 1, y, 2, wh);
          // 커튼·블라인드 몇 개
          if (!on && rnd() < 0.3) {
            x.fillStyle = 'rgba(230,225,210,0.7)';
            x.fillRect(wx, y, ww / 2 - 1, wh * (0.3 + rnd() * 0.6));
          }
          // 실외기 몇 개
          if (rnd() < 0.18) {
            x.fillStyle = '#d9d9d4';
            x.fillRect(wx + ww * 0.2, y + wh + 3, ww * 0.6, 0.55 * P);
            x.fillStyle = '#9a9a95';
            x.beginPath();
            x.arc(wx + ww * 0.42, y + wh + 3 + 0.27 * P, 0.2 * P, 0, Math.PI * 2);
            x.fill();
          }
        }
      }
      // 1층 상가: 유리 + 간판
      const gy = chh - 3.0 * P;
      x.fillStyle = '#3c3f44';
      x.fillRect(0, gy - 4, cw, 3.0 * P + 4);
      const sg = x.createLinearGradient(0, gy, 0, chh);
      sg.addColorStop(0, '#a9bfcf');
      sg.addColorStop(1, '#5d6f7d');
      x.fillStyle = sg;
      x.fillRect(4, gy + 2, cw - 8, 3.0 * P - 6);
      x.fillStyle = '#3c3f44';
      for (let xx = 4; xx < cw; xx += 1.8 * P) x.fillRect(xx, gy, 3, 3.0 * P);
      // 가게 안 진열(색 덩어리)
      for (let i = 0; i < w * 1.2; i++) {
        x.fillStyle = pickOf(['#c7a77a', '#9c6b4e', '#e4d6bd', '#6d8a6a', '#b85c4d']);
        x.globalAlpha = 0.5;
        x.fillRect(8 + rnd() * (cw - 24), gy + 1.4 * P + rnd() * 1.2 * P, 6 + rnd() * 14, 6 + rnd() * 10);
      }
      x.globalAlpha = 1;
      // 간판
      const sy = chh - 3.8 * P;
      x.fillStyle = signCol;
      x.fillRect(2, sy, cw - 4, 0.8 * P);
      x.fillStyle = 'rgba(255,255,255,0.18)';
      x.fillRect(2, sy, cw - 4, 2);
      textCanvas(x, shop, 0.56 * P, '#ffffff', 800, cw / 2, sy + 0.42 * P);
      // 옥상 난간 선
      x.fillStyle = style.frame;
      x.fillRect(0, 0, cw, 3);
    });
    // 불 켜진 창·간판만 밝게
    const emi = ctex(cw, chh, (x) => {
      x.fillStyle = '#000';
      x.fillRect(0, 0, cw, chh);
      const floors = Math.floor((h - 3.8) / 3);
      const bays = Math.max(2, Math.floor(w / 2.6));
      const bw = cw / bays;
      x.fillStyle = '#ffcf8a';
      for (let f = 0; f < floors; f++) {
        const y = chh - (3.8 + 3 * (f + 1) - 0.8) * P;
        for (let b = 0; b < bays; b++) if (lit[`${f},${b}`]) x.fillRect(b * bw + bw * 0.18, y, bw * 0.64, 1.5 * P);
      }
      x.fillStyle = '#5a5a5a';
      x.fillRect(2, chh - 3.8 * P, cw - 4, 0.8 * P);
      x.fillStyle = '#2a2a2a';
      x.fillRect(4, chh - 3.0 * P + 2, cw - 8, 3.0 * P - 6);
    });
    return { map, emi };
  }
  const STYLES = [
    { wall: '#b5654a', mortar: '#8f4c37', frame: '#5c4a3e', brick: true },
    { wall: '#d9d3c4', mortar: '#c2bba9', frame: '#6b6a64', tile: true },
    { wall: '#c9c4bb', mortar: '#b1aba0', frame: '#57575a' },
    { wall: '#e3dccb', mortar: '#cfc6b1', frame: '#7c6f5f', tile: true },
    { wall: '#9a8f86', mortar: '#7f756d', frame: '#3f3c3a', brick: true },
  ];
  function building(x0, w, h, styleIdx, depth) {
    const st = STYLES[styleIdx % STYLES.length];
    const lit = {};
    for (let i = 0; i < 40; i++) if (rnd() < 0.22) lit[`${Math.floor(rnd() * 10)},${Math.floor(rnd() * 8)}`] = true;
    const shop = SHOPS.shift() || '상가';
    SHOPS.push(shop);
    const { map, emi } = facadeTex(w, h, st, shop, pickOf(SIGN_COL), lit);
    const side = std(new THREE.Color(st.wall).multiplyScalar(0.8));
    const front = std(0xffffff, { map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.85 });
    const d = depth || 10;
    const m = mesh(new THREE.BoxGeometry(w, h, d), [side, side, std(0x8d8780), side, front, side], x0 + w / 2, h / 2, -11 - d / 2);
    // 옥상 — 물탱크, 실외기, 난간
    const top = h;
    if (rnd() < 0.6) {
      const tank = cyl(0.9, 0.9, 1.6, std(0x5d86a8, { roughness: 0.5 }), x0 + w * (0.25 + rnd() * 0.5), top + 1.2, -11 - d * 0.6);
      box(2.2, 0.4, 2.2, std(0x777777), tank.position.x, top + 0.2, tank.position.z);
    }
    for (let i = 0; i < 2 + rnd() * 3; i++) box(0.9, 0.7, 0.6, std(0xd8d6cf), x0 + 1 + rnd() * (w - 2), top + 0.35, -11 - 1.5 - rnd() * (d - 3));
    box(w, 0.9, 0.12, std(0x6f6c66), x0 + w / 2, top + 0.45, -11.06);
    // 가게 앞 차양(일부)
    if (rnd() < 0.5) {
      const aw = mesh(new THREE.BoxGeometry(w * 0.7, 0.08, 1.2), std(pickOf([0xb8432f, 0x2f6f8f, 0x3e7b4f, 0xd09a2b])), x0 + w / 2, 2.85, -10.4);
      aw.rotation.x = 0.18;
    }
    return m;
  }
  {
    let x = -92;
    let i = 0;
    while (x < 98) {
      const w = 8 + Math.floor(rnd() * 5);
      if (x < 6.5 && x + w > -6.5) {
        x = 6.5;
        continue;
      } // 교차로
      if (x < 60 && x + w > 38) {
        x = 60;
        continue;
      } // 학교 자리
      building(x, w, 7 + Math.floor(rnd() * 6) * 3, i++);
      x += w + 0.6;
    }
  }

  // ── 초등학교 (x 39~59, 길 건너편) ──
  {
    const schoolTex = ctex(880, 330, (x, w, h) => {
      x.fillStyle = '#efe4c8';
      x.fillRect(0, 0, w, h);
      speckle(x, w, h, 5000, ['rgba(0,0,0,0.15)', 'rgba(255,255,255,0.4)'], 0.4, 1);
      // 층 띠
      x.fillStyle = '#d98a3d';
      for (const y of [108, 198, 288]) x.fillRect(0, y, w, 6);
      // 창(3층)
      for (let f = 0; f < 3; f++) {
        const y = 120 + f * 90 - 90 + 30;
        for (let i = 0; i < 12; i++) {
          if (f === 2 && (i === 5 || i === 6)) continue; // 1층 현관
          const wx = 26 + i * 70;
          x.fillStyle = '#6a6a66';
          x.fillRect(wx - 2, y - 2, 56, 50);
          const g = x.createLinearGradient(0, y, 0, y + 46);
          g.addColorStop(0, '#9fb7c9');
          g.addColorStop(1, '#5f7584');
          x.fillStyle = g;
          x.fillRect(wx, y, 52, 46);
          x.fillStyle = '#6a6a66';
          x.fillRect(wx + 25, y, 2, 46);
          // 창에 붙인 그림
          if (rnd() < 0.35) {
            x.fillStyle = pickOf(['#f7d354', '#f08f7a', '#8fd1a6', '#9ec5f0']);
            x.fillRect(wx + 6, y + 8, 14, 14);
          }
        }
      }
      // 현관
      x.fillStyle = '#5a5248';
      x.fillRect(376, 232, 128, 98);
      x.fillStyle = '#90a6b6';
      x.fillRect(386, 242, 50, 88);
      x.fillRect(444, 242, 50, 88);
      // 학교 이름
      x.fillStyle = '#2d5f3f';
      x.fillRect(250, 14, 380, 62);
      textCanvas(x, '새싹초등학교', 44, '#ffffff', 800, 440, 46);
      // 시계
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(700, 45, 26, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = '#333';
      x.lineWidth = 3;
      x.stroke();
      x.beginPath();
      x.moveTo(700, 45);
      x.lineTo(700, 27);
      x.moveTo(700, 45);
      x.lineTo(714, 50);
      x.stroke();
    });
    const sMat = std(0xffffff, { map: schoolTex });
    const sSide = std(0xd8ccb0);
    mesh(new THREE.BoxGeometry(22, 12, 9), [sSide, sSide, std(0x8a5a3a), sSide, sMat, sSide], 49, 6, -27.5);
    // 지붕 (경사)
    const roof = mesh(new THREE.CylinderGeometry(0.01, 6.2, 22.6, 4, 1), std(0x9c4f35), 49, 13.3, -27.5);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(0.38, 1, 1);
    // 운동장
    const yard = ctex(256, 128, (x, w, h) => {
      x.fillStyle = '#c7a77e';
      x.fillRect(0, 0, w, h);
      speckle(x, w, h, 4000, ['#b8976d', '#d4b68f'], 0.6, 1.5);
      x.strokeStyle = 'rgba(255,255,255,0.7)';
      x.lineWidth = 2;
      x.beginPath();
      x.ellipse(w / 2, h / 2, w * 0.38, h * 0.32, 0, 0, Math.PI * 2);
      x.stroke();
    });
    decal(20, 12.4, std(0xffffff, { map: yard }), 49, -16.8, 0.02);
    // 노란 울타리 + 교문
    const fenceMat = std(0xf2b705, { roughness: 0.6 });
    for (let x = 39.2; x <= 58.8; x += 1.4) {
      if (x > 46.8 && x < 51.2) continue;
      box(0.08, 1.2, 0.08, fenceMat, x, 0.6, -10.7);
    }
    box(7.6, 0.08, 0.08, fenceMat, 43, 1.1, -10.7);
    box(7.6, 0.08, 0.08, fenceMat, 55, 1.1, -10.7);
    box(7.6, 0.08, 0.08, fenceMat, 43, 0.5, -10.7);
    box(7.6, 0.08, 0.08, fenceMat, 55, 0.5, -10.7);
    const pillar = std(0xd8cdb5);
    box(0.7, 2.2, 0.7, pillar, 46.9, 1.1, -10.7);
    box(0.7, 2.2, 0.7, pillar, 51.1, 1.1, -10.7);
    const plate = ctex(256, 64, (x, w, h) => {
      x.fillStyle = '#3b3a36';
      x.fillRect(0, 0, w, h);
      textCanvas(x, '새싹초등학교', 30, '#f1e6c8', 800, w / 2, h / 2 + 2);
    });
    box(0.5, 0.5, 0.05, std(0xffffff, { map: plate }), 46.9, 1.6, -10.33);
    // 국기 게양대
    cyl(0.05, 0.05, 8, std(0xcccccc, { metalness: 0.6, roughness: 0.3 }), 41, 4, -21);
    box(1.4, 0.9, 0.02, std(0xf3f3f3), 41.7, 7.4, -21);
  }

  // 붉은 노면 + "어린이보호구역" 글씨
  decal(20, 12, std(0xffffff, { map: asphaltTex(2, 1.2), color: 0xb7342b, roughness: 0.92 }), 49, 0, 0.026);
  {
    // 앞 차로(+x 로 달림)는 위쪽이 +x, 건너편 차로(-x 로 달림)는 그 반대
    const t = roadText(['어린이', '보호구역'], 2.4, 7.2);
    decal(2.4, 7.2, markMat(t), 53.5, 1.5, 0.04, -Math.PI / 2);
    decal(2.4, 7.2, markMat(t), 53.5, 4.5, 0.04, -Math.PI / 2);
    decal(2.4, 7.2, markMat(t), 44.5, -1.5, 0.04, Math.PI / 2);
    decal(2.4, 7.2, markMat(t), 44.5, -4.5, 0.04, Math.PI / 2);
  }
  // 앞 인도 노란 방호울타리
  {
    const fm = std(0xf2b705, { roughness: 0.55 });
    const gm = std(0x2f7d4f, { roughness: 0.6 });
    for (const [a, b] of [[40, 46.3], [47.9, 58]]) {
      const n = Math.max(1, Math.round((b - a) / 1.8));
      const step = (b - a) / n;
      for (let i = 0; i <= n; i++) box(0.07, 1.0, 0.07, fm, a + i * step, 0.68, 6.55);
      box(b - a, 0.07, 0.07, fm, (a + b) / 2, 1.15, 6.55);
      box(b - a, 0.07, 0.07, fm, (a + b) / 2, 0.45, 6.55);
      for (let i = 0; i < n; i++) box(step - 0.2, 0.5, 0.03, gm, a + (i + 0.5) * step, 0.8, 6.55);
    }
  }
  // 어린이보호구역 표지판
  function schoolSign(x, z) {
    cyl(0.05, 0.05, 3.2, std(0x9a9a9a, { metalness: 0.5, roughness: 0.4 }), x, 1.6 + 0.18, z);
    const tri = ctex(256, 230, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.beginPath();
      c.moveTo(w / 2, 6);
      c.lineTo(w - 6, h - 6);
      c.lineTo(6, h - 6);
      c.closePath();
      c.fillStyle = '#d6322a';
      c.fill();
      c.beginPath();
      c.moveTo(w / 2, 40);
      c.lineTo(w - 38, h - 26);
      c.lineTo(38, h - 26);
      c.closePath();
      c.fillStyle = '#ffd20a';
      c.fill();
      // 아이 둘
      c.fillStyle = '#111';
      for (const [cx, s] of [[108, 1], [150, 0.8]]) {
        c.beginPath();
        c.arc(cx, 112 - 30 * s, 10 * s, 0, Math.PI * 2);
        c.fill();
        c.fillRect(cx - 9 * s, 120 - 30 * s, 18 * s, 38 * s);
        c.fillRect(cx - 9 * s, 156 - 30 * s, 6 * s, 30 * s);
        c.fillRect(cx + 3 * s, 156 - 30 * s, 6 * s, 30 * s);
      }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.9), std(0xffffff, { map: tri, transparent: true, side: THREE.DoubleSide }));
    m.position.set(x, 3.0, z + 0.06);
    m.castShadow = true;
    scene.add(m);
    const sub = ctex(256, 80, (c, w, h) => {
      c.fillStyle = '#ffd20a';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#111';
      c.lineWidth = 6;
      c.strokeRect(3, 3, w - 6, h - 6);
      textCanvas(c, '어린이보호구역', 34, '#111', 800, w / 2, h / 2 + 2);
    });
    box(1.0, 0.32, 0.03, std(0xffffff, { map: sub }), x, 2.35, z + 0.06);
  }
  schoolSign(39.5, 9.6);
  schoolSign(58.6, 9.6);

  PHASE = 'prop';
  // ── 소화전 (x -30) — 빨간 연석·노면 + "소방시설 주정차금지" ──
  {
    const red = std(0xc92a24, { roughness: 0.45 });
    const g = new THREE.Group();
    g.position.set(-30, 0.18, 6.75);
    scene.add(g);
    cyl(0.17, 0.2, 0.75, red, 0, 0.375, 0, g);
    cyl(0.24, 0.24, 0.1, red, 0, 0.78, 0, g);
    const dome = mesh(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.83, 0, g);
    void dome;
    for (const s of [-1, 1]) {
      const n = cyl(0.07, 0.07, 0.22, red, s * 0.24, 0.5, 0, g);
      n.rotation.z = Math.PI / 2;
      cyl(0.09, 0.09, 0.05, std(0xd8b04a, { metalness: 0.6, roughness: 0.3 }), s * 0.36, 0.5, 0, g).rotation.z = Math.PI / 2;
    }
    cyl(0.28, 0.3, 0.08, std(0x777777), 0, 0.04, 0, g);
    box(10, 0.205, 0.26, redPaint, -30, 0.1, 6.0);
    box(10, 0.012, 0.16, redPaint, -30, 0.036, 5.6, null, true);
    const t = markTex(['소방시설', '주정차금지'], 512, 256, '#ffffff', '#c8352b');
    decal(3.2, 1.6, markMat(t), -30, 4.3, 0.04);
    decal(3.2, 1.6, std(0xc8352b, { roughness: 0.7, transparent: true, opacity: 0.75, depthWrite: false }), -30, 4.3, 0.035);
  }

  // ── 버스정류소 (x 20) ──
  {
    const frame = std(0x50565e, { metalness: 0.4, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfd8e8, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.1 });
    box(5.2, 0.14, 1.9, std(0x3b4b5e), 20, 2.6, 8.6);
    for (const x of [17.6, 22.4]) box(0.1, 2.5, 0.1, frame, x, 1.43, 9.45);
    for (const x of [17.6, 22.4]) box(0.1, 2.5, 0.1, frame, x, 1.43, 7.8);
    box(4.8, 2.0, 0.04, glass, 20, 1.35, 9.45, null, true);
    box(4.2, 0.08, 0.45, std(0x8b6a4c), 20, 0.62, 9.1);
    const route = ctex(256, 384, (c, w, h) => {
      c.fillStyle = '#f4f4f0';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1f5fa8';
      c.fillRect(0, 0, w, 64);
      textCanvas(c, '시청앞', 34, '#fff', 800, w / 2, 34);
      textCanvas(c, '정류소 21-345', 18, '#555', 600, w / 2, 86);
      const routes = [['12', '#2f7d4f'], ['720', '#1f5fa8'], ['1100', '#c23a2b'], ['3-1', '#2f7d4f'], ['165', '#1f5fa8']];
      routes.forEach(([n, col], i) => {
        c.fillStyle = col;
        c.fillRect(24, 116 + i * 50, 70, 36);
        textCanvas(c, n, 22, '#fff', 800, 59, 135 + i * 50);
        c.fillStyle = '#bbb';
        c.fillRect(110, 132 + i * 50, 120, 4);
      });
    });
    box(1.2, 1.8, 0.06, std(0xffffff, { map: route, emissiveMap: route, emissive: 0xffffff, emissiveIntensity: 0.25 }), 22.0, 1.4, 9.4);
    // 정류소 표지판
    cyl(0.05, 0.05, 3.2, std(0x9a9a9a, { metalness: 0.5, roughness: 0.4 }), 23.8, 1.78, 6.6);
    const bus = ctex(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#1f5fa8';
      c.beginPath();
      c.arc(w / 2, h / 2, 60, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 6;
      c.stroke();
      textCanvas(c, '버스', 40, '#fff', 800, w / 2, h / 2 + 2);
    });
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), std(0xffffff, { map: bus, transparent: true, side: THREE.DoubleSide }));
    bm.position.set(23.8, 3.1, 6.66);
    bm.castShadow = true;
    scene.add(bm);
    // 노면 "버스정류소" 노란 상자
    const t = markTex(['버스정류소'], 768, 160, '#f0b62d', '#f0b62d');
    decal(7, 1.5, markMat(t), 20, 4.5, 0.04);
  }

  // ── 볼라드 (횡단보도·교차로 모퉁이) ──
  {
    const bm = std(0x45484d, { roughness: 0.5 });
    const band = std(0xf0b62d, { roughness: 0.5 });
    const spots = [[-52, 6.6], [-50, 6.6], [-48, 6.6], [-7.5, 6.6], [-6.6, 7.5], [7.5, 6.6], [6.6, 7.5]];
    for (const [x, z] of spots) {
      cyl(0.11, 0.12, 0.8, bm, x, 0.58, z);
      cyl(0.115, 0.115, 0.08, band, x, 0.85, z);
    }
    // 횡단보도 앞 점형 블록
    const dots = ctex(64, 64, (c, w, h) => {
      c.fillStyle = '#e4ad1c';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#c99510';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        c.beginPath();
        c.arc(8 + i * 16, 8 + j * 16, 4, 0, Math.PI * 2);
        c.fill();
      }
    });
    decal(3.4, 0.6, std(0xffffff, { map: dots }), -50, 6.7, 0.186);
  }

  // ── 전봇대 + 전깃줄 (건너편) ──
  {
    const concrete = std(0x9d9a92, { roughness: 0.8 });
    const poles = [];
    for (let x = -86; x < 96; x += 24) {
      if (Math.abs(x) < 8) continue;
      cyl(0.16, 0.22, 11, concrete, x, 5.5, -9.4);
      box(2.4, 0.14, 0.14, concrete, x, 10.2, -9.4);
      if (rnd() < 0.4) cyl(0.35, 0.35, 0.9, std(0x6f7277), x + 0.45, 8.6, -9.4);
      poles.push(x);
    }
    const wire = new THREE.LineBasicMaterial({ color: 0x2b2b2b });
    for (let i = 0; i < poles.length - 1; i++) {
      for (const dz of [-1.0, 0, 1.0]) {
        const a = new THREE.Vector3(poles[i], 10.25, -9.4 + dz * 0.0);
        const pts = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          const x = poles[i] + (poles[i + 1] - poles[i]) * t;
          pts.push(new THREE.Vector3(x, 10.25 - Math.sin(t * Math.PI) * 0.7, -9.4 + dz * 1.1));
        }
        void a;
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
      }
    }
  }

  // ── 가로수 (건너편) + 가로등 ──
  {
    const trunk = std(0x5b4636);
    const leaves = [0x58784a, 0x4c6d40, 0x6a8a52, 0x7b8f4c].map((c) => std(c, { flatShading: true, roughness: 0.9 }));
    for (let x = -88; x < 96; x += 12) {
      if (Math.abs(x) < 9 || (x > 37 && x < 61) || Math.abs(((x + 86) % 24)) < 2) continue;
      const tx = x + (rnd() - 0.5) * 2;
      box(1.2, 0.02, 1.2, std(0x5a5650), tx, 0.19, -7.4);
      cyl(0.13, 0.18, 3.2, trunk, tx, 1.78, -7.4);
      for (let k = 0; k < 4; k++) {
        const s = 0.9 + rnd() * 0.7;
        const l = mesh(new THREE.IcosahedronGeometry(s, 1), pickOf(leaves), tx + (rnd() - 0.5) * 1.4, 3.6 + rnd() * 1.3, -7.4 + (rnd() - 0.5) * 1.2);
        l.scale.y = 0.85;
      }
    }
    // 가로등: 건너편에서 길 쪽으로 팔을 뻗음
    const pm = std(0x5e636a, { metalness: 0.5, roughness: 0.4 });
    const lamp = std(0xfff0d0, { emissive: 0xffd28a, emissiveIntensity: 1.6 });
    const glowTex = ctex(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,210,140,0.55)');
      g.addColorStop(1, 'rgba(255,210,140,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    const glow = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let x = -78; x < 96; x += 30) {
      if (Math.abs(x) < 9) continue;
      cyl(0.09, 0.12, 8, pm, x, 4, -6.8);
      box(0.1, 0.1, 2.6, pm, x, 7.9, -5.6);
      box(0.5, 0.14, 0.8, lamp, x, 7.8, -4.4);
      decal(9, 9, glow, x, -4.0, 0.05);
    }
  }

  PHASE = 'road';
  // ── 황색 연석선: 실선 = 주정차 금지, 점선 = 주차 금지(5분 이내 정차 허용) ──
  function edge(x0, x1, z, dashed) {
    if (!dashed) {
      box(x1 - x0, 0.011, 0.14, yellow, (x0 + x1) / 2, 0.036, z, null, true);
      return;
    }
    for (let x = x0; x < x1 - 1; x += 4) box(2, 0.011, 0.14, yellow, x + 1, 0.036, z, null, true);
  }
  edge(-95, -56.5, 5.72, true);
  edge(-44, -35, 5.72);
  edge(-25, -6.6, 5.72);
  edge(6.6, 13.5, 5.72);
  edge(26.5, 59, 5.72);
  edge(59, 95, 5.72, true);
  edge(-95, -53, -5.72, true);
  edge(-47, -20, -5.72, true);
  edge(-20, -6.6, -5.72);
  edge(6.6, 20, -5.72);
  edge(20, 95, -5.72, true);

  PHASE = 'prop';
  // ── 표지판 ──
  const poleMat = std(0xa9adb2, { metalness: 0.55, roughness: 0.35 });
  const signBack = std(0x989ca1, { metalness: 0.5, roughness: 0.45 });
  const noParkTex = ctex(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(128, 128, 127, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#cf252b';
    c.beginPath();
    c.arc(128, 128, 119, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1d4f9c';
    c.beginPath();
    c.arc(128, 128, 95, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.beginPath();
    c.arc(128, 128, 95, 0, Math.PI * 2);
    c.clip();
    c.strokeStyle = '#cf252b';
    c.lineWidth = 20;
    c.beginPath();
    c.moveTo(52, 52);
    c.lineTo(204, 204);
    c.moveTo(204, 52);
    c.lineTo(52, 204);
    c.stroke();
    c.restore();
  });
  const subPlate = (text, bg, fg) =>
    ctex(320, 112, (c, w, h) => {
      c.fillStyle = bg || '#ffffff';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = fg || '#111111';
      c.lineWidth = 7;
      c.strokeRect(5, 5, w - 10, h - 10);
      c.font = `800 46px ${FONT}`;
      const s = Math.min(1, (w - 40) / c.measureText(text).width);
      textCanvas(c, text, 46 * s, fg || '#111111', 800, w / 2, h / 2 + 3);
    });
  function signPost(x, z, yaw, h, parts, thick) {
    const g = new THREE.Group();
    g.position.set(x, 0.18, z);
    g.rotation.y = yaw;
    scene.add(g);
    cyl(thick || 0.04, (thick || 0.04) * 1.12, h, poleMat, 0, h / 2, 0, g, 12);
    cyl((thick || 0.04) * 1.2, (thick || 0.04) * 1.2, 0.04, poleMat, 0, h + 0.02, 0, g, 12);
    for (const p of parts) {
      const face = std(0xffffff, { map: p.tex, roughness: 0.45 });
      let m;
      if (p.r) {
        m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.02, 48), [signBack, face, signBack]);
        m.rotation.x = Math.PI / 2;
      } else m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, 0.02), [signBack, signBack, signBack, signBack, face, signBack]);
      m.position.set(0, p.y, 0.055);
      m.castShadow = true;
      g.add(m);
      const half = p.r || p.h / 2;
      box(0.11, 0.035, 0.08, poleMat, 0, p.y + half * 0.55, 0.025, g, true);
      box(0.11, 0.035, 0.08, poleMat, 0, p.y - half * 0.55, 0.025, g, true);
    }
    return g;
  }
  // 소방용수 표지판(빨간 원형) — 빨간 연석이 없는 곳에서는 이 표지판으로 소화전 자리를 안다
  const fireWaterTex = ctex(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(128, 128, 127, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#d0222a';
    c.beginPath();
    c.arc(128, 128, 116, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(128, 128, 104, 0, Math.PI * 2);
    c.stroke();
    textCanvas(c, '소방', 66, '#ffffff', 800, 128, 98);
    textCanvas(c, '용수', 66, '#ffffff', 800, 128, 166);
  });
  fireWaterTex.center.set(0.5, 0.5);
  fireWaterTex.rotation = Math.PI / 2; // 둥근 판(원기둥 윗면)에 붙이면 90도 돌아가므로 되돌림
  signPost(-28.7, 7.05, -0.35, 1.85, [{ r: 0.27, tex: fireWaterTex, y: 1.66 }], 0.035);
  // 교차로 도로명판
  signPost(-7.7, 9.6, 0, 3.3, [{
    w: 1.3, h: 0.44, y: 3.05,
    tex: ctex(520, 176, (c, w, h) => {
      c.fillStyle = '#1e56a0';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 6;
      c.strokeRect(8, 8, w - 16, h - 16);
      textCanvas(c, '시청로', 74, '#ffffff', 800, w * 0.42, h * 0.43);
      textCanvas(c, 'Sicheong-ro', 24, '#ffffff', 600, w * 0.42, h * 0.8);
      textCanvas(c, '1→199', 30, '#ffffff', 700, w * 0.84, h * 0.5);
    }),
  }]);
  // 불법주정차 단속 CCTV — 인도 끝 금속 기둥에서 도로 위로 긴 팔, 끝에 전광판과 카메라
  const steel = std(0x5b5f64, { metalness: 0.55, roughness: 0.42 });
  const steelL = std(0x7a7e84, { metalness: 0.55, roughness: 0.4 });
  const ledTexes = [];
  function rod(parent, a, b, r, mat) {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = cyl(r, r, d.length(), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, parent, 8);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return m;
  }
  function ledTexture(text) {
    const W = 2048;
    const H = 96;
    const t = ctex(W, H, (c) => {
      c.fillStyle = '#0b0b0b';
      c.fillRect(0, 0, W, H);
      c.font = `800 66px ${FONT}`;
      c.fillStyle = '#ff3a1c';
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      const unit = c.measureText(text).width;
      for (let x = 20; x < W; x += unit + 20) c.fillText(text, x, H / 2 + 3);
      // LED 점 느낌: 가는 검은 격자
      c.fillStyle = 'rgba(0,0,0,0.55)';
      for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);
      for (let x = 0; x < W; x += 4) c.fillRect(x, 0, 1, H);
    });
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(0.42, 1);
    ledTexes.push(t);
    return t;
  }
  function cctv(x, z, text) {
    const g = new THREE.Group();
    g.position.set(x, 0.18, z);
    scene.add(g);
    // 받침판 · 앵커볼트
    box(0.72, 0.05, 0.72, steel, 0, 0.025, 0, g);
    for (const [bx, bz] of [[0.26, 0.26], [-0.26, 0.26], [0.26, -0.26], [-0.26, -0.26]]) cyl(0.025, 0.025, 0.09, steelL, bx, 0.07, bz, g, 6);
    // 팔각 기둥
    cyl(0.12, 0.17, 7.6, steel, 0, 3.85, 0, g, 8);
    cyl(0.13, 0.13, 0.05, steelL, 0, 7.66, 0, g, 8);
    // 제어함(기둥 뒤쪽)
    box(0.46, 0.72, 0.28, std(0x8d9197, { metalness: 0.4, roughness: 0.45 }), 0, 1.7, 0.27, g);
    box(0.012, 0.6, 0.29, steel, 0.0, 1.7, 0.272, g, true);
    for (let i = 0; i < 4; i++) box(0.3, 0.012, 0.01, steel, 0, 1.95 - i * 0.05, 0.415, g, true);
    const sticker = ctex(256, 128, (c, w, h) => {
      c.fillStyle = '#f2f2ee';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1e56a0';
      c.fillRect(0, 0, w, 40);
      textCanvas(c, '방범·단속 CCTV', 26, '#ffffff', 800, w / 2, 21);
      textCanvas(c, '촬영 중', 40, '#1b1916', 800, w / 2, 84);
    });
    const st = mesh(new THREE.PlaneGeometry(0.3, 0.15), std(0xffffff, { map: sticker }), 0, 1.45, 0.415, g, true);
    void st;
    // 도로 위로 뻗은 팔 + 보강대
    const top = 6.95;
    const arm = cyl(0.075, 0.055, 7.4, steel, 0, top, -3.7, g, 10);
    arm.rotation.x = Math.PI / 2;
    box(0.3, 0.36, 0.3, steelL, 0, top, 0, g);
    rod(g, new THREE.Vector3(0, 7.55, 0), new THREE.Vector3(0, top, -2.9), 0.035, steel);
    cyl(0.06, 0.06, 0.06, steelL, 0, top, -7.42, g, 10).rotation.x = Math.PI / 2;
    // 전광판 (양면, 흐르는 붉은 글씨)
    const lt = ledTexture(text);
    const face = std(0xffffff, { map: lt, emissiveMap: lt, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.4 });
    const frame = std(0x2a2c30, { metalness: 0.4, roughness: 0.5 });
    const bz = -4.9;
    mesh(new THREE.BoxGeometry(0.2, 0.5, 2.7), [face, face, frame, frame, frame, frame], 0, top - 0.55, bz, g);
    for (const dz of [-1.0, 1.0]) cyl(0.025, 0.025, 0.32, steelL, 0, top - 0.16, bz + dz, g, 6);
    // 카메라 (팔 끝)
    box(0.08, 0.36, 0.08, steelL, 0, top - 0.2, -7.0, g);
    const cam = new THREE.Group();
    cam.position.set(0, top - 0.42, -7.0);
    cam.rotation.z = 0.28; // 다가오는 차 쪽을 내려다봄
    g.add(cam);
    const white = std(0xefefea, { roughness: 0.35 });
    box(0.52, 0.2, 0.22, white, -0.05, 0, 0, cam);
    box(0.6, 0.03, 0.28, white, -0.05, 0.12, 0, cam);
    const lens = cyl(0.075, 0.075, 0.04, std(0x0f1014, { roughness: 0.08, metalness: 0.7 }), -0.33, 0, 0, cam, 18);
    lens.rotation.z = Math.PI / 2;
    const led = box(0.03, 0.03, 0.03, std(0xff2a1a, { emissive: 0xff2a1a, emissiveIntensity: 2 }), -0.31, -0.08, 0.08, cam, true);
    mesh(new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0x24272c, { roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.9 }), 0, top - 0.06, -6.2, g);
    return led;
  }
  const cctvLeds = [cctv(-23.4, 9.65, '불법주정차 단속중 · 소화전 주변 주정차 금지 ·'), cctv(60.8, 9.65, '어린이보호구역 · 평일 08~20시 주정차 금지 · 불법주정차 단속중 ·')];
  // 어린이보호구역 주정차금지
  signPost(38.4, 9.55, -0.7, 2.7, [{ r: 0.32, tex: noParkTex, y: 2.42 }, { w: 0.7, h: 0.22, tex: subPlate('어린이보호구역'), y: 1.93 }, { w: 0.7, h: 0.22, tex: subPlate('평일 08:00~20:00'), y: 1.67 }]);
  // 인도 장면 주정차금지
  signPost(76.4, 9.55, -0.7, 2.7, [{ r: 0.32, tex: noParkTex, y: 2.42 }, { w: 0.64, h: 0.22, tex: subPlate('보도 전 구간'), y: 1.93 }]);

  PHASE = 'car';
  // ── 차: 옆모습 윤곽을 입체로 + 휠하우스·창·기둥·거울·문틈·번호판·바닥 그림자 ──
  const trimMat = std(0x16171a, { roughness: 0.55 });
  const chromeMat = std(0xdfe2e6, { metalness: 0.9, roughness: 0.16 });
  const tireMat = std(0x1a1b1e, { roughness: 0.93 });
  const rimMat = std(0xc5c9cf, { metalness: 0.78, roughness: 0.26 });
  const wellMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 1, side: THREE.DoubleSide });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x172130, roughness: 0.03, metalness: 0.72, transparent: true, opacity: 0.9 });
  const interiorMat = std(0x262422);
  const headMat = () => std(0xf4f1e6, { emissive: 0xfff4d6, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.35 });
  const tailMat = () => std(0x9e1b17, { emissive: 0xff2a1a, emissiveIntensity: 0.25, roughness: 0.25 });
  const amberMat = () => std(0xd98a1a, { emissive: 0xff9a1a, emissiveIntensity: 0, roughness: 0.3 });
  const HANGUL = ['가', '나', '다', '라', '마', '거', '너', '더', '러', '머', '버', '서', '어', '저', '고', '노', '도', '로', '모', '보', '소', '오', '조', '구', '누', '두', '루', '무', '부', '수', '우', '주', '하', '허', '호'];
  function plateTex(no) {
    const text = no || `${100 + Math.floor(rnd() * 899)}${pickOf(HANGUL)} ${1000 + Math.floor(rnd() * 8999)}`;
    return ctex(336, 72, (c, w, h) => {
      c.fillStyle = '#f6f6f1';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#1a1a1a';
      c.lineWidth = 3;
      c.strokeRect(3, 3, w - 6, h - 6);
      // 왼쪽 위조방지 무늬 자리
      c.fillStyle = '#c9d3e4';
      c.fillRect(10, 12, 14, h - 24);
      textCanvas(c, text, 46, '#151515', 800, w / 2 + 8, h / 2 + 2);
    });
  }
  const shadowMat = new THREE.MeshBasicMaterial({
    map: ctex(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.7)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.38)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }),
    transparent: true,
    depthWrite: false,
  });
  function contact(g, L, W) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.1, W * 1.35), shadowMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.014;
    g.add(m);
  }
  function shapeOf(pts) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p[0] === 'q') s.quadraticCurveTo(p[1], p[2], p[3], p[4]);
      else if (p[0] === 'a') s.absarc(p[1], p[2], p[3], p[4], p[5], p[6]);
      else s.lineTo(p[0], p[1]);
    }
    return s;
  }
  function extrude(shape, width, bevel) {
    const d = width - (bevel ? bevel * 2 : 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 3, curveSegments: 16 });
    geo.translate(0, 0, -d / 2);
    return geo;
  }
  // 아래 몸체 윤곽: 바닥선에 두 바퀴 자리를 둥글게 파낸 뒤 앞→위→뒤로 돈다
  function lowerPts(sp) {
    const { gb, xr, xf, A, ay } = sp;
    return [[sp.rb, gb], [xr - A, gb], [xr - A, ay], ['a', xr, ay, A, Math.PI, 0, true], [xr + A, gb], [xf - A, gb], [xf - A, ay], ['a', xf, ay, A, Math.PI, 0, true], [xf + A, gb], ...sp.nose];
  }
  function wheel(parent, x, z, r, w) {
    const side = z > 0 ? 1 : -1;
    const g = new THREE.Group();
    g.position.set(x, r, z);
    parent.add(g);
    const t = cyl(r, r, w, tireMat, 0, 0, 0, g, 28);
    t.rotation.x = Math.PI / 2;
    const sw = mesh(new THREE.TorusGeometry(r * 0.86, r * 0.13, 8, 28), tireMat, 0, 0, side * w * 0.5, g);
    void sw;
    const rec = cyl(r * 0.6, r * 0.6, w + 0.004, trimMat, 0, 0, 0, g, 22);
    rec.rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(r * 0.6, r * 0.045, 6, 28), rimMat, 0, 0, side * (w / 2 + 0.006), g);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const sp = box(r * 0.12, r * 0.56, 0.025, rimMat, Math.sin(a) * r * 0.3, Math.cos(a) * r * 0.3, side * (w / 2 + 0.008), g, true);
      sp.rotation.z = -a;
    }
    const hub = cyl(r * 0.15, r * 0.15, w + 0.03, chromeMat, 0, 0, 0, g, 12);
    hub.rotation.x = Math.PI / 2;
    return g;
  }
  function well(parent, x, ay, A, W) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(A - 0.012, A - 0.012, W - 0.05, 20, 1, true, Math.PI / 2, Math.PI), wellMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, ay, 0);
    parent.add(m);
  }
  const SPECS = {
    sedan: {
      L: 4.7, W: 1.84, gb: 0.2, xr: -1.42, xf: 1.42, A: 0.42, ay: 0.34, tireR: 0.33, tireW: 0.22, rb: -2.25,
      nose: [[2.3, 0.2], [2.37, 0.45], ['q', 2.41, 0.78, 2.12, 0.86], [1.05, 1.0], [-1.3, 1.0], [-1.95, 1.02], ['q', -2.37, 1.0, -2.38, 0.74], [-2.36, 0.3], ['q', -2.35, 0.2, -2.25, 0.2]],
      cabin: [[-1.32, 0.99], ['q', -0.98, 1.42, -0.68, 1.45], [0.42, 1.45], ['q', 0.72, 1.43, 1.12, 0.99]],
      windows: [[[0.07, 1.04], [0.07, 1.4], [0.42, 1.4], ['q', 0.66, 1.385, 1.02, 1.03]], [[-1.2, 1.03], ['q', -0.94, 1.37, -0.66, 1.4], [-0.07, 1.4], [-0.07, 1.04]]],
      pillars: [0], pillarY: 1.22, pillarH: 0.4, seats: [-0.15, -1.0], seatY: 1.2,
      seams: [1.02, 0.0, -1.2], seamY: 0.66, seamH: 0.62, handles: [0.32, -0.78], handleY: 0.86, mirror: [0.98, 1.06],
      grille: { x: 2.37, y: 0.6, w: 0.8, h: 0.2 }, head: { x: 2.3, y: 0.74, z: 0.56, w: 0.44, h: 0.12 }, tail: { x: -2.36, y: 0.86, z: 0.58, w: 0.42, h: 0.13 },
      plateF: { x: 2.4, y: 0.45 }, plateR: { x: -2.39, y: 0.64 }, wiper: [1.14, 1.0], fin: [-0.6, 1.48], bumperF: 2.33, bumperR: -2.33,
    },
    compact: {
      L: 3.6, W: 1.62, gb: 0.17, xr: -1.18, xf: 1.2, A: 0.37, ay: 0.3, tireR: 0.29, tireW: 0.19, rb: -1.72,
      nose: [[1.72, 0.17], [1.8, 0.42], ['q', 1.83, 0.72, 1.56, 0.8], [0.85, 0.96], [-1.72, 0.98], ['q', -1.82, 0.97, -1.82, 0.78], [-1.8, 0.3], ['q', -1.79, 0.17, -1.72, 0.17]],
      cabin: [[-1.76, 0.97], [-1.7, 1.47], ['q', -1.62, 1.53, -1.42, 1.53], [0.28, 1.52], ['q', 0.5, 1.49, 0.98, 0.95]],
      windows: [[[-0.02, 1.02], [-0.02, 1.46], [0.27, 1.47], ['q', 0.47, 1.44, 0.92, 1.0]], [[-1.66, 1.02], [-1.62, 1.44], [-0.14, 1.46], [-0.14, 1.02]]],
      pillars: [-0.08], pillarY: 1.24, pillarH: 0.44, seats: [-0.3, -1.2], seatY: 1.18,
      seams: [0.88, -0.08, -1.3], seamY: 0.62, seamH: 0.6, handles: [0.2, -0.85], handleY: 0.84, mirror: [0.85, 1.02],
      grille: { x: 1.8, y: 0.52, w: 0.6, h: 0.14 }, head: { x: 1.72, y: 0.7, z: 0.5, w: 0.36, h: 0.14 }, tail: { x: -1.82, y: 0.88, z: 0.62, w: 0.28, h: 0.2 },
      plateF: { x: 1.83, y: 0.36 }, plateR: { x: -1.83, y: 0.62 }, wiper: [0.95, 0.97], fin: null, bumperF: 1.77, bumperR: -1.78,
    },
    suv: {
      L: 4.75, W: 1.9, gb: 0.25, xr: -1.42, xf: 1.45, A: 0.46, ay: 0.39, tireR: 0.38, tireW: 0.25, rb: -2.28,
      nose: [[2.3, 0.25], [2.38, 0.52], ['q', 2.43, 0.96, 2.15, 1.01], [1.05, 1.14], [-2.25, 1.15], ['q', -2.41, 1.13, -2.41, 0.9], [-2.39, 0.36], ['q', -2.38, 0.25, -2.28, 0.25]],
      cabin: [[-2.29, 1.13], [-2.2, 1.72], ['q', -2.1, 1.79, -1.9, 1.79], [0.5, 1.79], ['q', 0.78, 1.75, 1.18, 1.13]],
      windows: [[[0.1, 1.18], [0.1, 1.72], [0.5, 1.73], ['q', 0.74, 1.7, 1.1, 1.18]], [[-1.08, 1.18], [-1.08, 1.72], [-0.06, 1.73], [-0.06, 1.18]], [[-2.13, 1.2], [-2.07, 1.68], [-1.24, 1.72], [-1.24, 1.18]]],
      pillars: [0.02, -1.16], pillarY: 1.45, pillarH: 0.55, seats: [-0.1, -0.95], seatY: 1.38,
      seams: [1.05, 0.02, -1.16], seamY: 0.75, seamH: 0.75, handles: [0.4, -0.7], handleY: 1.02, mirror: [1.0, 1.2],
      grille: { x: 2.4, y: 0.72, w: 0.95, h: 0.32 }, head: { x: 2.33, y: 0.9, z: 0.62, w: 0.42, h: 0.12 }, tail: { x: -2.4, y: 1.02, z: 0.66, w: 0.34, h: 0.2 },
      plateF: { x: 2.44, y: 0.5 }, plateR: { x: -2.42, y: 0.7 }, wiper: [1.16, 1.14], fin: [-1.7, 1.81], rails: [3.2, -0.5, 1.82], bumperF: 2.36, bumperR: -2.38,
    },
  };
  function buildCar(type, color, opt) {
    const sp = SPECS[type];
    const o = opt || {};
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const body = std(color, { roughness: 0.26, metalness: 0.42 });
    const W = sp.W;
    mesh(extrude(shapeOf(lowerPts(sp)), W, 0.05), body, 0, 0, 0, inner);
    const cw = W - 0.2;
    mesh(extrude(shapeOf(sp.cabin), cw, 0.03), body, 0, 0, 0, inner);
    for (const wp of sp.windows) mesh(extrude(shapeOf(wp), cw + 0.035, 0), glassMat, 0, 0, 0, inner, true);
    for (const px of sp.pillars) box(0.1, sp.pillarH, cw + 0.04, trimMat, px, sp.pillarY, 0, inner, true);
    for (const hx of sp.seats) for (const s of [-1, 1]) box(0.12, 0.24, 0.4, interiorMat, hx, sp.seatY, s * cw * 0.26, inner, true);
    for (const wx of [sp.xr, sp.xf]) {
      well(inner, wx, sp.ay, sp.A, W);
      for (const s of [-1, 1]) wheel(g, wx, s * (W / 2 - sp.tireW / 2 - 0.03), sp.tireR, sp.tireW);
    }
    const zs = W / 2 + 0.006;
    for (const sx of sp.seams) for (const s of [-1, 1]) box(0.014, sp.seamH, 0.008, trimMat, sx, sp.seamY, s * zs, inner, true);
    for (const hx of sp.handles) for (const s of [-1, 1]) box(0.17, 0.035, 0.03, chromeMat, hx, sp.handleY, s * (zs + 0.008), inner, true);
    for (const s of [-1, 1]) {
      box(0.06, 0.035, 0.1, trimMat, sp.mirror[0], sp.mirror[1] - 0.05, s * (W / 2 + 0.04), inner);
      box(0.09, 0.1, 0.16, body, sp.mirror[0] - 0.02, sp.mirror[1], s * (W / 2 + 0.13), inner);
      box(0.01, 0.075, 0.13, glassMat, sp.mirror[0] - 0.068, sp.mirror[1], s * (W / 2 + 0.13), inner, true);
    }
    box(0.06, sp.grille.h, sp.grille.w, trimMat, sp.grille.x, sp.grille.y, 0, inner, true);
    for (let i = 0; i < 3; i++) box(0.065, 0.014, sp.grille.w * 0.9, chromeMat, sp.grille.x + 0.004, sp.grille.y - sp.grille.h * 0.3 + i * sp.grille.h * 0.3, 0, inner, true);
    const tails = [];
    const ambers = [];
    for (const s of [-1, 1]) {
      box(0.07, sp.head.h, sp.head.w, headMat(), sp.head.x, sp.head.y, s * sp.head.z, inner, true);
      box(0.072, sp.head.h * 0.25, sp.head.w * 0.9, std(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 }), sp.head.x + 0.003, sp.head.y - sp.head.h * 0.42, s * sp.head.z, inner, true); // 주간등
      const tm = tailMat();
      tails.push(tm);
      box(0.07, sp.tail.h, sp.tail.w, tm, sp.tail.x, sp.tail.y, s * sp.tail.z, inner, true);
      box(0.3, sp.tail.h * 0.9, 0.03, tm, sp.tail.x + 0.17, sp.tail.y, s * (W / 2 + 0.002), inner, true);
      const am1 = amberMat();
      const am2 = amberMat();
      ambers.push(am1, am2);
      box(0.06, 0.06, 0.14, am1, sp.head.x - 0.04, sp.head.y - 0.11, s * (sp.head.z + sp.head.w / 2 - 0.05), inner, true);
      box(0.07, 0.03, 0.02, am1, sp.mirror[0] - 0.01, sp.mirror[1] - 0.045, s * (W / 2 + 0.215), inner, true); // 거울 깜빡이
      box(0.06, 0.06, 0.14, am2, sp.tail.x + 0.005, sp.tail.y - 0.12, s * sp.tail.z, inner, true);
    }
    box(0.15, 0.17, W - 0.1, trimMat, sp.bumperF, sp.gb + 0.12, 0, inner);
    box(0.15, 0.17, W - 0.1, trimMat, sp.bumperR, sp.gb + 0.12, 0, inner);
    box(sp.xf - sp.xr - sp.A * 2 - 0.08, 0.07, W + 0.008, trimMat, (sp.xf + sp.xr) / 2, sp.gb + 0.05, 0, inner, true);
    const pm = new THREE.MeshStandardMaterial({ map: plateTex(o.plate), roughness: 0.5 });
    const pf = mesh(new THREE.PlaneGeometry(0.52, 0.11), pm, sp.plateF.x, sp.plateF.y, 0, inner, true);
    pf.rotation.y = Math.PI / 2;
    const pb = mesh(new THREE.PlaneGeometry(0.52, 0.11), pm, sp.plateR.x, sp.plateR.y, 0, inner, true);
    pb.rotation.y = -Math.PI / 2;
    for (const z of [-0.32, 0.22]) {
      const w = box(0.025, 0.018, 0.56, trimMat, sp.wiper[0], sp.wiper[1], z, inner, true);
      w.rotation.y = 0.18;
    }
    if (sp.fin) box(0.17, 0.065, 0.05, trimMat, sp.fin[0], sp.fin[1], 0, inner, true);
    if (sp.rails) for (const s of [-1, 1]) box(sp.rails[0], 0.05, 0.05, std(0x2a2b2e, { metalness: 0.5, roughness: 0.4 }), sp.rails[1], sp.rails[2], s * cw * 0.42, inner);
    if (o.taxi) {
      const ts = ctex(256, 96, (c, w, h) => {
        c.fillStyle = '#ffd23a';
        c.fillRect(0, 0, w, h);
        textCanvas(c, '개인택시', 50, '#1b1916', 800, w / 2, h / 2 + 3);
      });
      const tm = std(0xffffff, { map: ts, emissiveMap: ts, emissive: 0xffffff, emissiveIntensity: 0.55 });
      mesh(new THREE.BoxGeometry(0.28, 0.17, 0.62), [tm, tm, std(0xffd23a), std(0x333333), tm, tm], -0.15, 1.55, 0, inner);
      const ttx = ctex(256, 64, (c, w, h) => {
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, w, h);
        textCanvas(c, '서울 택시 1588-0000', 28, '#1b1916', 700, w / 2, h / 2 + 2);
      });
      for (const s of [-1, 1]) {
        const d = mesh(new THREE.PlaneGeometry(1.1, 0.12), std(0xffffff, { map: ttx }), 0.45, 0.78, s * (zs + 0.003), inner, true);
        if (s < 0) d.rotation.y = Math.PI;
      }
    }
    contact(g, sp.L, W);
    scene.add(g);
    return {
      g, inner, body, len: sp.L,
      setBrake(on) { for (const m of tails) m.emissiveIntensity = on ? 2.4 : 0.25; },
      setHazard(on) { for (const m of ambers) m.emissiveIntensity = on ? 3.2 : 0; },
    };
  }

  // 1톤 화물차 (앞이 납작한 캡오버 + 알루미늄 짐칸)
  function buildTruck(color) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const body = std(color, { roughness: 0.32, metalness: 0.28 });
    const cx = 1.55;
    mesh(extrude(shapeOf([[-0.85, 0.5], [-0.27, 0.5], [-0.27, 0.36], ['a', 0.15, 0.36, 0.42, Math.PI, 0, true], [0.57, 0.5], [0.9, 0.5], ['q', 0.95, 0.8, 0.92, 1.05], [0.89, 1.75], ['q', 0.85, 2.0, 0.55, 2.04], [-0.85, 2.02]]), 1.72, 0.04), body, cx, 0, 0, inner);
    well(inner, cx + 0.15, 0.36, 0.42, 1.72);
    const ws = box(0.03, 0.62, 1.5, glassMat, cx + 0.9, 1.5, 0, inner, true);
    ws.rotation.z = 0.06;
    for (const s of [-1, 1]) {
      box(0.74, 0.52, 0.02, glassMat, cx + 0.3, 1.55, s * 0.877, inner, true);
      box(0.014, 1.0, 0.008, trimMat, cx - 0.12, 1.15, s * 0.876, inner, true);
      box(0.15, 0.035, 0.03, chromeMat, cx - 0.02, 1.15, s * 0.885, inner, true);
      box(0.05, 0.05, 0.36, trimMat, cx + 0.72, 1.7, s * 1.02, inner);
      box(0.06, 0.34, 0.16, trimMat, cx + 0.72, 1.55, s * 1.2, inner);
      box(0.03, 0.14, 0.27, headMat(), cx + 0.935, 0.78, s * 0.68, inner, true);
    }
    box(0.04, 0.24, 1.15, trimMat, cx + 0.94, 0.86, 0, inner, true);
    box(0.17, 0.2, 1.74, std(0x8e9196, { metalness: 0.4, roughness: 0.5 }), cx + 0.94, 0.45, 0, inner);
    const pm = new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5 });
    const pf = mesh(new THREE.PlaneGeometry(0.52, 0.11), pm, cx + 1.035, 0.46, 0, inner, true);
    pf.rotation.y = Math.PI / 2;
    const alu = std(0xc6cad0, { metalness: 0.62, roughness: 0.32 });
    const aluD = std(0x9ea3aa, { metalness: 0.6, roughness: 0.4 });
    box(4.6, 0.16, 0.8, trimMat, -0.6, 0.62, 0, inner);
    box(3.4, 0.12, 1.78, alu, -1.05, 0.98, 0, inner);
    for (const s of [-1, 1]) {
      box(3.4, 0.42, 0.035, alu, -1.05, 1.25, s * 0.875, inner);
      for (let x = -2.65; x < 0.6; x += 0.42) box(0.035, 0.42, 0.05, aluD, x, 1.25, s * 0.88, inner, true);
      box(3.4, 0.03, 0.05, aluD, -1.05, 1.46, s * 0.88, inner, true);
      box(0.95, 0.05, 0.42, trimMat, -1.6, 0.92, s * 0.72, inner);
    }
    box(0.035, 0.42, 1.78, alu, -2.75, 1.25, 0, inner);
    box(0.05, 0.95, 1.78, aluD, 0.64, 1.52, 0, inner);
    for (const y of [1.3, 1.6, 1.9]) box(0.06, 0.04, 1.8, alu, 0.66, y, 0, inner, true);
    const tails = [tailMat(), tailMat()];
    [-1, 1].forEach((s, i) => box(0.05, 0.12, 0.3, tails[i], -2.79, 0.72, s * 0.7, inner, true));
    const pr = mesh(new THREE.PlaneGeometry(0.52, 0.11), pm, -2.8, 0.55, 0, inner, true);
    pr.rotation.y = -Math.PI / 2;
    // 짐
    const card = std(0xb08a5a, { roughness: 0.95 });
    box(0.7, 0.5, 0.6, card, -2.0, 1.29, 0.4, inner);
    box(0.6, 0.4, 0.55, card, -1.25, 1.24, -0.35, inner);
    box(0.5, 0.35, 0.5, card, -2.05, 1.72, 0.38, inner);
    for (const s of [-1, 1]) wheel(g, cx + 0.15, s * 0.74, 0.33, 0.2);
    for (const s of [-1, 1]) wheel(g, -1.6, s * 0.64, 0.33, 0.42);
    contact(g, 5.3, 1.8);
    scene.add(g);
    return { g, inner, len: 5.3, setBrake(on) { for (const m of tails) m.emissiveIntensity = on ? 2.4 : 0.25; }, setHazard() {} };
  }

  // 시내버스 (저상, 오른쪽 문 둘)
  function buildBus() {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const L = 11;
    const W = 2.5;
    const white = std(0xf1f1ec, { roughness: 0.32, metalness: 0.2 });
    const blue = std(0x2463b0, { roughness: 0.32, metalness: 0.25 });
    const sp = { gb: 0.3, xr: -2.45, xf: 2.75, A: 0.6, ay: 0.5, rb: -5.35, nose: [[5.45, 0.3], [5.5, 0.6], [5.52, 2.9], ['q', 5.5, 3.15, 5.2, 3.16], [-5.2, 3.16], ['q', -5.5, 3.15, -5.5, 2.9], [-5.5, 0.42], ['q', -5.49, 0.3, -5.35, 0.3]] };
    mesh(extrude(shapeOf(lowerPts(sp)), W, 0.06), white, 0, 0, 0, inner);
    for (const x of [sp.xr, sp.xf]) well(inner, x, sp.ay, sp.A, W);
    // 색 띠
    box(L - 0.2, 0.2, W + 0.014, blue, 0, 1.2, 0, inner, true);
    box(L - 0.4, 0.26, W + 0.014, blue, 0, 2.86, 0, inner, true);
    // 옆 창(검은 바탕 위 유리 → 기둥이 검게 보임)
    const doorsX = [[4.3, 5.2], [0.2, 1.3]];
    for (const s of [-1, 1]) {
      box(10.3, 1.25, 0.02, trimMat, -0.1, 1.96, s * (W / 2 + 0.006), inner, true);
      for (let x = -5.0; x < 4.9; x += 1.38) {
        if (s > 0 && doorsX.some(([a, b]) => x + 1.2 > a - 0.05 && x < b + 0.05)) continue;
        box(1.24, 1.12, 0.02, glassMat, x + 0.62, 1.96, s * (W / 2 + 0.014), inner, true);
      }
    }
    // 문 (오른쪽 = +z)
    const doors = [];
    for (const [a, b] of doorsX) {
      box(b - a + 0.08, 2.25, 0.02, trimMat, (a + b) / 2, 1.45, W / 2 + 0.008, inner, true);
      const half = (b - a) / 2;
      for (const s of [-1, 1]) {
        const m = box(half - 0.04, 2.1, 0.03, glassMat, (a + b) / 2 + s * half / 2, 1.45, W / 2 + 0.03, inner, true);
        const fr = box(half - 0.02, 2.14, 0.02, trimMat, 0, 0, -0.006, m, true);
        fr.scale.set(1, 1, 1);
        fr.position.set(0, 0, -0.01);
        doors.push({ m, base: m.position.x, dir: s, half });
      }
    }
    // 앞유리 · 행선지 표시 · 거울
    box(0.04, 1.72, 2.3, glassMat, 5.53, 1.85, 0, inner, true);
    const dest = ctex(512, 96, (c, w, h) => {
      c.fillStyle = '#0d0d0d';
      c.fillRect(0, 0, w, h);
      textCanvas(c, '720', 64, '#ffb000', 800, 82, h / 2 + 2);
      textCanvas(c, '시청앞 · 새싹초교', 44, '#ffb000', 800, 310, h / 2 + 2);
    });
    const dm = std(0xffffff, { map: dest, emissiveMap: dest, emissive: 0xffffff, emissiveIntensity: 0.9 });
    mesh(new THREE.BoxGeometry(0.05, 0.34, 1.9), [dm, trimMat, trimMat, trimMat, trimMat, trimMat], 5.535, 2.86, 0, inner);
    const side = ctex(256, 96, (c, w, h) => {
      c.fillStyle = '#0d0d0d';
      c.fillRect(0, 0, w, h);
      textCanvas(c, '720', 70, '#ffb000', 800, w / 2, h / 2 + 2);
    });
    const sm = std(0xffffff, { map: side, emissiveMap: side, emissive: 0xffffff, emissiveIntensity: 0.9 });
    mesh(new THREE.BoxGeometry(0.9, 0.34, 0.03), [trimMat, trimMat, trimMat, trimMat, sm, trimMat], 3.5, 2.86, W / 2 + 0.03, inner);
    const num = ctex(256, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      textCanvas(c, '720', 96, '#2463b0', 800, w / 2, h / 2 + 4);
    });
    for (const s of [-1, 1]) {
      const n = mesh(new THREE.PlaneGeometry(1.3, 0.65), std(0xffffff, { map: num, transparent: true }), -3.4, 0.82, s * (W / 2 + 0.035), inner, true);
      if (s < 0) n.rotation.y = Math.PI;
      box(0.6, 0.05, 0.05, trimMat, 5.75, 2.75, s * 1.15, inner);
      box(0.08, 0.5, 0.26, trimMat, 6.02, 2.42, s * 1.32, inner);
      box(0.03, 0.12, 0.38, headMat(), 5.53, 0.78, s * 0.92, inner, true);
    }
    box(0.14, 0.32, 2.45, trimMat, 5.5, 0.5, 0, inner);
    box(0.14, 0.32, 2.45, trimMat, -5.5, 0.5, 0, inner);
    box(2.6, 0.3, 1.6, std(0xdcdcd6), 0.6, 3.31, 0, inner);
    box(0.9, 0.1, 0.9, std(0xcfcfc8), -3.2, 3.2, 0, inner);
    box(0.04, 0.9, 1.6, std(0x3a3c40), -5.53, 1.9, 0, inner, true); // 뒤 창
    const tails = [tailMat(), tailMat()];
    [-1, 1].forEach((s, i) => box(0.05, 0.4, 0.22, tails[i], -5.53, 0.95, s * 1.0, inner, true));
    const pm = new THREE.MeshStandardMaterial({ map: plateTex('70사 1234'), roughness: 0.5 });
    const pf = mesh(new THREE.PlaneGeometry(0.6, 0.13), pm, 5.58, 0.55, 0, inner, true);
    pf.rotation.y = Math.PI / 2;
    for (const s of [-1, 1]) wheel(g, sp.xf, s * (W / 2 - 0.2), 0.5, 0.3);
    for (const s of [-1, 1]) wheel(g, sp.xr, s * (W / 2 - 0.28), 0.5, 0.5);
    contact(g, L, W);
    scene.add(g);
    return {
      g, inner, doors,
      setDoor(v) { for (const d of doors) d.m.position.x = d.base + d.dir * d.half * 0.92 * v; },
      setBrake(on) { for (const m of tails) m.emissiveIntensity = on ? 2.4 : 0.25; },
    };
  }

  // 소방 펌프차
  function buildFireTruck() {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const red = std(0xc2161c, { roughness: 0.28, metalness: 0.3 });
    const W = 2.4;
    mesh(extrude(shapeOf([[1.5, 0.55], [2.0, 0.55], [2.0, 0.52], ['a', 2.6, 0.52, 0.62, Math.PI, 0, true], [3.22, 0.55], [3.76, 0.55], ['q', 3.82, 0.9, 3.8, 1.25], [3.77, 2.55], ['q', 3.72, 2.92, 3.4, 2.94], [1.5, 2.94]]), W, 0.05), red, 0, 0, 0, inner);
    well(inner, 2.6, 0.52, 0.62, W);
    const ws = box(0.035, 0.95, 2.15, glassMat, 3.78, 2.08, 0, inner, true);
    ws.rotation.z = 0.04;
    const doorTex = ctex(256, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      textCanvas(c, '119', 84, '#ffffff', 800, w / 2, h / 2 + 4);
    });
    for (const s of [-1, 1]) {
      box(0.85, 0.62, 0.02, glassMat, 3.12, 2.17, s * (W / 2 + 0.012), inner, true);
      box(0.8, 0.55, 0.02, glassMat, 2.05, 2.17, s * (W / 2 + 0.012), inner, true);
      for (const x of [3.62, 2.6, 1.55]) box(0.014, 1.8, 0.008, trimMat, x, 1.75, s * (W / 2 + 0.008), inner, true);
      box(0.16, 0.035, 0.03, chromeMat, 2.75, 1.7, s * (W / 2 + 0.02), inner, true);
      const d = mesh(new THREE.PlaneGeometry(0.7, 0.35), std(0xffffff, { map: doorTex, transparent: true }), 3.1, 1.45, s * (W / 2 + 0.014), inner, true);
      if (s < 0) d.rotation.y = Math.PI;
      box(0.05, 0.05, 0.45, trimMat, 3.6, 2.5, s * (W / 2 + 0.2), inner);
      box(0.08, 0.5, 0.24, trimMat, 3.7, 2.25, s * (W / 2 + 0.42), inner);
      box(0.03, 0.18, 0.36, headMat(), 3.81, 0.88, s * 0.92, inner, true);
    }
    box(0.04, 0.55, 1.4, chromeMat, 3.82, 1.1, 0, inner, true);
    box(0.22, 0.26, 2.44, chromeMat, 3.88, 0.5, 0, inner);
    // 경광등
    box(0.42, 0.12, 1.95, trimMat, 2.7, 3.0, 0, inner);
    const redSeg = std(0xff2a1a, { emissive: 0xff1a0a, emissiveIntensity: 0 });
    const blueSeg = std(0x2a5cff, { emissive: 0x1a4aff, emissiveIntensity: 0 });
    for (let i = 0; i < 6; i++) box(0.36, 0.12, 0.28, i % 2 ? blueSeg : redSeg, 2.7, 3.11, -0.75 + i * 0.3, inner, true);
    // 몸체 + 셔터
    box(5.25, 1.95, W + 0.02, red, -1.1, 1.975, 0, inner);
    box(2.4, 0.45, W - 0.1, red, 0.3, 0.78, 0, inner);
    box(1.1, 0.45, W - 0.1, red, -3.15, 0.78, 0, inner);
    box(1.5, 0.06, W + 0.04, trimMat, -1.9, 1.04, 0, inner);
    const shutter = ctex(256, 256, (c, w, h) => {
      c.fillStyle = '#c9cdd2';
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 10) {
        c.fillStyle = '#9fa4ab';
        c.fillRect(0, y, w, 2);
        c.fillStyle = '#e2e5e8';
        c.fillRect(0, y + 2, w, 1);
      }
      c.fillStyle = '#7d828a';
      c.fillRect(w * 0.4, h - 22, w * 0.2, 12);
    });
    const shM = std(0xffffff, { map: shutter, metalness: 0.5, roughness: 0.35 });
    for (const s of [-1, 1]) for (const x of [-3.05, -1.35, 0.4]) {
      const m = mesh(new THREE.PlaneGeometry(1.5, 1.35), shM, x, 2.1, s * (W / 2 + 0.016), inner, true);
      if (s < 0) m.rotation.y = Math.PI;
    }
    const stripe = ctex(1024, 64, (c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd21f';
      c.fillRect(0, h - 10, w, 10);
      textCanvas(c, '소방   119   FIRE RESCUE', 40, '#c2161c', 800, w / 2, h / 2 - 2);
    });
    const stM = std(0xffffff, { map: stripe, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const m = mesh(new THREE.PlaneGeometry(5.2, 0.32), stM, -1.1, 1.18, s * (W / 2 + 0.02), inner, true);
      if (s < 0) m.rotation.y = Math.PI;
    }
    // 지붕 사다리 · 호스릴
    const alu = std(0xc6cad0, { metalness: 0.65, roughness: 0.3 });
    for (const s of [-1, 1]) box(4.6, 0.08, 0.08, alu, -1.0, 3.12, s * 0.45, inner);
    for (let x = -3.2; x < 1.2; x += 0.36) box(0.05, 0.05, 0.9, alu, x, 3.12, 0, inner, true);
    const reel = cyl(0.35, 0.35, 0.5, std(0xd9d9d4), -3.0, 3.35, -0.6, inner, 20);
    reel.rotation.x = Math.PI / 2;
    box(0.4, 0.12, 2.3, std(0x8d9197, { metalness: 0.5 }), -3.85, 0.62, 0, inner); // 뒤 발판
    const tails = [tailMat(), tailMat()];
    [-1, 1].forEach((s, i) => box(0.05, 0.3, 0.2, tails[i], -3.74, 1.2, s * 1.05, inner, true));
    for (const s of [-1, 1]) wheel(g, 2.6, s * (W / 2 - 0.2), 0.5, 0.3);
    for (const s of [-1, 1]) wheel(g, -1.9, s * (W / 2 - 0.28), 0.5, 0.5);
    contact(g, 7.7, W);
    scene.add(g);
    return {
      g, inner,
      lights(t, on) {
        const ph = Math.floor(t * 8) % 2;
        redSeg.emissiveIntensity = on && ph ? 3 : 0.1;
        blueSeg.emissiveIntensity = on && !ph ? 3 : 0.1;
      },
    };
  }

  const car = buildCar('sedan', 0xeceef2, { plate: '57다 2814' });
  // 건너편 차로를 오가는 차들(여러 차종)
  const traffic = [
    buildCar('sedan', 0x2d4f7c),
    buildCar('suv', 0x3b3f45),
    buildCar('compact', 0xa8262a),
    buildTruck(0xe9ecef),
    buildCar('sedan', 0xe9853b, { taxi: true }),
    buildCar('suv', 0xd8d4c8),
    buildCar('sedan', 0x8b9096),
  ].map((v, i) => {
    v.g.position.set(-90 + i * 28, 0, i % 2 ? -4.4 : -1.5);
    v.g.rotation.y = Math.PI;
    v.speed = 6.5 + (i % 3) * 1.4;
    return v;
  });

  PHASE = 'ppl';
  // ── 사람 (팔다리가 움직이는 인형) ──
  function personRig(o) {
    const g = new THREE.Group();
    const s = (o.h || 1.7) / 1.7;
    const skin = std(o.skin || 0xc98d66, { roughness: 0.7 });
    const shirt = std(o.shirt);
    const pants = std(o.pants);
    const shoes = std(o.shoes || 0x222222);
    const legs = [];
    const arms = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.095 * s, 0.86 * s, 0);
      g.add(hip);
      cyl(0.078 * s, 0.06 * s, 0.8 * s, pants, 0, -0.4 * s, 0, hip, 10);
      box(0.11 * s, 0.07 * s, 0.25 * s, shoes, 0, -0.83 * s, 0.045 * s, hip);
      legs.push(hip);
      const sh = new THREE.Group();
      sh.position.set(side * 0.235 * s, 1.41 * s, 0);
      g.add(sh);
      cyl(0.057 * s, 0.046 * s, 0.58 * s, o.short ? skin : shirt, 0, -0.29 * s, 0, sh, 10);
      mesh(new THREE.SphereGeometry(0.05 * s, 10, 8), skin, 0, -0.6 * s, 0, sh);
      arms.push(sh);
    }
    const torso = cyl(0.2 * s, 0.165 * s, 0.6 * s, shirt, 0, 1.15 * s, 0, g, 14);
    torso.scale.z = 0.72;
    const shoulder = mesh(new THREE.SphereGeometry(0.205 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), shirt, 0, 1.44 * s, 0, g);
    shoulder.scale.set(1, 0.38, 0.72);
    cyl(0.05 * s, 0.055 * s, 0.09 * s, skin, 0, 1.51 * s, 0, g, 8);
    const head = mesh(new THREE.SphereGeometry(0.115 * s, 16, 12), skin, 0, 1.65 * s, 0, g);
    head.scale.set(0.92, 1.05, 1);
    if (o.helmet) {
      mesh(new THREE.SphereGeometry(0.135 * s, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(o.helmet, { roughness: 0.35 }), 0, 1.68 * s, 0, g);
      cyl(0.17 * s, 0.17 * s, 0.015 * s, std(o.helmet, { roughness: 0.35 }), 0, 1.68 * s, -0.02 * s, g, 16);
    } else if (o.cap) {
      mesh(new THREE.SphereGeometry(0.124 * s, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(o.cap), 0, 1.68 * s, 0, g);
      box(0.15 * s, 0.012 * s, 0.11 * s, std(o.cap), 0, 1.69 * s, 0.11 * s, g);
    } else {
      // 머리카락: 정수리 + 옆·뒤 (얼굴 쪽 +z 는 비움)
      const hm = std(o.hair || 0x241c17, { roughness: 0.9 });
      mesh(new THREE.SphereGeometry(0.122 * s, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), hm, 0, 1.655 * s, -0.004 * s, g);
      const back = mesh(new THREE.SphereGeometry(0.123 * s, 16, 10, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.62), hm, 0, 1.655 * s, -0.008 * s, g);
      back.scale.set(0.96, 1, 1);
      if (o.longHair) box(0.2 * s, 0.22 * s, 0.06 * s, std(o.hair || 0x241c17), 0, 1.55 * s, -0.09 * s, g);
    }
    if (o.backpack) box(0.26 * s, 0.32 * s, 0.13 * s, std(o.backpack), 0, 1.17 * s, -0.17 * s, g);
    if (o.bands) for (const y of [0.98, 1.3]) {
      const b = cyl(0.207 * s, 0.2 * s, 0.045 * s, std(0xd7e84a, { emissive: 0x3a4210, roughness: 0.4 }), 0, y * s, 0, g, 14);
      b.scale.z = 0.74;
    }
    if (o.cane) cyl(0.012, 0.012, 0.85 * s, std(0x6b4a2e), 0.02, -0.6 * s, 0.1 * s, arms[1], 6);
    scene.add(g);
    return {
      g, legs, arms,
      walk(ph, amp) {
        const a = Math.sin(ph) * (amp == null ? 0.5 : amp);
        legs[0].rotation.x = a;
        legs[1].rotation.x = -a;
        arms[0].rotation.x = -a * 0.8;
        arms[1].rotation.x = a * 0.8;
      },
      still() {
        for (const l of legs) l.rotation.x = 0;
        for (const a of arms) a.rotation.x = 0;
      },
    };
  }
  // 인도 장면: 차가 인도를 막아 유모차가 차도로
  const mom = personRig({ shirt: 0x8a5a8c, pants: 0x2f3540, h: 1.62, longHair: true, hair: 0x3a2a20 });
  mom.g.position.set(65.6, 0, 4.9);
  mom.g.rotation.y = Math.PI / 2;
  const stroller = new THREE.Group();
  {
    const fr = std(0x2f3136, { metalness: 0.5, roughness: 0.4 });
    box(0.5, 0.32, 0.8, std(0x3b5a7a), 0, 0.62, 0, stroller);
    const hood = mesh(new THREE.SphereGeometry(0.33, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x3b5a7a), 0, 0.76, -0.2, stroller);
    hood.rotation.x = 0.5;
    for (const [x, z] of [[0.22, 0.3], [-0.22, 0.3], [0.22, -0.3], [-0.22, -0.3]]) cyl(0.11, 0.11, 0.04, tireMat, x, 0.11, z, stroller, 16).rotation.z = Math.PI / 2;
    box(0.03, 0.03, 0.75, fr, 0.22, 0.4, 0, stroller);
    box(0.03, 0.03, 0.75, fr, -0.22, 0.4, 0, stroller);
    box(0.5, 0.03, 0.03, fr, 0, 1.0, -0.55, stroller);
    box(0.03, 0.6, 0.03, fr, 0.22, 0.72, -0.48, stroller).rotation.x = -0.35;
    box(0.03, 0.6, 0.03, fr, -0.22, 0.72, -0.48, stroller).rotation.x = -0.35;
  }
  stroller.rotation.y = Math.PI / 2;
  stroller.position.set(66.8, 0, 4.9);
  scene.add(stroller);
  // 학교 앞 아이들
  const kids = [
    [45.6, -8.3, 0xf2b705, 0xe0675a],
    [46.4, -8.8, 0x4e8fd1, 0x2f7d4f],
    [52.2, -8.4, 0xe0675a, 0x4e8fd1],
  ].map(([x, z, c, bp]) => {
    const k = personRig({ shirt: c, pants: 0x2f3540, h: 1.18, cap: 0xffd20a, backpack: bp, shoes: 0xf2f2f2 });
    k.g.position.set(x, 0.18, z);
    return k;
  });
  // 건너편 인도를 오가는 사람들
  const strollers = [
    { o: { shirt: 0x6b8a5a, pants: 0x3a3a3a, h: 1.72 }, x: -60, dir: 1, v: 1.3 },
    { o: { shirt: 0x3d5f8a, pants: 0x2a2a2a, h: 1.62, longHair: true }, x: 20, dir: -1, v: 1.2 },
    { o: { shirt: 0xd9cfbf, pants: 0x4a4a52, h: 1.58, hair: 0x9a9a9a }, x: -25, dir: 1, v: 0.9 },
    { o: { shirt: 0xb84a3a, pants: 0x2f3540, h: 1.76, short: true }, x: 72, dir: -1, v: 1.4 },
    { o: { shirt: 0x2f2f33, pants: 0x2a2a2a, h: 1.7 }, x: 5, dir: 1, v: 1.25 },
  ].map((p) => {
    const r = personRig(p.o);
    r.g.position.set(p.x, 0.18, p.dir > 0 ? -8.1 : -8.7);
    r.g.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    return Object.assign(r, { x: p.x, dir: p.dir, v: p.v });
  });

  PHASE = 'none';
  // ── 금지 범위 표시: 연석을 따라 재는 노란 화살표 · 말풍선 ──
  function measure(x0, z0, x1, z1, label) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const P = 80;
    const W = Math.round(len * P);
    const H = 72;
    const tex = ctex(W, H, (c) => {
      c.clearRect(0, 0, W, H);
      c.fillStyle = '#ffd21f';
      c.fillRect(14, H / 2 - 3, W - 28, 6);
      for (const [ax, dir] of [[4, 1], [W - 4, -1]]) {
        c.beginPath();
        c.moveTo(ax, H / 2);
        c.lineTo(ax + dir * 22, H / 2 - 12);
        c.lineTo(ax + dir * 22, H / 2 + 12);
        c.closePath();
        c.fill();
      }
      c.font = `800 40px ${FONT}`;
      const tw = c.measureText(label).width + 22;
      c.fillStyle = '#1b1916';
      c.fillRect(W / 2 - tw / 2, 6, tw, H - 12);
      textCanvas(c, label, 40, '#ffd21f', 800, W / 2, H / 2 + 2);
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H / P), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
    m.position.set((x0 + x1) / 2, 0.22, (z0 + z1) / 2);
    scene.add(m);
    return mat;
  }
  function tag(label, x, y, z) {
    const m0 = document.createElement('canvas').getContext('2d');
    m0.font = `800 46px ${FONT}`;
    const w = Math.ceil(m0.measureText(label).width) + 60;
    const h = 112;
    const mat = new THREE.SpriteMaterial({
      map: ctex(w, h, (c) => {
        c.fillStyle = '#1b1916';
        c.fillRect(0, 0, w, h - 18);
        c.fillStyle = '#ffb08a';
        c.fillRect(0, 0, 8, h - 18);
        c.fillStyle = '#1b1916';
        c.beginPath();
        c.moveTo(w / 2 - 14, h - 18);
        c.lineTo(w / 2, h);
        c.lineTo(w / 2 + 14, h - 18);
        c.fill();
        textCanvas(c, label, 46, '#ffffff', 800, w / 2 + 4, (h - 18) / 2 + 3);
      }),
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(w / 116, 0.96, 1);
    sp.position.set(x, y, z);
    scene.add(sp);
    return mat;
  }
  // 정지선 위에 덧칠하는 빨간 강조
  const stopGlow = new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true, opacity: 0, depthWrite: false });
  {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 5.8), stopGlow);
    m.position.set(-54.2, 0.05, 2.9);
    scene.add(m);
  }

  // ── 장면 정의: 문제의 차 자리 · 카메라 ──
  const S = [
    { car: [-6, 0, -1.6, Math.PI], cam: [-30, 48, 66], look: [10, 0, 0] },
    { car: [-30, 0, 4.4, 0], cam: [-19, 11, 21], look: [-30, 0.6, 4.8], mark: [measure(-35, 5.45, -30, 5.45, '5m'), measure(-30, 5.45, -25, 5.45, '5m'), tag('과태료 2배', -30, 3.6, 6.6)] },
    { car: [-8.6, 0, 4.4, 0], cam: [-16, 13, 22], look: [-6, 0, 5], mark: [measure(-10.2, 5.45, -5.2, 5.45, '5m'), measure(-4.45, 6.1, -4.45, 11.1, '5m')] },
    { car: [20, 0, 4.4, 0], cam: [31, 13, 25], look: [20, 0.8, 6], mark: [measure(13.8, 5.45, 23.8, 5.45, '10m'), measure(23.8, 5.45, 33.8, 5.45, '10m')] },
    { car: [-51.6, 0, 4.4, 0], cam: [-41, 12, 19], look: [-51, 0, 2.2], mark: [stopGlow, tag('정지선 넘으면 위반', -54.2, 3.4, 3.2)] },
    { car: [43.6, 0, 4.4, 0], cam: [59, 15, 24], look: [48, 1.5, -2] },
    { car: [70, 0.18, 8.4, 0.0], cam: [79, 11, 23], look: [68, 0.6, 6.5] },
    { car: [-6, 0, -1.6, Math.PI], cam: [10, 72, 74], look: [10, 0, 0] },
  ];

  // ── 장면별 사건: 그 자리에 차가 서 있으면 무슨 일이 생기는지 ──
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3);
  const smooth = (v) => {
    const x = clamp01(v);
    return x * x * (3 - 2 * x);
  };
  const toward = (m, target, k) => {
    m.opacity += (target - m.opacity) * k;
  };
  const EV = {};
  // 01 소화전: 소방차가 와도 소화전 앞에 붙지 못한다
  {
    const ft = buildFireTruck();
    const ff = personRig({ shirt: 0x2b3442, pants: 0x2b3442, h: 1.76, helmet: 0xf3d21b, bands: true, shoes: 0x111111 });
    const tg = tag('소방차가 소화전에 붙지 못해요', -38.8, 5.2, 4.0);
    EV[1] = {
      show(v) {
        ft.g.visible = v;
        ff.g.visible = false;
        if (!v) tg.opacity = 0;
      },
      update(t, k, real) {
        const tt = t % 13;
        const x = -88 + (-38.8 + 88) * easeOut(tt / 4.6);
        ft.g.position.set(x, 0, 4.05);
        ft.lights(real, true);
        ft.inner.rotation.z = tt > 3.6 && tt < 4.8 ? -0.012 * Math.sin(((tt - 3.6) / 1.2) * Math.PI) : 0;
        ff.g.visible = tt > 5.2;
        if (tt > 5.2) {
          const w = smooth((tt - 5.2) / 2.2);
          ff.g.position.set(-35.6 + 2.5 * w, 0, 5.45 + 0.25 * w);
          ff.g.rotation.y = Math.PI / 2;
          if (w < 1) ff.walk(real * 7);
          else {
            ff.still();
            ff.arms[1].rotation.x = -2.5 + Math.sin(real * 6) * 0.25; // 손짓
            ff.arms[0].rotation.x = -0.4;
          }
        }
        toward(tg, tt > 6.4 && tt < 12.6 ? 1 : 0, k);
      },
    };
  }
  // 02 교차로 모퉁이: 우회전 차가 가려져 있던 보행자를 늦게 본다
  {
    const v = buildCar('compact', 0x9aa0a8);
    const ped = personRig({ shirt: 0x4a6fa5, pants: 0x2b2b30, h: 1.66, longHair: true, hair: 0x2a1d17 });
    const tg = tag('모퉁이 차에 가려진 보행자', -1.5, 4.2, 7.9);
    const L1 = 38.5;
    const ARC = (Math.PI / 2) * 4;
    const S_STOP = L1 + ARC * 0.72;
    const at = (s) => {
      if (s <= L1) return { x: -45 + s, z: 1.5, h: 0 };
      const ph = -Math.PI / 2 + ((s - L1) / 4);
      return { x: -6.5 + 4 * Math.cos(ph), z: 5.5 + 4 * Math.sin(ph), h: -Math.atan2(Math.cos(ph), -Math.sin(ph)) };
    };
    EV[2] = {
      show(on) {
        v.g.visible = on;
        ped.g.visible = on;
        if (!on) tg.opacity = 0;
      },
      update(t, k, real) {
        const tt = t % 11;
        const s = S_STOP * easeOut(tt / 4.3);
        const p = at(s);
        v.g.position.set(p.x, 0, p.z);
        v.g.rotation.y = p.h;
        const braking = tt > 3.1;
        v.setBrake(braking);
        v.inner.rotation.z = tt > 3.1 && tt < 4.5 ? -0.02 * Math.sin(((tt - 3.1) / 1.4) * Math.PI) : 0;
        // 보행자: 모퉁이에서 옆길을 건너기 시작 → 차를 보고 멈춤
        const walkT = clamp01((tt - 1.6) / 2.4);
        const px = -6.8 + 4.6 * walkT;
        ped.g.position.set(px, Math.abs(px) > 5.1 ? 0.18 : 0, 7.9);
        if (tt < 1.6) {
          ped.g.rotation.y = Math.PI / 2;
          ped.still();
        } else if (walkT < 1) {
          ped.g.rotation.y = Math.PI / 2;
          ped.walk(real * 7);
        } else {
          ped.g.rotation.y += (Math.PI - ped.g.rotation.y) * 0.1; // 차 쪽으로 돌아봄
          ped.still();
          ped.arms[0].rotation.x = -0.9;
          ped.arms[1].rotation.x = -0.9;
        }
        toward(tg, tt > 4.1 && tt < 10.6 ? 1 : 0, k);
      },
    };
  }
  // 03 버스정류소: 버스가 정류소에 붙지 못하고 승객이 차도에 내린다
  {
    const bus = buildBus();
    const old = personRig({ shirt: 0xb9a68a, pants: 0x4a4a52, h: 1.56, hair: 0xb8b8b8, cane: true, shoes: 0x3a2a20 });
    const tg = tag('승객이 차도에서 내려요', 23.3, 4.6, 3.4);
    EV[3] = {
      show(on) {
        bus.g.visible = on;
        old.g.visible = false;
        if (!on) tg.opacity = 0;
      },
      update(t, k, real) {
        const tt = t % 14;
        bus.g.position.set(-75 + (18.5 + 75) * easeOut(tt / 5.4), 0, 1.55);
        bus.setBrake(tt > 3.8 && tt < 12);
        bus.setDoor(smooth((tt - 5.8) / 0.8) * (1 - smooth((tt - 12.2) / 0.8)));
        old.g.visible = tt > 6.6 && tt < 13.2;
        if (old.g.visible) {
          const w = clamp01((tt - 6.6) / 4.6);
          const z = 2.55 + (6.6 - 2.55) * w;
          const y = z < 3.0 ? 0.32 * (1 - (z - 2.55) / 0.45) : z > 6.0 ? 0.18 : 0;
          old.g.position.set(23.25, y, z);
          old.g.rotation.y = 0;
          if (w < 1) old.walk(real * 5, 0.32);
          else old.still();
        }
        toward(tg, tt > 7.2 && tt < 13 ? 1 : 0, k);
      },
    };
  }
  // 04 횡단보도: 정지선을 넘은 차를 보행자가 돌아서 건넌다
  {
    const peds = [
      personRig({ shirt: 0xcf7b3a, pants: 0x34404f, h: 1.7 }),
      personRig({ shirt: 0x5b7a52, pants: 0x2b2b30, h: 1.6, longHair: true, hair: 0x3a2a20 }),
      personRig({ shirt: 0xe0675a, pants: 0x2f3540, h: 1.15, cap: 0xffd20a, backpack: 0x2f7d4f, shoes: 0xf2f2f2 }),
    ];
    const offs = [0, 5.5, 6.3];
    EV[4] = {
      show(on) {
        for (const p of peds) p.g.visible = on;
      },
      update(t, k, real) {
        peds.forEach((p, i) => {
          const tt = (t + offs[i]) % 12;
          const z = 7.4 - 14.8 * (tt / 12);
          // 차(앞 차로 z 3.5~5.3)를 피해서 비켜 걷는다
          const d = smooth(1 - Math.abs(z - 4.4) / 2.6);
          const x = -50.9 + (i === 2 ? 0.5 : 0) + 2.3 * d;
          p.g.position.set(x, Math.abs(z) > 6.05 ? 0.18 : 0, z);
          p.g.rotation.y = Math.PI + (d > 0.05 && d < 0.95 ? (z > 4.4 ? -0.6 : 0.6) : 0);
          p.walk(real * 7 + i, 0.45);
        });
      },
    };
  }
  // 05 어린이보호구역: 차 사이에서 나온 아이, 달려오던 차가 급정거
  {
    const kid = personRig({ shirt: 0x4e8fd1, pants: 0x2f3540, h: 1.18, cap: 0xffd20a, backpack: 0xe0675a, shoes: 0xf2f2f2 });
    const v = buildCar('suv', 0x2c2f35);
    const tg = tag('차 사이에서 갑자기 나온 아이', 47, 3.6, 2.6);
    EV[5] = {
      show(on) {
        kid.g.visible = on;
        v.g.visible = on;
        if (!on) tg.opacity = 0;
      },
      update(t, k, real) {
        const tt = t % 10;
        // 아이: 울타리 틈으로 나와 차 앞을 지나 길로
        const w = clamp01((tt - 2.0) / 1.5);
        const z = 7.6 - 5.0 * w;
        kid.g.position.set(47.05, z > 6.05 ? 0.18 : 0, z);
        kid.g.rotation.y = Math.PI;
        if (w > 0 && w < 1) kid.walk(real * 11, 0.75);
        else if (w >= 1) {
          kid.still();
          kid.arms[0].rotation.x = -1.2;
          kid.arms[1].rotation.x = -1.2;
        } else kid.still();
        // 달려오던 차: 3.4초에 급제동
        let x;
        if (tt < 3.4) x = 5 + 9 * tt;
        else {
          const d = Math.min(tt - 3.4, 0.75);
          x = 35.6 + 9 * d - 6 * d * d;
        }
        v.g.position.set(x, 0, 1.5);
        v.g.rotation.y = 0;
        v.setBrake(tt > 3.4);
        v.inner.rotation.z = tt > 3.4 && tt < 4.6 ? -0.03 * Math.sin(((tt - 3.4) / 1.2) * Math.PI) : 0;
        toward(tg, tt > 3.6 && tt < 9.6 ? 1 : 0, k);
      },
    };
  }
  // 06 인도: 휠체어가 차 앞에서 더 갈 수 없다
  {
    const wc = new THREE.Group();
    const frame = std(0x3a3d42, { metalness: 0.6, roughness: 0.35 });
    box(0.46, 0.05, 0.44, std(0x23252a), 0, 0.52, 0, wc);
    box(0.46, 0.46, 0.04, std(0x23252a), 0, 0.8, -0.22, wc);
    const wheels = [];
    for (const s of [-1, 1]) {
      const r = mesh(new THREE.TorusGeometry(0.3, 0.022, 8, 30), frame, s * 0.27, 0.32, -0.05, wc);
      r.rotation.y = Math.PI / 2;
      const tire = mesh(new THREE.TorusGeometry(0.3, 0.028, 8, 30), tireMat, s * 0.285, 0.32, -0.05, wc);
      tire.rotation.y = Math.PI / 2;
      const spokes = new THREE.Group();
      spokes.position.set(s * 0.27, 0.32, -0.05);
      for (let i = 0; i < 6; i++) {
        const b = box(0.008, 0.58, 0.012, frame, 0, 0, 0, spokes, true);
        b.rotation.x = (i / 6) * Math.PI;
      }
      wc.add(spokes);
      wheels.push(spokes);
      cyl(0.06, 0.06, 0.03, tireMat, s * 0.2, 0.06, 0.26, wc, 12).rotation.z = Math.PI / 2;
      box(0.02, 0.02, 0.35, frame, s * 0.22, 0.55, 0.06, wc);
    }
    box(0.36, 0.03, 0.12, frame, 0, 0.14, 0.36, wc);
    const rider = personRig({ shirt: 0x6b7f9a, pants: 0x2f3036, h: 1.66, hair: 0x2a2018 });
    scene.remove(rider.g);
    wc.add(rider.g);
    rider.g.position.set(0, 0.56 - 0.86 * (1.66 / 1.7), 0);
    for (const l of rider.legs) l.rotation.x = -1.45;
    rider.arms[0].rotation.x = -0.55;
    rider.arms[1].rotation.x = -0.55;
    scene.add(wc);
    const tg = tag('휠체어가 지나갈 수 없어요', 65.2, 3.4, 8.6);
    EV[6] = {
      show(on) {
        wc.visible = on;
        if (!on) tg.opacity = 0;
      },
      update(t, k, real) {
        const tt = t % 12;
        const x = 58.6 + 6.6 * easeOut(tt / 6.5);
        wc.position.set(x, 0.18, 8.6);
        wc.rotation.y = Math.PI / 2;
        const sp = tt < 6.5 ? (1 - tt / 6.5) * 4 : 0;
        for (const w of wheels) w.rotation.x -= sp * 0.016;
        toward(tg, tt > 6.2 && tt < 11.6 ? 1 : 0, k);
        // 유모차 엄마도 차도로 천천히
        const mx = 63.4 + ((t * 0.55) % 9);
        mom.g.position.set(mx, 0, 4.9);
        stroller.position.set(mx + 1.2, 0, 4.9);
        mom.walk(real * 5, 0.35);
      },
    };
  }
  let evStation = -1;
  let evT = 0;
  const EVT = params.has('ev') ? Number(params.get('ev')) : null; // 점검용: ?ev=초

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  const camPos = new THREE.Vector3(...S[0].cam);
  const camLook = new THREE.Vector3(...S[0].look);
  const tmp = new THREE.Vector3();
  const carTarget = new THREE.Vector3();
  let mouseX = 0;
  let mouseY = 0;
  window.addEventListener('pointermove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 860 ? 52 : 40;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // 휴대폰 화면 속 사진 두 장 — 소화전 앞 차를 실제로 찍은 것처럼
  (function phoneShots() {
    try {
      const pr = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      pr.outputEncoding = THREE.sRGBEncoding;
      pr.toneMapping = THREE.ACESFilmicToneMapping;
      pr.shadowMap.enabled = true;
      pr.setSize(240, 320);
      const pc = new THREE.PerspectiveCamera(50, 240 / 320, 0.1, 200);
      car.g.position.set(-30, 0, 4.4);
      car.g.rotation.y = 0;
      const urls = [];
      for (const dx of [0, 0.25]) {
        pc.position.set(-27.4 + dx, 1.55, 9.2);
        pc.lookAt(-30 + dx * 0.2, 0.7, 4.6);
        pr.render(scene, pc);
        urls.push(pr.domElement.toDataURL('image/jpeg', 0.85));
      }
      document.getElementById('shot1').style.backgroundImage = `url(${urls[0]})`;
      document.getElementById('shot2').style.backgroundImage = `url(${urls[1]})`;
      pr.dispose();
      pr.forceContextLoss();
    } catch (_) {}
    car.g.position.set(...S[0].car.slice(0, 3));
  })();

  function applyTier() {
    const nT = tier === 'high' ? 99 : tier === 'mid' ? 4 : 2;
    const nP = tier === 'high' ? 99 : tier === 'mid' ? 3 : 0;
    traffic.forEach((v, i) => (v.g.visible = i < nT));
    strollers.forEach((p, i) => (p.g.visible = i < nP));
    renderer.setPixelRatio(dprFor(tier));
    const sh = tier !== 'low';
    if (renderer.shadowMap.enabled !== sh) {
      renderer.shadowMap.enabled = sh;
      sun.castShadow = sh;
      scene.traverse((o) => {
        if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true));
      });
    }
    resize();
  }
  applyTier();

  // ── 인트로: 거리가 하나씩 지어지는 연출 (약 4.4초) ──
  const IP = {
    road: { t: 0.0, sw: 0.9, d: 0.55, name: '도로를 깔고' },
    bldg: { t: 0.75, sw: 1.15, d: 0.8, name: '건물을 세우고' },
    prop: { t: 1.75, sw: 1.1, d: 0.55, name: '표지판을 달고' },
    car: { t: 2.6, sw: 0.9, d: 0.6, name: '차가 들어오고' },
    ppl: { t: 3.25, sw: 0.6, d: 0.4, name: '사람들이 오갑니다' },
  };
  const I_END = 4.1;
  const I_CAM = { cam: [34, 64, 92], look: [8, 0, -4] };
  let introOn = INTRO;
  const IT_FIX = params.has('introT') ? Number(params.get('introT')) : null; // 점검용: 그 순간에서 멈춤
  let introT = 0;
  const introItems = [];
  if (introOn) {
    const bb = new THREE.Box3();
    for (const o of scene.children) {
      const ph = o.userData.phase;
      if (!IP[ph] || o.isLight || o.isSprite) continue;
      bb.setFromObject(o);
      if (bb.isEmpty()) continue;
      const nx = Math.max(0, Math.min(1, Math.abs((bb.min.x + bb.max.x) / 2 - 5) / 95)); // 교차로 가운데 → 바깥으로 퍼짐
      introItems.push({ o, p: IP[ph], ph, nx, y0: o.position.y, s0: o.scale.clone(), h: Math.max(0.4, bb.max.y) + 0.3, vis: o.visible });
    }
    window.addEventListener('intro-skip', () => (introT = I_END), { once: true });
  }
  const eOut = (x) => 1 - Math.pow(1 - x, 3);
  const eBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
  const eBounce = (x) => {
    const n = 7.5625;
    const d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  };
  const eInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const camA = new THREE.Vector3();
  const camB = new THREE.Vector3();
  function introStep(dt) {
    introT = IT_FIX != null ? IT_FIX : Math.min(I_END, introT + dt);
    const done = introT >= I_END;
    for (const it of introItems) {
      const { o, p } = it;
      const e = done ? 1 : Math.max(0, Math.min(1, (introT - p.t - it.nx * p.sw) / p.d));
      o.visible = it.vis && e > 0;
      if (it.ph === 'road') {
        const k = Math.max(0.0001, eOut(e));
        o.scale.set(it.s0.x * k, it.s0.y * k, it.s0.z * k);
      } else if (it.ph === 'bldg' || it.ph === 'prop') {
        o.position.y = it.y0 - it.h * (1 - (e >= 1 ? 1 : eBack(e))); // 땅속에서 솟아오름
      } else if (it.ph === 'car') {
        o.position.y = it.y0 + 7 * (1 - eBounce(e)); // 위에서 떨어져 통통
      } else {
        const k = Math.max(0.0001, e >= 1 ? 1 : eBack(e));
        o.scale.set(it.s0.x * k, it.s0.y * k, it.s0.z * k);
      }
    }
    // 카메라: 높은 곳에서 천천히 내려와 첫 화면 구도로
    const c = eInOut(Math.min(1, introT / I_END));
    const st0 = S[0];
    camA.set(...I_CAM.cam).lerp(camB.set(...st0.cam), c);
    camera.position.copy(camA);
    camA.set(...I_CAM.look).lerp(camB.set(...st0.look), c);
    camera.lookAt(camA);
    camPos.copy(camera.position);
    camLook.copy(camA);
    // 인트로 동안은 안개를 걷어 멀리서도 또렷하게
    scene.fog.near = 170 - 95 * c;
    scene.fog.far = 420 - 220 * c;
    let cur = 'road';
    for (const k in IP) if (introT >= IP[k].t) cur = k;
    window.dispatchEvent(new CustomEvent('intro-progress', { detail: { name: IP[cur].name, p: introT / I_END } }));
    if (done) {
      introOn = false;
      scene.fog.near = 75;
      scene.fog.far = 200;
      for (const it of introItems) {
        it.o.visible = it.vis;
        if (it.ph === 'road' || it.ph === 'ppl') it.o.scale.copy(it.s0);
        if (it.ph === 'bldg' || it.ph === 'prop' || it.ph === 'car') it.o.position.y = it.y0;
      }
      window.dispatchEvent(new Event('intro-done'));
    }
  }
  if (introOn) introStep(0); // 첫 화면부터 빈 땅에서 시작

  // 처음 몇 초 동안 실제로 버벅이면 한 단계씩 낮춘다
  let perfT = 0;
  let perfSum = 0;
  let perfN = 0;
  let stopped = false;
  function watchPerf(raw) {
    if (instant || BARE || params.get('q') || introOn) return;
    perfT += raw;
    if (perfT > 1.5 && perfT < 5) {
      perfSum += raw;
      perfN++;
    } else if (perfT >= 5 && perfN) {
      const avg = perfSum / perfN;
      perfN = 0;
      perfSum = 0;
      if (avg > 0.045) {
        tier = Q_ORDER[Math.min(Q_ORDER.indexOf(tier) + 1, 3)];
        if (tier === 'off') {
          stopped = true;
          useStills();
        } else {
          applyTier();
          perfT = 0;
        }
      }
    }
  }
  const shiftView = () => (window.innerWidth >= 860 ? 1 : 0);
  const clock = new THREE.Clock();
  const instant = reduce || SHOT != null;
  // 점검용: ?cam=x,y,z&look=x,y,z&up=x,y,z
  const num3 = (k, d) => (params.get(k) || d).split(',').map(Number);
  const DBG = params.has('cam') ? { cam: num3('cam'), look: num3('look', '0,0,0'), up: num3('up', '0,1,0') } : null;
  if (SHOT != null) {
    const st = S[SHOT] || S[0];
    if (params.has('carx')) st.car = [Number(params.get('carx')), 0, Number(params.get('carz') || 4.4), 0];
    camPos.set(...st.cam);
    camLook.set(...st.look);
    car.g.position.set(st.car[0], st.car[1], st.car[2]);
    car.g.rotation.y = st.car[3];
  }
  let simT = 0;
  const EV_STILL = { 1: 8, 2: 4.6, 3: 8.6, 4: 3, 5: 4.2, 6: 8 };
  function frame() {
    if (stopped) return;
    const raw = clock.getDelta();
    watchPerf(raw);
    const camDt = Math.min(raw, 0.05); // 장면 이동(스크롤)은 멈춤 중에도
    const dt = document.body.classList.contains('paused') ? 0 : camDt; // 꾸밈 움직임
    simT += dt;
    const t = simT;
    const st = S[station] || S[0];

    const k = instant ? 1 : 1 - Math.pow(0.003, camDt);
    const sway = instant ? 0 : 1;
    tmp.set(...st.cam);
    if (!shiftView() && !DBG) {
      // 모바일(세로 화면)은 좌우가 좁아 잘리므로 카메라를 뒤로 물린다
      const L = st.look;
      const M = station === 0 || station === 7 ? 1.1 : 1.2;
      tmp.set(L[0] + (tmp.x - L[0]) * M, L[1] + (tmp.y - L[1]) * M, L[2] + (tmp.z - L[2]) * M);
    }
    tmp.x += mouseX * 1.2 * sway + Math.sin(t * 0.22) * 0.7 * sway;
    tmp.y += -mouseY * 0.6 * sway;
    camPos.lerp(tmp, k);
    tmp.set(...st.look);
    camLook.lerp(tmp, k);
    camera.position.copy(camPos);
    if (DBG) {
      camera.position.set(...DBG.cam);
      camera.up.set(...DBG.up);
      camera.lookAt(...DBG.look);
    } else camera.lookAt(camLook);
    if (DBG) camera.clearViewOffset();
    else if (shiftView()) camera.setViewOffset(window.innerWidth, window.innerHeight, -window.innerWidth * 0.15, 0, window.innerWidth, window.innerHeight);
    else camera.setViewOffset(window.innerWidth, window.innerHeight, 0, window.innerHeight * -0.03, window.innerWidth, window.innerHeight); // 모바일: 카드가 아래를 가리므로 장면을 위로

    // 문제의 차: 새 자리로 미끄러져 들어가 비상등
    carTarget.set(st.car[0], st.car[1], st.car[2]);
    car.g.position.lerp(carTarget, instant ? 1 : 1 - Math.pow(0.004, camDt));
    car.g.rotation.y += (st.car[3] - car.g.rotation.y) * (instant ? 1 : 0.08);
    // 인도 장면: 한쪽 바퀴를 보도에 올린 모양
    car.g.rotation.x += 0 - car.g.rotation.x;
    const parked = car.g.position.distanceTo(carTarget) < 0.25;
    const onAir = station >= 1 && station <= 6;
    car.setHazard(onAir && parked && Math.sin(t * 7) > 0);
    for (const led of cctvLeds) led.material.emissiveIntensity = Math.sin(t * 3) > 0 ? 2.5 : 0.15;
    for (const lt of ledTexes) lt.offset.x = (t * 0.045) % 1;
    if (station !== evStation) {
      for (const key in EV) EV[key].show(Number(key) === station);
      evStation = station;
      evT = 0;
    }
    if (onAir && parked) evT += dt;
    if (EV[station]) EV[station].update(EVT != null ? EVT : reduce ? EV_STILL[station] : evT, CLEAN ? 0 : instant ? 1 : 0.14, t);

    for (const s of S) {
      if (!s.mark) continue;
      const on = s === st && parked;
      for (const m of s.mark) {
        if (CLEAN) {
          m.opacity = 0;
          continue;
        }
        const peak = m === stopGlow ? 0.55 + 0.3 * Math.sin(t * 4) : 1;
        m.opacity += ((on ? peak : 0) - m.opacity) * (instant ? 1 : 0.14);
      }
    }
    // 오가는 차 · 사람
    if (!instant) {
      for (const c of traffic) {
        c.g.position.x -= dt * c.speed;
        if (c.g.position.x < -95) c.g.position.x = 100;
      }
      kids.forEach((kd, i) => {
        kd.g.position.y = 0.18 + Math.abs(Math.sin(t * 5 + i)) * 0.03;
        kd.arms[i % 2].rotation.x = Math.sin(t * 3 + i) * 0.5;
      });
      for (const p of strollers) {
        p.x += p.dir * p.v * dt;
        if (p.x > 95) p.x = -95;
        if (p.x < -95) p.x = 95;
        p.g.position.x = p.x;
        p.walk(t * 6 * p.v + p.x, 0.45);
      }
    }
    if (introOn) introStep(camDt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    streetReady(); // 첫 화면을 그렸음 → 인트로가 이때부터 재생
  }
  requestAnimationFrame(frame);
})();
