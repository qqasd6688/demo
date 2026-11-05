const cards = [...document.querySelectorAll('.work-card')];
const filters = [...document.querySelectorAll('[data-filter]')];
const search = document.querySelector('#work-search');
const clear = document.querySelector('#clear-search');
const count = document.querySelector('#result-count');
const empty = document.querySelector('#empty-state');
let category = 'all';

const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase('zh-CN').trim();
const searchable = new Map(cards.map((card) => [card, normalize(`${card.textContent} ${card.dataset.keywords}`)]));

function filterWorks() {
  const terms = normalize(search.value).split(/\s+/).filter(Boolean);
  let visible = 0;
  for (const card of cards) {
    const matches = (category === 'all' || card.dataset.category === category)
      && terms.every((term) => searchable.get(card).includes(term));
    card.hidden = !matches;
    if (matches) visible++;
  }
  for (const button of filters) {
    const active = button.dataset.filter === category;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  clear.hidden = search.value.length === 0;
  empty.hidden = visible > 0;
  count.textContent = category === 'all' && terms.length === 0
    ? `共 ${cards.length} 件作品，等你来探索`
    : `找到 ${visible} 件作品`;
}

for (const button of filters) {
  button.addEventListener('click', () => {
    category = button.dataset.filter;
    filterWorks();
  });
}
search.addEventListener('input', filterWorks);
search.form.addEventListener('submit', (event) => event.preventDefault());
clear.addEventListener('click', () => {
  search.value = '';
  filterWorks();
  search.focus();
});
document.querySelector('#reset-filters').addEventListener('click', () => {
  category = 'all';
  search.value = '';
  filterWorks();
  filters[0].focus();
});
document.querySelectorAll('[data-enhancement]').forEach((element) => { element.hidden = false; });
