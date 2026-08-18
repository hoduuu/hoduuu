// 나만의 꾸미기 - 클라이언트 전용 이미지 합성 에디터
// 좌표계: 모든 레이어의 x/y/w/h는 스테이지 기준 퍼센트(%) 값으로 저장한다.
// 내보내기 캔버스 해상도(1200x800, 3:2)는 .stage의 CSS aspect-ratio와 동일하므로
// 화면 크기와 무관하게 편집 화면과 PNG 출력이 항상 같은 비율로 유지된다.

const STAGE_W = 1200;
const STAGE_H = 800;
const STAGE_RATIO = STAGE_W / STAGE_H; // 1.5

const ASSETS = {
  background: [
    { name: '바다', src: 'assets/backgrounds/ocean.svg' },
    { name: '산', src: 'assets/backgrounds/mountain.svg' },
    { name: '노을', src: 'assets/backgrounds/sunset.svg' },
  ],
  character: [
    { name: '물고기', src: 'assets/characters/fish.svg' },
    { name: '고양이', src: 'assets/characters/cat.svg' },
    { name: '곰', src: 'assets/characters/bear.svg' },
    { name: '새', src: 'assets/characters/bird.svg' },
  ],
  prop: [
    { name: '나무', src: 'assets/props/tree.svg' },
    { name: '집', src: 'assets/props/house.svg' },
    { name: '해', src: 'assets/props/sun.svg' },
    { name: '구름', src: 'assets/props/cloud.svg' },
    { name: '풍선', src: 'assets/props/balloon.svg' },
  ],
};

const stage = document.getElementById('stage');
const layerControls = document.getElementById('layerControls');
const textControls = document.getElementById('textControls');

let layers = []; // { id, type: 'image'|'text', el, ...props }
let selectedId = null;
let backgroundSrc = null;
let uid = 0;

// ---------- 갤러리 초기화 ----------
function renderGallery(category) {
  const galleryEl = document.getElementById(`${category}Gallery`);
  galleryEl.innerHTML = '';
  ASSETS[category].forEach((asset) => {
    const btn = document.createElement('button');
    btn.className = 'gallery-item';
    btn.title = asset.name;
    btn.innerHTML = `<img src="${asset.src}" alt="${asset.name}" draggable="false" />`;
    btn.addEventListener('click', () => {
      if (category === 'background') setBackground(asset.src);
      else addImageLayer(asset.src);
    });
    galleryEl.appendChild(btn);
  });
}
['background', 'character', 'prop'].forEach(renderGallery);

// 기본 배경 지정
setBackground(ASSETS.background[0].src);

// ---------- 탭 전환 ----------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector(`.tab-panel[data-panel="${btn.dataset.tab}"]`).classList.add('active');
  });
});

function switchTab(tab) {
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).click();
}

// ---------- 업로드 ----------
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.getElementById('backgroundUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  ASSETS.background.push({ name: '내 배경', src: dataUrl });
  renderGallery('background');
  setBackground(dataUrl);
  e.target.value = '';
});

document.getElementById('characterUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  ASSETS.character.push({ name: '내 캐릭터', src: dataUrl });
  renderGallery('character');
  addImageLayer(dataUrl);
  e.target.value = '';
});

document.getElementById('propUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  ASSETS.prop.push({ name: '내 소품', src: dataUrl });
  renderGallery('prop');
  addImageLayer(dataUrl);
  e.target.value = '';
});

// ---------- 배경 ----------
function setBackground(src) {
  backgroundSrc = src;
  stage.style.backgroundImage = `url("${src}")`;
}

// ---------- 이미지 레이어 ----------
function addImageLayer(src) {
  const img = new Image();
  img.onload = () => {
    const aspect = img.naturalHeight / img.naturalWidth; // h/w
    const wPct = 22;
    const hPct = wPct * STAGE_RATIO * aspect;
    const layer = {
      id: ++uid,
      type: 'image',
      src,
      aspect,
      x: 50 - wPct / 2,
      y: 50 - hPct / 2,
      w: wPct,
      h: hPct,
    };
    layer.el = createImageLayerEl(layer);
    layers.push(layer);
    stage.appendChild(layer.el);
    selectLayer(layer.id);
  };
  img.src = src;
}

