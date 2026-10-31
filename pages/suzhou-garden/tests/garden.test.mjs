import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionWorld, BRIDGES, GATES, STOPS, inPond, bridgeAt, floorAt, EYE_HEIGHT, BOUNDS, pondDistance } from '../assets/layout.js';

test('walking stops at shore and cannot tunnel across the lake during a long frame', () => {
  const world = createCollisionWorld();
  assert.equal(world.allowed(0, 0), false);
  const start = { x: -8, z: 25.5 };
  assert.equal(world.allowed(start.x, start.z), true);
  const end = world.move(start, 0, -60);
  assert.ok(end.z > 15);
  assert.ok(pondDistance(end.x, end.z) >= .63);
  assert.equal(world.allowed(end.x, end.z), true);
});

test('all bridge centre lines remain walkable across water and have continuous floor heights', () => {
  const world = createCollisionWorld();
  for (const bridge of BRIDGES) {
    let previous;
    for (let i = 0; i <= 80; i++) {
      const t = i / 80, x = bridge.a[0] + (bridge.b[0] - bridge.a[0]) * t, z = bridge.a[1] + (bridge.b[1] - bridge.a[1]) * t;
      assert.ok(world.allowed(x, z), `bridge at ${x},${z}`);
      const height = floorAt(x, z);
      assert.ok(Number.isFinite(height));
      if (previous !== undefined) assert.ok(Math.abs(height - previous) < .2);
      previous = height;
    }
  }
});

test('moon gates have a passable centre and solid side walls in both orientations', () => {
  const world = createCollisionWorld();
  for (const gate of GATES) {
    assert.ok(world.allowed(gate.x, gate.z), gate.name);
    const x = gate.x + Math.cos(gate.rotation) * 4, z = gate.z - Math.sin(gate.rotation) * 4;
    assert.equal(world.allowed(x, z), false, gate.name);
  }
});

test('movement slides along walls, stays in bounds, and tracks eye height on an arched bridge', () => {
  const world = createCollisionWorld(); world.box(60, 42, 1, 10);
  const end = world.move({ x: 58, z: 40 }, 6, 3);
  assert.ok(end.x < 59.25); assert.ok(end.z > 42.5);
  assert.equal(world.allowed(BOUNDS.maxX + 1, 0), false);
  const arch = BRIDGES.find(b => b.arch), x = (arch.a[0] + arch.b[0]) / 2, z = (arch.a[1] + arch.b[1]) / 2;
  const point = world.move({ x, z }, 0, 0);
  assert.ok(Math.abs(point.y - arch.height - arch.arch - EYE_HEIGHT) < 1e-8);
});

test('all six destinations are valid land or bridge locations before decorative colliders', () => {
  const world = createCollisionWorld();
  for (const stop of STOPS) assert.ok(world.allowed(stop.position[0], stop.position[2]), stop.title);
  assert.ok(inPond(13, 3)); assert.ok(world.allowed(13, 3));
  assert.equal(bridgeAt(0, 0), null);
});
