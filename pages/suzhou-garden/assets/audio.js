export function createSoundscape() {
  let enabled = false, initialized = false, context, noise, rainGain;
  const tracks = new Map();
  function initialize() {
    if (initialized) return; initialized = true;
    for (const name of ['wind', 'birds_dawn', 'crickets', 'pier_lap']) { const audio = new Audio(new URL(`./audio/${name}.ogg`, import.meta.url).href); audio.loop = true; audio.preload = 'none'; audio.volume = 0; tracks.set(name, audio); }
  }
  async function toggle() {
    initialize(); enabled = !enabled;
    if (enabled) {
      const result = await Promise.allSettled([...tracks.values()].map(audio => audio.play()));
      if (result.every(x => x.status === 'rejected')) { enabled = false; return false; }
      if (!context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          context = new AudioContext(); const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate), data = buffer.getChannelData(0); let previous = 0;
          for (let i = 0; i < data.length; i++) { previous = (previous + .02 * (Math.random() * 2 - 1)) / 1.02; data[i] = previous * 6; }
          noise = context.createBufferSource(); noise.buffer = buffer; noise.loop = true; const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2800;
          rainGain = context.createGain(); rainGain.gain.value = 0; noise.connect(filter).connect(rainGain).connect(context.destination); noise.start();
        }
      }
      await context?.resume();
    } else { for (const audio of tracks.values()) audio.pause(); await context?.suspend(); }
    return enabled;
  }
  function update(hour, weather, paused) {
    if (!enabled) return;
    const night = hour > 19 || hour < 6, rain = weather === 'rain', scale = paused ? .2 : 1;
    for (const [name, audio] of tracks) { const target = ({ wind: .065, birds_dawn: night || rain ? 0 : .105, crickets: night ? .12 : .008, pier_lap: .045 })[name] * scale; audio.volume += (target - audio.volume) * .09; }
    if (rainGain) rainGain.gain.setTargetAtTime(rain ? .22 * scale : 0, context.currentTime, .35);
  }
  return { toggle, update, get enabled() { return enabled; }, dispose() { for (const audio of tracks.values()) { audio.pause(); audio.src = ''; } noise?.stop(); context?.close(); } };
}