function createImageLayerEl(layer) {
  const el = document.createElement('div');
  el.className = 'layer';
  el.dataset.id = layer.id;
  el.innerHTML = `<img src="${layer.src}" draggable="false" alt="" /><div class="resize-handle"></div>`;
  layer.el = el;
  applyLayerBox(layer);
  el.addEventListener('pointerdown', (e) => startMove(e, layer));
  el.querySelector('.resize-handle').addEventListener('pointerdown', (e) => startResize(e, layer));
  return el;
}

function applyLayerBox(layer) {
  layer.el.style.left = `${layer.x}%`;
  layer.el.style.top = `${layer.y}%`;
  layer.el.style.width = `${layer.w}%`;
  layer.el.style.height = `${layer.h}%`;
}

// ---------- 텍스트 레이어 ----------
document.getElementById('addTextBtn').addEventListener('click', () => {
  const layer = {
    id: ++uid,
    type: 'text',
    content: '텍스트를 입력하세요',
    fontFamily: document.getElementById('textFont').value,
    color: document.getElementById('textColor').value,
    fontSizeFrac: Number(document.getElementById('textSize').value) / STAGE_H,
    x: 50,
    y: 50,
  };
  layer.el = createTextLayerEl(layer);
  layers.push(layer);
  stage.appendChild(layer.el);
  selectLayer(layer.id);
});

function createTextLayerEl(layer) {
  const el = document.createElement('div');
  el.className = 'layer text-layer';
  el.dataset.id = layer.id;
  el.textContent = layer.content;
  layer.el = el;
  applyTextStyle(layer);
  el.addEventListener('pointerdown', (e) => startMove(e, layer));
  return el;
}

function applyTextStyle(layer) {
  layer.el.style.left = `${layer.x}%`;
  layer.el.style.top = `${layer.y}%`;
  layer.el.style.transform = 'translate(-50%, -50%)';
  layer.el.style.color = layer.color;
  layer.el.style.fontFamily = layer.fontFamily;
  layer.el.style.fontSize = `${layer.fontSizeFrac * stage.clientHeight}px`;
  layer.el.textContent = layer.content;
}

// 스테이지 크기가 바뀌어도(반응형) 텍스트 폰트 크기를 재계산
const resizeObserver = new ResizeObserver(() => {
  layers.filter((l) => l.type === 'text').forEach(applyTextStyle);
});
resizeObserver.observe(stage);

// ---------- 텍스트 컨트롤 바인딩 ----------
document.getElementById('textContent').addEventListener('input', (e) => {
  const layer = getSelected();
  if (!layer || layer.type !== 'text') return;
  layer.content = e.target.value;
  applyTextStyle(layer);
});
document.getElementById('textFont').addEventListener('change', (e) => {
  const layer = getSelected();
  if (!layer || layer.type !== 'text') return;
  layer.fontFamily = e.target.value;
  applyTextStyle(layer);
});
document.getElementById('textColor').addEventListener('input', (e) => {
  const layer = getSelected();
  if (!layer || layer.type !== 'text') return;
  layer.color = e.target.value;
  applyTextStyle(layer);
});
document.getElementById('textSize').addEventListener('input', (e) => {
  const layer = getSelected();
  if (!layer || layer.type !== 'text') return;
  layer.fontSizeFrac = Number(e.target.value) / STAGE_H;
  applyTextStyle(layer);
});

// ---------- 선택 ----------
function getSelected() {
  return layers.find((l) => l.id === selectedId);
}

function selectLayer(id) {
  selectedId = id;
  layers.forEach((l) => l.el.classList.toggle('selected', l.id === id));
  const layer = getSelected();
  layerControls.hidden = !layer;
  if (layer && layer.type === 'text') {
    switchTab('text');
    document.getElementById('textContent').value = layer.content;
    document.getElementById('textFont').value = layer.fontFamily;
    document.getElementById('textColor').value = layer.color;
    document.getElementById('textSize').value = Math.round(layer.fontSizeFrac * STAGE_H);
    textControls.hidden = false;
  }
}

function deselect() {
  selectedId = null;
  layers.forEach((l) => l.el.classList.remove('selected'));
  layerControls.hidden = true;
}

stage.addEventListener('pointerdown', (e) => {
  if (e.target === stage) deselect();
});

// ---------- 이동 / 크기조절 ----------
let dragState = null;

function startMove(e, layer) {
  e.stopPropagation();
  selectLayer(layer.id);
  const rect = stage.getBoundingClientRect();
  dragState = {
    mode: 'move',
    layer,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startX: layer.x,
    startY: layer.y,
    rectW: rect.width,
    rectH: rect.height,
  };
  window.addEventListener('pointermove', onDrag);
  window.addEventListener('pointerup', endDrag);
}

