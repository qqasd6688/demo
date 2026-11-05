import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('home entry links to Sakura Station with its own screenshot and visible description', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const cards = [...html.matchAll(/<article class="work-card\b[^>]*>[\s\S]*?<\/article>/g)].map(m => m[0]);
  const card = cards.find(c => c.includes('data-href="./sakura-station/"'));
  assert.ok(card);
  assert.ok(card.includes('href="./sakura-station/"'));
  assert.ok(card.includes('data-cover="./sakura-station/assets/cover.webp"'));
  assert.ok(card.includes('src="./sakura-station/assets/cover.webp"'));
  assert.match(card, /<h3[^>]*>樱日小站<\/h3>/);
  assert.match(card, /<p[^>]*>把春日停在街角/);
});
