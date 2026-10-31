import { createGuideModel } from './guide-model.js';
import { createMapRuntime } from './runtime/createMapRuntime.js';
import { icon } from './icons.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const page = $('.sanfang-page');
const dialog = $('#about-dialog');
const search = $('.search-box input');
const placeTemplate = $('#place-template');
let model;
let runtime;
let starting = false;
const changed = new Set();
let renderQueued = false;

// 只观察界面字段。Three.js 相机、材质和飞行对象保持普通对象，逐帧变化只更新对应的界面。
const state = new Proxy(
  {
    selected: null,
    laneDestination: null,
    filter: '全部',
    query: '',
    timeOfDay: 'day',
    weather: 'sunny',
    theme: 'day',
    crowdPlaying: true,
    crowdCount: 0,
    labels: true,
    top: false,
    tour: false,
    driving: false,
    driveSpeed: 0,
    driveRoad: '',
    driveBlocked: false,
    tourIndex: 0,
    flight: null,
    statusText: '',
    statusUntil: 0,
    ready: false,
    entrancePhase: 'roads',
    lost: false,
    hiddenAt: 0,
    overview: true,
    detailBinding: '',
    compassAngle: '0',
    loading: true,
    error: '',
    aboutOpen: false,
  },
  {
    set(target, key, value) {
      if (Object.is(target[key], value)) return true;
      target[key] = value;
      changed.add(key);
      if (!renderQueued) {
        renderQueued = true;
        queueMicrotask(() => {
          renderQueued = false;
          const keys = new Set(changed);
          changed.clear();
          render(keys);
        });
      }
      return true;
    },
  },
);

function selectable(place) {
  return (
    place.kind === 'landmark' ||
    place.category === '坊巷' ||
    Boolean(model.siteBuildings.get(place.id)?.length)
  );
}

function renderPlaces() {
  if (!model) return;
  const keyword = state.query.trim().toLowerCase();
  const candidates = keyword
    ? [...model.places, ...model.data.lanes]
    : state.filter === '坊巷'
      ? model.data.lanes
      : model.places;
  const matches = candidates.filter(
    (place) =>
      (!keyword && state.filter !== '全部' ? place.category === state.filter : true) &&
      (!keyword ||
        `${place.name} ${place.location} ${place.subtitle}`.toLowerCase().includes(keyword)),
  );
  const selected = state.selected || state.laneDestination;
  const fragment = document.createDocumentFragment();
  for (const place of matches) {
    const item = placeTemplate.content.cloneNode(true);
    const button = $('.place', item);
    button.dataset.place = place.id;
    button.disabled = !selectable(place);
    button.title = button.disabled ? '尚未可靠关联建筑，暂不支持选择' : place.name;
    button.setAttribute('aria-pressed', String(selected?.id === place.id));
    $('.place-index', item).textContent = place.number || '';
    $('.place-name', item).textContent = place.name;
    $('.place-meta', item).textContent = button.disabled
      ? '未关联建筑 · 暂不支持选择'
      : `${place.category} · ${place.location}`;
    fragment.append(item);
  }
  $('.place-list').replaceChildren(fragment);
  $('.empty').hidden = matches.length > 0;
  $('.list-heading strong').textContent = keyword
    ? '搜索结果'
    : state.filter === '全部'
      ? '精选地标'
      : state.filter === '坊巷'
        ? '三坊 · 七巷 · 一街'
        : `${state.filter}寻访`;
  $('.list-heading span').textContent = `${String(matches.length).padStart(2, '0')} 处`;
}

