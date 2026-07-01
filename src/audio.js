// Web Audio API Sound Synthesizer for Retro Rock Pinball
class SoundSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicInterval = null;
    this.musicEnabled = false;
    this.tempo = 120; // BPM
    this.beatLength = 60 / this.tempo; // seconds
    this.currentBeat = 0;

    // Grunge bassline note frequencies (D-minor / Blues scale feel)
    // D1: 36.71Hz, F1: 43.65Hz, G1: 49.00Hz, Ab1: 51.91Hz, A1: 55.00Hz, C2: 65.41Hz
    this.bassline = [
      36.71, 36.71, 43.65, 49.00,
      51.91, 49.00, 43.65, 36.71,
      65.41, 65.41, 55.00, 49.00,
      43.65, 43.65, 36.71, 0
    ];
  }

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime); // volume limit
    this.masterGain.connect(this.ctx.destination);
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Bumper hits - Synthesized heavy drums/crashes with a rock flare
  playBumper(type) {
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    
    // Create heavy drum kick oscillator
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain);

    if (type === 1) { // Nirvana (Yellow Bumper) - Grunge Bass Thump
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(100, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.15);
      gain.gain.setValueAtTime(1.5, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.26);

      // Add a bit of white noise snare
      this.playNoise(0.12, 0.4, 1000);
    } else if (type === 2) { // Guns N' Roses (Red Bumper) - Snare & High Ring
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(250, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
      gain.gain.setValueAtTime(0.8, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.21);

      this.playNoise(0.18, 0.6, 2000);
    } else { // Rage Against the Machine (White Bumper) - Cowbell/Metal clank
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, t); // D5
      gain.gain.setValueAtTime(0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.16);

      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, t); // A5
      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      gain2.gain.setValueAtTime(0.4, t);
      gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc2.start(t);
      osc2.stop(t + 0.11);
    }
  }

  // Helper to generate a burst of band-limited white noise
  playNoise(duration, volume, lowpassFreq = 2000) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpassFreq;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(volume, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.start(t);
    noise.stop(t + duration + 0.05);
  }

  // Slingshot Hit (Snappy punchy bounce)
  playSlingshot() {
    this.resume();
    if (!this.ctx) return;
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    
    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(t);
    osc.stop(t + 0.11);
    
    // Snappy noise click
    this.playNoise(0.06, 0.5, 4000);
  }

  // Target Hits - Distorted synth guitar "pluck" (2-note chord)
  playTarget() {
    this.resume();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const frequencies = [146.83, 220.00]; // D3 and A3 power chord (fifths)
    
    frequencies.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      // Distorted rock pluck feel
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      
      // Add slight detune for chorus effect
      osc.detune.setValueAtTime(Math.random() * 8 - 4, t);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

      // Low pass filter to simulate guitar speaker
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, t);
      filter.frequency.exponentialRampToValueAtTime(200, t + 0.35);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  // Flipper Clack
  playFlipper() {
    this.resume();
    if (!this.ctx) return;
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.03);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(t);
    osc.stop(t + 0.04);
  }

  // Plunger Charge Hum
  playPlungerHum(chargeRatio) {
    this.resume();
    if (!this.ctx) return;
    
    // We create a temporary hum that rises in frequency depending on chargeRatio
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(60 + chargeRatio * 120, t); // 60Hz to 180Hz
    
    gain.gain.setValueAtTime(chargeRatio * 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // Plunger Launch (Rising spring shot)
  playLaunch() {
    this.resume();
    if (!this.ctx) return;
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(t);
    osc.stop(t + 0.21);
  }

  // Ball Drain (Descending sad bend)
  playDrain() {
    this.resume();
    if (!this.ctx) return;
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.8);
    
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(t);
    osc.stop(t + 0.81);
  }

  // Rollover Lane light-up (Happy synth beep)
  playRollover() {
    this.resume();
    if (!this.ctx) return;
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, t); // C5
    osc.frequency.setValueAtTime(659.25, t + 0.08); // E5
    
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(t);
    osc.stop(t + 0.21);
  }

  // Ramp Success Sound (Cool arpeggio)
  playRamp() {
    this.resume();
    if (!this.ctx) return;
    
    const t = this.ctx.currentTime;
    const notes = [293.66, 349.23, 440.00, 587.33]; // D4, F4, A4, D5 (D-minor chord)
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);
      
      gain.gain.setValueAtTime(0, t);
      gain.gain.setValueAtTime(0.25, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.08 + 0.25);
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      
      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.26);
    });
  }

  // Start the background grunge bass loop
  toggleMusic() {
    this.resume();
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
      this.musicEnabled = false;
      return false;
    }

    this.musicEnabled = true;
    this.currentBeat = 0;
    
    this.musicInterval = setInterval(() => {
      if (!this.ctx) return;
      
      const t = this.ctx.currentTime;
      const freq = this.bassline[this.currentBeat];
      
      if (freq > 0) {
        // Trigger a cool synth bass note
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        
        // Distort filter sweep
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, t);
        filter.frequency.exponentialRampToValueAtTime(100, t + 0.25);
        
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(t);
        osc.stop(t + 0.36);

        // Add a soft kick on beats 0, 4, 8, 12
        if (this.currentBeat % 4 === 0) {
          const kick = this.ctx.createOscillator();
          const kickGain = this.ctx.createGain();
          
          kick.type = 'triangle';
          kick.frequency.setValueAtTime(80, t);
          kick.frequency.exponentialRampToValueAtTime(25, t + 0.15);
          
          kickGain.gain.setValueAtTime(0.5, t);
          kickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
          
          kick.connect(kickGain);
          kickGain.connect(this.masterGain);
          
          kick.start(t);
          kick.stop(t + 0.2);
        }

        // Add a soft high-hat click on beats 2, 6, 10, 14
        if (this.currentBeat % 4 === 2) {
          this.playNoise(0.04, 0.08, 6000);
        }
      }
      
      this.currentBeat = (this.currentBeat + 1) % this.bassline.length;
    }, this.beatLength * 1000 / 2); // Play eighth notes

    return true;
  }
}

export const audio = new SoundSynth();
