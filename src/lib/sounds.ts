// Dźwięki generowane proceduralnie przez Web Audio API – bez zewnętrznych plików

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Generuje bufor białego szumu o podanej długości
function noise(ac: AudioContext, duration: number): AudioBufferSourceNode {
  const samples = ac.sampleRate * duration
  const buf = ac.createBuffer(1, samples, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buf
  return src
}

// Huk wystrzału armatniego
export function playShoot() {
  const ac = getCtx()
  const t = ac.currentTime

  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.connect(gain); gain.connect(ac.destination)
  osc.frequency.setValueAtTime(120, t)
  osc.frequency.exponentialRampToValueAtTime(25, t + 0.25)
  gain.gain.setValueAtTime(0.35, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
  osc.start(t); osc.stop(t + 0.25)

  const n = noise(ac, 0.18)
  const ng = ac.createGain()
  const f = ac.createBiquadFilter()
  f.type = 'bandpass'; f.frequency.value = 350
  n.connect(f); f.connect(ng); ng.connect(ac.destination)
  ng.gain.setValueAtTime(0.12, t)
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
  n.start(t)
}

// Trafienie – eksplozja
export function playHit() {
  const ac = getCtx()
  const t = ac.currentTime

  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.connect(gain); gain.connect(ac.destination)
  osc.frequency.setValueAtTime(90, t)
  osc.frequency.exponentialRampToValueAtTime(18, t + 0.6)
  gain.gain.setValueAtTime(0.45, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
  osc.start(t); osc.stop(t + 0.6)

  const n = noise(ac, 0.5)
  const ng = ac.createGain()
  const f = ac.createBiquadFilter()
  f.type = 'lowpass'; f.frequency.value = 700
  n.connect(f); f.connect(ng); ng.connect(ac.destination)
  ng.gain.setValueAtTime(0.28, t)
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
  n.start(t)
}

// Pudło – plusk wody
export function playMiss() {
  const ac = getCtx()
  const t = ac.currentTime

  const n = noise(ac, 0.45)
  const ng = ac.createGain()
  const f = ac.createBiquadFilter()
  f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6
  n.connect(f); f.connect(ng); ng.connect(ac.destination)
  ng.gain.setValueAtTime(0.001, t)
  ng.gain.linearRampToValueAtTime(0.18, t + 0.04)
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
  n.start(t)

  // Bulgot
  const osc = ac.createOscillator()
  const og = ac.createGain()
  osc.connect(og); og.connect(ac.destination)
  osc.frequency.setValueAtTime(520, t + 0.04)
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.35)
  og.gain.setValueAtTime(0.08, t + 0.04)
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
  osc.start(t + 0.04); osc.stop(t + 0.35)
}

// Zatopiony statek – potrójna eksplozja
export function playSunk() {
  const ac = getCtx()
  const t = ac.currentTime

  ;[0, 0.12, 0.26].forEach((delay, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.connect(gain); gain.connect(ac.destination)
    osc.frequency.setValueAtTime(90 - i * 18, t + delay)
    osc.frequency.exponentialRampToValueAtTime(12, t + delay + 0.8)
    gain.gain.setValueAtTime(0.4 - i * 0.05, t + delay)
    gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.8)
    osc.start(t + delay); osc.stop(t + delay + 0.8)
  })

  const n = noise(ac, 1.1)
  const ng = ac.createGain()
  const f = ac.createBiquadFilter()
  f.type = 'lowpass'; f.frequency.value = 650
  n.connect(f); f.connect(ng); ng.connect(ac.destination)
  ng.gain.setValueAtTime(0.38, t)
  ng.gain.exponentialRampToValueAtTime(0.001, t + 1.1)
  n.start(t)
}

// Wygrana – fanfara wznoszącymi się nutami
export function playWin() {
  const ac = getCtx()
  const t = ac.currentTime
  const notes = [523, 659, 784, 1047, 1319] // C5 E5 G5 C6 E6

  notes.forEach((freq, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'triangle'
    osc.connect(gain); gain.connect(ac.destination)
    osc.frequency.value = freq
    const s = t + i * 0.13
    gain.gain.setValueAtTime(0.28, s)
    gain.gain.exponentialRampToValueAtTime(0.001, s + 0.5)
    osc.start(s); osc.stop(s + 0.5)
  })
}

// Przegrana – opadające smutne nuty
export function playLose() {
  const ac = getCtx()
  const t = ac.currentTime
  const notes = [392, 349, 311, 261] // G4 F4 Eb4 C4

  notes.forEach((freq, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'triangle'
    osc.connect(gain); gain.connect(ac.destination)
    osc.frequency.value = freq
    const s = t + i * 0.22
    gain.gain.setValueAtTime(0.22, s)
    gain.gain.exponentialRampToValueAtTime(0.001, s + 0.55)
    osc.start(s); osc.stop(s + 0.55)
  })
}