function renderDetail() {
  const place = state.selected || state.laneDestination;
  $('.intro').hidden = Boolean(place);
  $('.detail').hidden = !place;
  for (const button of $$('.place-list button'))
    button.setAttribute('aria-pressed', String(button.dataset.place === place?.id));
  if (!place) return;
  $('.detail-category').textContent = place.category === '坊巷' ? '坊巷快捷定位' : place.category;
  $('.detail h2').textContent = place.name;
  $('.detail-subtitle').textContent = place.subtitle || '';
  $('.detail-description').textContent = place.description || '';
  $('.source-link').href = place.source || model.data.sourceLinks.osm;
  const coordinates = $$('.detail .coordinate');
  coordinates[0].textContent = `${place.position[1].toFixed(5)}° N ${place.position[0].toFixed(5)}° E · ${place.coordinateNote || 'WGS84'}`;
  coordinates[1].textContent = state.detailBinding;
}

function render(keys = new Set(['*'])) {
  const has = (...names) => keys.has('*') || names.some((name) => keys.has(name));
  if (has('theme')) page.dataset.theme = state.theme;
  if (has('entrancePhase')) {
    page.dataset.entrance = state.entrancePhase;
    for (const element of $$('.entrance-ui')) element.inert = state.entrancePhase !== 'complete';
  }
  if (has('query', 'filter')) {
    if (search.value !== state.query) search.value = state.query;
    $('.clear-search').hidden = !state.query;
    for (const button of $$('[data-filter]'))
      button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
    renderPlaces();
  }
  if (has('selected', 'laneDestination', 'detailBinding')) renderDetail();
  if (has('crowdPlaying', 'crowdCount')) {
    const button = $('.crowd-toggle');
    button.hidden = !state.crowdCount;
    button.setAttribute('aria-pressed', String(state.crowdPlaying));
    button.textContent = `${state.crowdPlaying ? '游客漫游' : '游客暂停'} · ${state.crowdCount} 人`;
  }
  if (has('timeOfDay', 'weather', 'ready')) {
    for (const button of $$('[data-time], [data-weather]')) {
      button.disabled = !state.ready;
      button.setAttribute(
        'aria-pressed',
        String(
          button.dataset.time
            ? button.dataset.time === state.timeOfDay
            : button.dataset.weather === state.weather,
        ),
      );
    }
    for (const action of ['home', 'labels', 'tour', 'drive', 'north'])
      $(`[data-action="${action}"]`).disabled = !state.ready;
  }
  if (has('labels', 'tour', 'driving')) {
    $('[data-action="labels"]').setAttribute('aria-pressed', String(state.labels));
    const tour = $('[data-action="tour"]');
    tour.setAttribute('aria-pressed', String(state.tour));
    tour.setAttribute('aria-label', state.tour ? '停止导览' : '开始导览');
    tour.dataset.tip = state.tour ? '停止导览' : '开始导览 · 林则徐纪念馆出发';
    tour.innerHTML = icon(state.tour ? 'stop' : 'play');
    const drive = $('[data-action="drive"]');
    drive.setAttribute('aria-pressed', String(state.driving));
    drive.setAttribute('aria-label', state.driving ? '退出驾驶模式' : '进入驾驶模式');
    drive.dataset.tip = state.driving ? '退出驾驶 · Esc' : '驾驶小车 · 鼠标转向';
    page.dataset.driving = String(state.driving);
    $('.driving-hint').hidden = !state.driving;
    $('.map-canvas').setAttribute(
      'aria-label',
      state.driving
        ? '驾驶地图。按住鼠标左键拖动调整视角，车头跟随。W 前进，S 后退，A 左移，D 右移，Esc 退出驾驶。'
        : '三维地图。左键拖拽旋转，右键平移，滚轮缩放。也可使用景点列表和地图工具按钮。',
    );
  }
  if (has('driveRoad', 'driveSpeed', 'driveBlocked')) {
    $('.driving-hint strong').textContent = state.driveRoad;
    $('.driving-hint .shrink-0 span').textContent = `${state.driveSpeed} km/h`;
    const status = $('.driving-hint > div:last-child > span:last-child');
    status.textContent = `${state.driveBlocked ? '前方受阻，请调整方向' : '沿道路行驶'} · Esc 退出`;
    status.className = state.driveBlocked ? 'text-accent' : 'text-muted';
  }
  if (has('compassAngle')) $('.compass svg').style.transform = `rotate(${state.compassAngle}deg)`;
  if (has('statusText')) {
    $('.view-status').classList.toggle('visible', Boolean(state.statusText));
    $('.view-status span').textContent = state.statusText;
  }
  if (has('loading', 'error')) {
    $('.loading').hidden = !state.loading;
    $('.loading').setAttribute('role', state.error ? 'alert' : 'status');
    $('.loader-mark').hidden = Boolean(state.error);
    $('.loading h2').textContent = state.error ? '暂时无法展开三维地图' : '展开一座古城';
    $('.loading p').textContent = state.error || '正在构建街巷、院落与青瓦屋顶…';
    $('.retry').hidden = !state.error;
  }
  if (has('aboutOpen')) {
    if (state.aboutOpen && !dialog.open) dialog.showModal();
    else if (!state.aboutOpen && dialog.open) dialog.close();
  }
}