function startResize(e, layer) {
  e.stopPropagation();
  selectLayer(layer.id);
  const rect = stage.getBoundingClientRect();
  dragState = {
    mode: 'resize',
    layer,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startW: layer.w,
    rectW: rect.width,
    rectH: rect.height,
  };
  window.addEventListener('pointermove', onDrag);
  window.addEventListener('pointerup', endDrag);
}

function onDrag(e) {
  if (!dragState) return;
  const { mode, layer, startClientX, startClientY, rectW, rectH } = dragState;
  if (mode === 'move') {
    const dxPct = ((e.clientX - startClientX) / rectW) * 100;
    const dyPct = ((e.clientY - startClientY) / rectH) * 100;
    layer.x = clampPos(dragState.startX + dxPct, layer.type === 'image' ? layer.w : 0);
    layer.y = clampPos(dragState.startY + dyPct, layer.type === 'image' ? layer.h : 0);
    if (layer.type === 'image') applyLayerBox(layer);
    else applyTextStyle(layer);
  } else if (mode === 'resize') {
    const dxPct = ((e.clientX - startClientX) / rectW) * 100;
    let newW = Math.min(90, Math.max(5, dragState.startW + dxPct));
    layer.w = newW;
    layer.h = newW * STAGE_RATIO * layer.aspect;
    applyLayerBox(layer);
  }
}

function clampPos(v, sizePct) {
  return Math.min(100 - sizePct, Math.max(0, v));
}

function endDrag() {
  dragState = null;
  window.removeEventListener('pointermove', onDrag);
  window.removeEventListener('pointerup', endDrag);
}

// ---------- 레이어 순서 / 삭제 ----------
document.getElementById('bringFrontBtn').addEventListener('click', () => {
  const layer = getSelected();
  if (!layer) return;
  layers = layers.filter((l) => l.id !== layer.id).concat(layer);
  stage.appendChild(layer.el);
});

document.getElementById('sendBackBtn').addEventListener('click', () => {
  const layer = getSelected();
  if (!layer) return;
  layers = [layer, ...layers.filter((l) => l.id !== layer.id)];
  stage.insertBefore(layer.el, stage.firstChild);
});

document.getElementById('deleteLayerBtn').addEventListener('click', () => {
  const layer = getSelected();
  if (!layer) return;
  layer.el.remove();
  layers = layers.filter((l) => l.id !== layer.id);
  deselect();
});

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && document.activeElement.tagName !== 'INPUT') {
    document.getElementById('deleteLayerBtn').click();
  }
});

// ---------- PNG 내보내기 ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function exportPng() {
  const canvas = document.createElement('canvas');
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  const ctx = canvas.getContext('2d');

  // 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  if (backgroundSrc) {
    const bg = await loadImage(backgroundSrc);
    drawCover(ctx, bg, 0, 0, STAGE_W, STAGE_H);
  }

  // 폰트 로딩 대기
  const families = [...new Set(layers.filter((l) => l.type === 'text').map((l) => l.fontFamily))];
  await Promise.all(
    families.map((f) => document.fonts.load(`40px ${f}`).catch(() => {}))
  );
  await document.fonts.ready;

  for (const layer of layers) {
    if (layer.type === 'image') {
      const img = await loadImage(layer.src);
      const x = (layer.x / 100) * STAGE_W;
      const y = (layer.y / 100) * STAGE_H;
      const w = (layer.w / 100) * STAGE_W;
      const h = (layer.h / 100) * STAGE_H;
      ctx.drawImage(img, x, y, w, h);
    } else {
      const x = (layer.x / 100) * STAGE_W;
      const y = (layer.y / 100) * STAGE_H;
      const fontSize = layer.fontSizeFrac * STAGE_H;
      ctx.font = `${fontSize}px ${layer.fontFamily}`;
      ctx.fillStyle = layer.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = layer.content.split('\n');
      const lineHeight = fontSize * 1.2;
      const totalH = lineHeight * (lines.length - 1);
      lines.forEach((line, i) => {
        ctx.fillText(line, x, y - totalH / 2 + i * lineHeight);
      });
    }
  }

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-decoration-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function drawCover(ctx, img, dx, dy, dw, dh) {
  const scale = Math.max(dw / img.width, dh / img.height);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

document.getElementById('exportBtn').addEventListener('click', () => {
  exportPng();
});
