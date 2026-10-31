import { getLayout, navigationRooms, DEFAULT_LAYOUT } from './layouts.js';
export const rooms = navigationRooms(getLayout(DEFAULT_LAYOUT));
const d = (id, name, room, type, icon, watts, extra = {}) => ({ id, name, room, type, icon, watts, on: false, ...extra });
export const deviceDefinitions = [
  d('living-pendant', '悬环吊灯', 'living', 'light', 'pendant', 42, { on: true, brightness: 80, kelvin: 3000, featured: true }),
  d('living-floor', '弧光落地灯', 'living', 'light', 'lamp', 12, { on: true, brightness: 65, kelvin: 2700, featured: true }),
  d('living-strip', '电视墙氛围灯', 'living', 'light', 'light', 18, { brightness: 45, kelvin: 2700 }),
  d('living-tv', '悬浮电视', 'living', 'tv', 'tv', 95, { volume: 30, mode: '自然', featured: true }),
  d('living-ac', '客厅空调', 'living', 'ac', 'ac', 850, { temperature: 24, mode: '制冷', featured: true }),
  d('living-robot', '扫地机器人', 'living', 'robot', 'robot', 35, { mode: '标准' }),
  d('dining-pendant', '餐桌吊灯', 'dining', 'light', 'pendant', 24, { on: true, brightness: 75, kelvin: 3000, featured: true }),
  d('kitchen-light', '厨房吸顶灯', 'kitchen', 'light', 'light', 28, { brightness: 90, kelvin: 4000 }),
  d('kitchen-strip', '橱柜工作灯', 'kitchen', 'light', 'light', 10, { brightness: 80, kelvin: 4000 }),
  d('kitchen-fridge', '双门冰箱', 'kitchen', 'fridge', 'fridge', 85, { on: true, temperature: 4, featured: true }),
  d('kitchen-oven', '嵌入式烤箱', 'kitchen', 'oven', 'oven', 1800, { temperature: 180, mode: '烘烤' }),
  d('kitchen-hob', '电磁灶', 'kitchen', 'hob', 'oven', 1400, { level: 3 }),
  d('kitchen-hood', '静音油烟机', 'kitchen', 'hood', 'fan', 100, { mode: '低速' }),
  d('kitchen-dishwasher', '嵌入式洗碗机', 'kitchen', 'washer', 'washer', 700, { mode: '节能' }),
  d('master-main', '主卧吸顶灯', 'master', 'light', 'light', 30, { brightness: 70, kelvin: 3000, featured: true }),
  d('master-left', '床头灯 · 左', 'master', 'light', 'lamp', 6, { on: true, brightness: 50, kelvin: 2700, featured: true }),
  d('master-right', '床头灯 · 右', 'master', 'light', 'lamp', 6, { brightness: 50, kelvin: 2700 }),
  d('master-ac', '主卧空调', 'master', 'ac', 'ac', 650, { temperature: 25, mode: '制冷' }),
  d('master-curtain', '电动窗帘', 'master', 'curtain', 'curtain', 25, { openness: 75, featured: true }),
  d('guest-main', '次卧吸顶灯', 'guest', 'light', 'light', 24, { brightness: 75, kelvin: 3000 }),
  d('guest-lamp', '次卧床头灯', 'guest', 'light', 'lamp', 6, { brightness: 55, kelvin: 2700 }),
  d('guest-ac', '次卧空调', 'guest', 'ac', 'ac', 600, { temperature: 25, mode: '制冷' }),
  d('study-main', '书房吸顶灯', 'study', 'light', 'light', 24, { brightness: 80, kelvin: 4000 }),
  d('study-lamp', '阅读台灯', 'study', 'light', 'lamp', 9, { on: true, brightness: 85, kelvin: 4000, featured: true }),
  d('study-monitor', '桌面电脑', 'study', 'monitor', 'tv', 120, { on: true, mode: '专注' }),
  d('bath-light', '镜前柔光灯', 'bath', 'light', 'light', 14, { brightness: 85, kelvin: 4000, featured: true }),
  d('bath-washer', '滚筒洗衣机', 'bath', 'washer', 'washer', 450, { mode: '标准', featured: true }),
  d('bath-fan', '浴室排风', 'bath', 'hood', 'fan', 30, { mode: '低速' }),
];
export const STORAGE_KEY = 'habitat-home-v1';
export const modes = { ac: ['制冷', '制热', '送风'], tv: ['自然', '电影', '音乐'], monitor: ['专注', '夜读'], robot: ['安静', '标准', '强力'], oven: ['烘烤', '热风', '保温'], washer: ['节能', '标准', '强力'], hood: ['低速', '高速'] };
export function createState(storage = null, layoutId = DEFAULT_LAYOUT) {
  const layout = getLayout(layoutId);
  const state = { layoutId: layout.id, devices: devicesForLayout(layout), day: 'day', scene: 'home' };
  try {
    storage ||= globalThis.localStorage;
    const saved = JSON.parse(storage.getItem(storageKey(layout.id)) || 'null');
    if (saved?.version === 1 && saved.devices && typeof saved.devices === 'object') {
      for (const device of state.devices) {
        const value = saved.devices[device.id];
        if (!value || typeof value !== 'object') continue;
        if (typeof value.on === 'boolean') device.on = value.on;
        for (const [key, min, max] of [['brightness', 0, 100], ['volume', 0, 100], ['openness', 0, 100], ['level', 1, 9], ['kelvin', 2700, 5000]]) {
          if (key in device && Number.isFinite(value[key])) device[key] = Math.max(min, Math.min(max, value[key]));
        }
        if ('temperature' in device && Number.isFinite(value.temperature)) {
          const [min, max] = device.type === 'fridge' ? [2, 8] : device.type === 'oven' ? [80, 240] : [16, 30];
          device.temperature = Math.max(min, Math.min(max, value.temperature));
        }
        if (modes[device.type]?.includes(value.mode)) device.mode = value.mode;
      }
      if (['day', 'night'].includes(saved.day)) state.day = saved.day;
      if (['home', 'movie', 'sleep', 'away', 'custom'].includes(saved.scene)) state.scene = saved.scene;
    }
  } catch { /* Private mode, disabled storage, or an obsolete save should not prevent viewing. */ }
  return state;
}
export function saveState(state, storage = null) {
  try { storage ||= globalThis.localStorage; storage.setItem(storageKey(state.layoutId), JSON.stringify({ version: 1, day: state.day, scene: state.scene, devices: Object.fromEntries(state.devices.map(d => [d.id, d])) })); return true; } catch { return false; }
}
export function applyScene(state, name) {
  if (!['home', 'movie', 'sleep', 'away'].includes(name)) return;
  const on = {
    home: ['living-pendant', 'living-floor', 'dining-pendant', 'master-left', 'study-lamp', 'study-monitor', 'kitchen-fridge'],
    movie: ['living-tv', 'living-strip', 'living-floor', 'kitchen-fridge'],
    sleep: ['master-left', 'master-right', 'kitchen-fridge'],
    away: ['kitchen-fridge'],
  }[name];
  state.scene = name;
  if (name === 'movie' || name === 'sleep') state.day = 'night';
  for (const device of state.devices) {
    device.on = on.includes(device.id);
    if (device.type === 'light') {
      device.brightness = name === 'sleep' ? 15 : name === 'movie' ? 30 : (deviceDefinitions.find(d => d.id === (device.templateId || device.id)).brightness);
      device.kelvin = name === 'movie' || name === 'sleep' ? 2700 : deviceDefinitions.find(d => d.id === (device.templateId || device.id)).kelvin;
    }
    if (device.type === 'curtain') device.openness = name === 'sleep' || name === 'movie' ? 0 : 75;
  }
}
export function estimatedWatts(device) {
  if (!device.on || device.type === 'curtain') return 0;
  return Math.round(device.watts * (device.type === 'light' ? device.brightness / 100 : device.type === 'hob' ? device.level / 9 : 1));
}

export function storageKey(layoutId = DEFAULT_LAYOUT) { return layoutId === DEFAULT_LAYOUT ? STORAGE_KEY : STORAGE_KEY + ':' + layoutId; }
export function devicesForLayout(layout) { return layout.rooms.filter(r => r.nav).flatMap(room => deviceDefinitions.filter(d => d.room === room.type && !(room.id === 'ensuite' && d.type === 'washer')).map(d => ({...d, templateId:d.id, id:room.id + d.id.slice(d.room.length),room:room.id,name:room.id === 'junior' ? d.name.replace('次卧','儿童房') : room.id === 'ensuite' ? d.name.replace('浴室','主卫') : d.name}))); }
