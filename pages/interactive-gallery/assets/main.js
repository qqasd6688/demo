const host = document.querySelector('#entrance');
const stage = host.querySelector('.entrance-stage');
const cards = [...host.querySelectorAll('.portal')];
const loading = host.querySelector('.entrance-loading');
const fallbackNote = host.querySelector('.entrance-fallback-note');
const motionButton = host.querySelector('#motion-toggle');
const pagination = host.querySelector('.gallery-pagination');
const previousButton = host.querySelector('#previous-group');
const nextButton = host.querySelector('#next-group');
const groupLabel = host.querySelector('#group-label');
const groupCount = Math.ceil(cards.length / 6);
const playback = { paused: false, hidden: document.hidden, interacting: false, focused: -1 };
let group = 0;
let runtime;
let generation = 0;
let ready = false;
let disposed = false;
let pointer;
let dragging = false;
let suppressClick = false;

function syncPlayback() {
  motionButton.setAttribute('aria-pressed', String(playback.paused));
  motionButton.textContent = playback.paused ? '▷ 继续动效' : 'Ⅱ 暂停动效';
  runtime?.setPlayback({ ...playback });
}

function resetCardStyles() {
  for (const card of cards) {
    card.style.transform = '';
    card.style.zIndex = '';
    card.style.pointerEvents = '';
  }
}

function showFallback() {
  ready = false;
  runtime?.dispose();
  runtime = undefined;
  endDrag();
  host.classList.remove('is-ready');
  host.classList.add('is-fallback');
  loading.hidden = true;
  fallbackNote.hidden = false;
  motionButton.disabled = true;
  resetCardStyles();
}

async function renderGroup(nextGroup) {
  const currentGeneration = ++generation;
  ready = false;
  endDrag();
  runtime?.dispose();
  runtime = undefined;
  group = nextGroup;
  playback.focused = -1;
  suppressClick = false;
  resetCardStyles();
  const activeCards = cards.slice(group * 6, group * 6 + 6);
  cards.forEach((card) => { card.hidden = !activeCards.includes(card); });
  pagination.hidden = groupCount <= 1;
  previousButton.disabled = true;
  nextButton.disabled = true;
  groupLabel.textContent = `${group + 1} / ${groupCount} 组`;
  // 每组使用独立 canvas，避免上一组的上下文释放事件影响新场景。
  const canvas = document.createElement('canvas');
  stage.replaceChildren(canvas);
  host.classList.remove('is-ready', 'is-fallback');
  loading.hidden = false;
  fallbackNote.hidden = true;
  motionButton.disabled = true;
  syncPlayback();
  try {
    const { createEntranceScene } = await import('./scene.js');
    if (disposed || currentGeneration !== generation) return;
    const created = await createEntranceScene({
      canvas,
      host: stage,
      cards: activeCards,
      entries: activeCards.map((card) => ({ href: card.dataset.href, cover: card.dataset.cover })),
      skipEntrance: playback.paused,
      onFailure: () => { if (currentGeneration === generation && !disposed) showFallback(); },
    });
    if (disposed || currentGeneration !== generation) {
      created.dispose();
      return;
    }
    runtime = created;
    ready = true;
    host.classList.add('is-ready');
    loading.hidden = true;
    motionButton.disabled = false;
    syncPlayback();
  } catch (error) {
    if (!disposed && currentGeneration === generation) {
      console.error('入口展厅初始化失败', error);
      showFallback();
    }
  } finally {
    if (!disposed && currentGeneration === generation) {
      previousButton.disabled = group === 0;
      nextButton.disabled = group === groupCount - 1;
    }
  }
}

// 超过阈值才捕获指针；保留普通链接点击与键盘导航。
host.addEventListener('pointerdown', (event) => {
  if (pointer || !ready || event.button !== 0 || stage.clientWidth < 760) return;
  if (event.target.closest('.entrance-footer')) return;
  suppressClick = false;
  playback.focused = -1;
  playback.interacting = true;
  pointer = { id: event.pointerId, startX: event.clientX, lastX: event.clientX };
  syncPlayback();
});
host.addEventListener('pointermove', (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  if (!dragging && Math.abs(event.clientX - pointer.startX) < 6) return;
  if (!dragging) {
    dragging = true;
    host.classList.add('is-dragging');
    host.setPointerCapture(pointer.id);
  }
  event.preventDefault();
  runtime?.dragBy(event.clientX - pointer.lastX);
  pointer.lastX = event.clientX;
});
function endDrag(event) {
  if (!pointer || (event?.pointerId !== undefined && event.pointerId !== pointer.id)) return;
  const held = pointer;
  pointer = undefined;
  suppressClick = dragging;
  dragging = false;
  playback.interacting = false;
  host.classList.remove('is-dragging');
  if (host.hasPointerCapture(held.id)) host.releasePointerCapture(held.id);
  syncPlayback();
}
host.addEventListener('lostpointercapture', endDrag);
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('blur', endDrag);
host.addEventListener('dragstart', (event) => event.preventDefault());
function guardCardClick(event) {
  if (event.detail === 0) return;
  const card = event.target.closest('.portal');
  // 透明 HTML 点击区不能穿过地球或前排面板；键盘激活沿用原生链接行为。
  const obscured = card && ready && stage.clientWidth >= 760 &&
    runtime?.getEntryAt(event.clientX, event.clientY) !== cards.indexOf(card) % 6;
  if (suppressClick || obscured) {
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }
}
host.addEventListener('click', guardCardClick, true);
host.addEventListener('auxclick', guardCardClick, true);

cards.forEach((card, index) => {
  card.addEventListener('focusin', (event) => {
    if (event.target.matches(':focus-visible')) {
      playback.focused = index % 6;
      syncPlayback();
    }
  });
  card.addEventListener('focusout', (event) => {
    if (!card.contains(event.relatedTarget)) {
      playback.focused = -1;
      syncPlayback();
    }
  });
});
motionButton.addEventListener('click', () => {
  playback.paused = !playback.paused;
  syncPlayback();
});
previousButton.addEventListener('click', () => { if (group > 0) renderGroup(group - 1); });
nextButton.addEventListener('click', () => { if (group < groupCount - 1) renderGroup(group + 1); });
document.addEventListener('visibilitychange', () => {
  playback.hidden = document.hidden;
  if (playback.hidden) endDrag();
  syncPlayback();
});
window.addEventListener('pagehide', (event) => {
  endDrag();
  if (event.persisted) {
    playback.hidden = true;
    syncPlayback();
  } else {
    disposed = true;
    generation++;
    runtime?.dispose();
  }
});
window.addEventListener('pageshow', () => {
  playback.hidden = document.hidden;
  syncPlayback();
});

renderGroup(0);
