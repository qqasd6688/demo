import test from 'node:test';
import assert from 'node:assert/strict';
import { rooms, deviceDefinitions, createState, applyScene, saveState, estimatedWatts, STORAGE_KEY } from '../assets/state.js';

const memoryStorage = () => { const data = new Map(); return { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) }; };
test('120㎡分区无重叠且独立设备均关联有效房间', () => {
  const bounds = rooms.filter(r => r.bounds).map(r => r.bounds);
  const area = bounds.reduce((sum, [x0, x1, z0, z1]) => sum + (x1 - x0) * (z1 - z0), 0);
  assert.equal(Math.round((area + 4.8 * 1.5) * 10) / 10, 120); // 7.2㎡过廊
  for (let a = 0; a < bounds.length; a++) for (let b = a + 1; b < bounds.length; b++) {
    const [x0, x1, z0, z1] = bounds[a], [u0, u1, v0, v1] = bounds[b];
    assert.ok(Math.min(x1, u1) <= Math.max(x0, u0) || Math.min(z1, v1) <= Math.max(z0, v0));
  }
  assert.equal(new Set(deviceDefinitions.map(d => d.id)).size, 28);
  assert.ok(deviceDefinitions.every(d => rooms.some(r => r.id === d.room)));
  assert.equal(deviceDefinitions.filter(d => d.room === 'master' && d.type === 'light').length, 3);
});
test('单灯状态互相独立，观影和离家场景有实际设备状态变化', () => {
  const state = createState(memoryStorage());
  const left = state.devices.find(d => d.id === 'master-left'), right = state.devices.find(d => d.id === 'master-right');
  left.brightness = 12; left.on = false; assert.equal(right.brightness, 50); assert.equal(right.on, false);
  applyScene(state, 'movie'); assert.equal(state.day, 'night'); assert.equal(state.devices.find(d => d.id === 'living-tv').on, true); assert.equal(state.devices.find(d => d.id === 'living-pendant').on, false);
  applyScene(state, 'away'); assert.deepEqual(state.devices.filter(d => d.on).map(d => d.id), ['kitchen-fridge']);
  assert.equal(estimatedWatts({ ...left, on: false }), 0); assert.equal(estimatedWatts({ ...left, on: true, brightness: 50 }), 3);
});
test('刷新恢复状态，并拒绝存储中非法设备控制值', () => {
  const storage = memoryStorage(), state = createState(storage);
  state.day = 'night'; state.devices[0].brightness = 34; saveState(state, storage);
  assert.equal(createState(storage).devices[0].brightness, 34); assert.equal(createState(storage).day, 'night');
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, day: 'garbage', devices: { 'living-pendant': { on: 'yes', brightness: 200, kelvin: -1 }, 'living-ac': { temperature: -100, mode: 'invalid' } } }));
  const restored = createState(storage); assert.equal(restored.day, 'day'); assert.equal(restored.devices[0].brightness, 100); assert.equal(restored.devices[0].kelvin, 2700); assert.equal(restored.devices.find(d => d.id === 'living-ac').temperature, 16); assert.equal(restored.devices.find(d => d.id === 'living-ac').mode, '制冷');
});
test('损坏或不可用的持久化不会中断体验', () => {
  const storage = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } };
  assert.equal(createState(storage).devices.length, 28); assert.equal(saveState(createState(storage), storage), false);
});
