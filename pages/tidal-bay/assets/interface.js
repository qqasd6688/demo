import { defaults, sanitizeSettings } from './settings.js';
export const dockSpecies = [
  ['manta', '蝠鲼', 'Manta ray'], ['eagle', '斑点鹰魟', 'Spotted eagle'], ['stingray', '蓝斑魟', 'Blue-spotted ray'], ['turtle', '绿海龟', 'Sea turtle'], ['jelly', '月亮水母', 'Moon jelly'], ['nettle', '海荨麻', 'Sea nettle'], ['school', '银色鱼群', 'Silver school'], ['reef-fish', '珊瑚礁鱼', 'Reef fish'], ['clown', '小丑鱼', 'Clownfish'], ['shark', '黑鳍礁鲨', 'Reef shark'],
];
export function animalIcon(id) {
  const svg = body => `<svg viewBox="0 0 80 50" aria-hidden="true"><defs><linearGradient id="g-${id}" x2=".3" y2="1"><stop stop-color="#d0e8d9"/><stop offset="1" stop-color="#3d7e89"/></linearGradient></defs>${body}</svg>`;
  if (['manta', 'eagle', 'stingray'].includes(id)) {
    const color = id === 'manta' ? '#18313b' : id === 'eagle' ? '#344d59' : '#b0b17c';
    const shape = id === 'stingray' ? 'M25 27C12 8 51 2 58 19Q64 35 42 34L21 46 34 32Z' : 'M8 32Q20 19 28 7Q36 18 40 18Q49 12 57 9Q57 21 73 29L45 32 24 47 36 30Z';
    let dots = ''; for (let i = 0; i < 22 && id !== 'manta'; i++) dots += `<circle cx="${24 + i % 6 * 5}" cy="${16 + Math.floor(i / 6) * 4}" r="${id === 'eagle' ? .8 : 1.3}" fill="${id === 'eagle' ? '#d6dfd7' : '#65bacb'}"/>`;
    return svg(`<path d="${shape}" fill="${color}" stroke="#c0e6e260"/>${dots}${id === 'manta' ? '<path d="m27 15 10 8-11 1m22-8-9 8 14 1" fill="#d6e6df"/>' : ''}`);
  }
  if (id === 'turtle') return svg('<g transform="rotate(-20 40 25)"><path d="m27 17-12-9 2 13 10 2m23-6 13-9-2 13-10 2M29 32l-9 9 13-4m15-5 10 9-12-4" fill="#809979"/><ellipse cx="40" cy="25" rx="16" ry="17" fill="#807c49" stroke="#ccc38c" stroke-width="2"/><ellipse cx="40" cy="6" rx="5" ry="6" fill="#a7ad7d"/><path d="m40 10-9 8v13l9 9 10-9V18Zm0 0v30M25 25h30m-24-7 19 13m0-13L31 31" fill="none" stroke="#c6bd80" stroke-width="1"/></g>');
  if (id === 'jelly' || id === 'nettle') return svg(`<path d="M25 28q-8 13 7 15m6-15q-8 9 5 18m5-18q12 11 4 16" fill="none" stroke="${id === 'jelly' ? '#d0e6ed' : '#dfcb92'}" stroke-width="1" opacity=".7"/><path d="M19 27C16 2 61 0 62 27Q42 38 19 27Z" fill="${id === 'jelly' ? '#c2e0e480' : '#d5c889b0'}" stroke="#e9f0d8"/><ellipse cx="40" cy="27" rx="20" ry="5" fill="none" stroke="#ecf9e880"/>`);
  const one = (x, y, s, color) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-18 0Q0-14 20 0Q0 14-18 0L-29-9-24 0-29 9Z" fill="${color}"/><path d="M-4-7 0-14 8-7" fill="${color}"/><circle cx="13" cy="-1" r="1.2" fill="#062c38"/></g>`;
  if (id === 'school') return svg(Array.from({ length: 8 }, (_, i) => one(25 + i % 3 * 18, 9 + Math.floor(i / 3) * 13, .33, '#d0e3df')).join(''));
  if (id === 'clown') return svg(`${one(47, 25, 1, '#e59b4e')}<path d="m36 17 2 16m10-17 2 16m9-13 1 9" stroke="#f4e8cc" stroke-width="4"/>`);
  if (id === 'shark') return svg('<path d="M9 31 18 20 28 26 44 14 43 23Q67 16 74 27L41 32 29 40 33 31 20 30 10 40 16 29Z" fill="url(#g-shark)"/>');
  return svg(one(30, 17, .7, '#5799c2') + one(54, 32, .65, '#e8ce6c'));
}
const storageKey = 'tidal-bay:ecosystem:v3';
export function setupInterface(handlers) {
  let settings; try { settings = sanitizeSettings(JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch { settings = { ...defaults }; }
  const dock = document.querySelector('#species-dock'), panel = document.querySelector('#settings-panel'), status = document.querySelector('#announcement');
  let timer, dragged = false;
  function announce(message) { status.textContent = message; status.classList.add('show'); clearTimeout(timer); timer = setTimeout(() => status.classList.remove('show'), 2400); }
  function save() { try { localStorage.setItem(storageKey, JSON.stringify(settings)); document.querySelector('#save-status').textContent = '设置已自动保存'; } catch { document.querySelector('#save-status').textContent = '本次设置已生效'; } }
  function sync() { document.querySelectorAll('[data-setting]').forEach(input => { const key = input.dataset.setting; if (input.type === 'checkbox') input.checked = settings[key]; else { input.value = settings[key]; input.closest('label').querySelector('output').textContent = key === 'population' ? settings[key] : Number(settings[key]).toFixed(2); } }); }
  dock.innerHTML = dockSpecies.map(([id, name, en]) => `<button type="button" class="species-card" draggable="true" data-species="${id}" aria-label="添加${name}" title="点击添加${name}，或拖入水面">${animalIcon(id)}<span>${en}</span><small>${name}</small></button>`).join('');
  dock.addEventListener('click', e => { const card = e.target.closest('[data-species]'); if (!card || dragged) return; if (handlers.spawn(card.dataset.species)) announce(`${card.querySelector('small').textContent}游进了海湾`); });
  dock.addEventListener('dragstart', e => { const card = e.target.closest('[data-species]'); if (!card) return; e.dataTransfer.setData('text/plain', card.dataset.species); e.dataTransfer.effectAllowed = 'copy'; document.body.classList.add('is-dragging'); });
  dock.addEventListener('dragend', () => document.body.classList.remove('is-dragging'));
  let touch;
  dock.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; const card = e.target.closest('[data-species]'); if (card) { touch = { id: card.dataset.species, x: e.clientX, y: e.clientY }; dragged = false; } });
  window.addEventListener('pointerup', e => { if (!touch) return; if (Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 25 && e.clientY < dock.getBoundingClientRect().top) { dragged = true; handlers.spawn(touch.id, e.clientX, e.clientY); setTimeout(() => { dragged = false; }, 100); } touch = null; });
  function setPanel(open) { panel.hidden = !open; document.querySelector('#settings-toggle').setAttribute('aria-expanded', String(open)); }
  document.querySelector('#settings-toggle').addEventListener('click', () => setPanel(panel.hidden)); document.querySelector('#panel-close').addEventListener('click', () => setPanel(false));
  document.querySelectorAll('[data-setting]').forEach(input => input.addEventListener('input', () => { settings = sanitizeSettings({ ...settings, [input.dataset.setting]: input.type === 'checkbox' ? input.checked : Number(input.value) }); sync(); save(); handlers.settings(settings); }));
  document.querySelectorAll('[data-event]').forEach(button => button.addEventListener('click', () => { handlers.event(button.dataset.event); announce(button.dataset.event === 'migration' ? '一股银色的洋流，正穿过海湾' : button.dataset.event === 'dolphin' ? '海豚正从外海靠近' : '一场短暂的海风，正在经过'); }));
  document.querySelector('#replay-intro').addEventListener('click', () => handlers.event('intro'));
  document.querySelector('#reset-settings').addEventListener('click', () => { settings = { ...defaults }; sync(); save(); handlers.settings(settings); handlers.event('reset'); announce('已恢复这片海的初始模样'); });
  document.querySelector('#immersive').addEventListener('click', () => { const active = document.body.classList.toggle('immersive'); document.querySelector('#immersive').setAttribute('aria-pressed', String(active)); });
  addEventListener('keydown', e => { if (e.code === 'Escape') { setPanel(false); document.body.classList.remove('immersive'); document.querySelector('#immersive').setAttribute('aria-pressed', 'false'); } });
  sync(); if (innerWidth < 900) setPanel(false);
  return { settings, announce, count(fish, visitors) { document.querySelector('#population-count').textContent = `${fish} 尾鱼 · ${visitors} 位海洋访客`; } };
}