async function initialize() {
  if (starting) return;
  starting = true;
  runtime?.dispose();
  Object.assign(state, {
    loading: true,
    error: '',
    lost: false,
    selected: null,
    laneDestination: null,
    crowdCount: 0,
    entrancePhase: 'roads',
  });
  try {
    if (!model) {
      const response = await fetch(new URL('./data/map-data.json', import.meta.url));
      if (!response.ok) throw new Error(`地图数据读取失败（${response.status}）`);
      model = createGuideModel(await response.json());
    }
    $('.intro-stats > div:last-child strong').textContent = model.places.length;
    const oldCanvas = $('.map-canvas');
    const canvas = oldCanvas.cloneNode(false);
    oldCanvas.replaceWith(canvas);
    render();
    runtime = createMapRuntime({
      model,
      state,
      stage: $('.stage'),
      canvas,
      labelLayer: $('.labels'),
      miniCanvas: $('.mini-map'),
      miniPanel: $('.mini-panel'),
      environmentControls: $('.environment-controls'),
    });
  } catch (error) {
    console.error('三坊七巷初始化失败', error);
    state.error = '地图资源加载失败，请检查本地服务或网络后重试。';
    state.entrancePhase = 'complete';
  } finally {
    starting = false;
  }
}

search.addEventListener('input', () => {
  state.query = search.value;
});
page.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action], [data-filter]');
  if (!button || button.disabled) return;
  if (button.dataset.filter) {
    state.filter = button.dataset.filter;
    state.query = '';
    return;
  }
  switch (button.dataset.action) {
    case 'navigate': {
      const place = model?.placesById.get(button.dataset.place || 'heart-tree');
      if (place) runtime?.navigate(place);
      break;
    }
    case 'close':
      runtime?.closeDetail();
      break;
    case 'fly':
      runtime?.flyToSelection();
      break;
    case 'toggle-crowd':
      runtime?.toggleCrowd();
      break;
    case 'clear-search':
      state.query = '';
      search.focus();
      break;
    case 'time':
      runtime?.setEnvironment(button.dataset.time, state.weather);
      break;
    case 'weather':
      runtime?.setEnvironment(state.timeOfDay, button.dataset.weather);
      break;
    case 'home':
      runtime?.home();
      break;
    case 'labels':
      runtime?.toggleLabels();
      break;
    case 'tour':
      runtime?.toggleTour();
      break;
    case 'drive':
      runtime?.toggleDriving();
      break;
    case 'north':
      runtime?.north();
      break;
    case 'pick':
      runtime?.pickMiniMap(event);
      break;
    case 'retry':
      await initialize();
      break;
    case 'about':
      runtime?.pauseNavigation();
      state.aboutOpen = true;
      break;
    case 'close-about':
      state.aboutOpen = false;
      break;
    case 'fullscreen':
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await page.requestFullscreen();
      } catch {
        runtime?.notify('当前浏览器暂不支持全屏浏览');
      }
      break;
  }
});
dialog.addEventListener('close', () => {
  state.aboutOpen = false;
});
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    state.aboutOpen = false;
});

render();
initialize();
