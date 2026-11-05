const paths = {
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />\n      <circle cx="12" cy="10" r="2.5" />',
  search: '<circle cx="10.5" cy="10.5" r="6.5" />\n      <path d="m16 16 5 5" />',
  close: '<path d="m6 6 12 12M6 18 18 6" />',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6" />',
  cube: '<path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10L3 7m9 5 9-5m-9 5v10M7 4.8l9.2 5.1" />',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-9 10 9 5 9-5M3 18l9 5 9-5" />',
  home: '<path d="m3 10 9-7 9 7v11H3ZM9 21v-8h6v8" />',
  moon: '<path d="M20.7 13.8A9 9 0 0 1 10.2 3.3a9 9 0 1 0 10.5 10.5Z" />',
  sun: '<circle cx="12" cy="12" r="4" />\n      <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />',
  rain: '<path\n        d="M5 15a3.5 3.5 0 0 1-.3-7A5.5 5.5 0 0 1 15 6a4.5 4.5 0 1 1 3 9M8 18l-1 3m6-3-1 3m6-3-1 3"\n      />',
  snow: '<path\n        d="M12 2v20M3.34 7l17.32 10M3.34 17 20.66 7M8.5 4 12 7.5 15.5 4M8.5 20l3.5-3.5 3.5 3.5M3.5 11.2 8.3 10l-1.2-4.8M20.5 12.8 15.7 14l1.2 4.8M3.5 12.8 8.3 14l-1.2 4.8M20.5 11.2 15.7 10l1.2-4.8"\n      />',
  info: '<circle cx="12" cy="12" r="9" />\n      <path d="M12 11v6m0-10v.2" />',
  fullscreen: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6" />',
  play: '<path d="m7 4 13 8-13 8Z" fill="currentColor" stroke="none" />',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3" />',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />',
  car: '<path d="m5 8 2-5h10l2 5M4 17H2V9l3-1h14l3 1v8h-2M4 17v3h3v-3m10 0v3h3v-3M4 17h16M2 12h20" />\n      <path d="M5 14h2m10 0h2" />',
  fly: '<path d="m3 10 18-7-7 18-3-8Zm8 3L21 3" />',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6" />\n      <path d="M12 6v4" />',
  rotate: '<path d="M21 8V3l-3 3a9 9 0 1 0 3 10M21 8h-5" />',
};
export function icon(name) {
  return (
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    (paths[name] || '') +
    '</svg>'
  );
}
