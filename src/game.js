import { Vec, checkCircleCollision, checkSegmentCollision, resolveCollision } from './physics.js';
import { audio } from './audio.js';

// Game Canvas and context
let canvas, ctx;

// Game constants
const WIDTH = 500;
const BASE_HEIGHT = 800;
let HEIGHT = BASE_HEIGHT;
const SUB_STEPS = 8; // Sub-stepping count for physics precision

// Centralized gameplay tuning. Keeping energy sources here makes it easier to
// balance the table without changing collision math in several places.
const PHYSICS_TUNING = {
  airDrag: 0.05,
  maxBallSpeed: 2400,
  bumperRestitution: 0.75,
  bumperFriction: 0.08,
  flipperRestitution: 0.38,
  flipperFriction: 0.08,
  slingshotFacingThreshold: 0.75,
};

const difficultySettings = {
  normal: {
    label: 'NORMAL',
    balls: 3,
    gravity: 900,
  },
  practice: {
    label: 'PRACTICA',
    balls: 5,
    gravity: 820,
  },
};

// Game state
const state = {
  score: 0,
  highScore: parseInt(localStorage.getItem('rock_pinball_highscore') || '0', 10),
  balls: 3,
  maxBalls: 3,
  difficulty: 'normal',
  multiplier: 1,
  gameState: 'START', // 'START', 'PLAYING', 'GAMEOVER'
  activeBandMode: 'NONE', // 'NONE', 'NIRVANA', 'GNR', 'RATM'
  bandHits: { nirvana: 0, gnr: 0, rage: 0 },
  rockLanes: { r: false, o: false, c: false, k: false },
  tiltCount: 0,
  isTilted: false,
  comboCount: 0,
  comboMultiplier: 1,
  comboExpiresAt: 0,
};

const COMBO_WINDOW_MS = 2600;

// Keyboard inputs state
const keys = {};
const controlledKeys = new Set([' ', 'arrowleft', 'arrowright', 'a', 'l', 'm', 'r', 't']);
const scheduledTimers = new Set();

let startScreen;
let gameOverScreen;
let settingsPanel;
let menuToggle;
let musicToggle;
let scorePanel;
let plungerPowerIndicator;
let scoreCollapseTimer;
let lastTouchEndTime = 0;
let viewportResizeTimer;

function lowerY(y) {
  return y + Math.max(0, HEIGHT - BASE_HEIGHT);
}

// Background Image
const bgImage = new Image();
bgImage.src = new URL('../assets/rock-wallpaper-user.png', import.meta.url).href;

// Ball object
const ball = {
  pos: Vec.create(460, lowerY(750)),
  vel: Vec.create(0, 0),
  radius: 13,
  mass: 1.0,
  active: false,
  onRamp: false,
  rampProgress: 0,
  rampSpeed: 0.05,
  stuckTime: 0,
  pocketTime: 0,
};

// Plunger object
const plunger = {
  x: 445,
  y: lowerY(770),
  width: 30,
  height: 30,
  compression: 0,
  maxCompression: 40,
  chargeDuration: 1.25,
  minLaunchSpeed: 550,
  maxLaunchSpeed: 1650,
};

// Flippers definition
const flippers = {
  left: {
    pivot: Vec.create(145, lowerY(705)),
    length: 70,
    radius: 8,
    angle: 0.38, // rest angle (downwards)
    minAngle: -0.38, // fully actuated (upwards)
    maxAngle: 0.38,
    speed: 26,
    restSpeed: 13,
    omega: 0,
    state: 'down',
    isLeft: true
  },
  right: {
    pivot: Vec.create(305, lowerY(705)),
    length: 70,
    radius: 8,
    angle: Math.PI - 0.38, // rest angle (downwards)
    minAngle: Math.PI - 0.38,
    maxAngle: Math.PI + 0.38, // fully actuated (upwards)
    speed: 26,
    restSpeed: 13,
    omega: 0,
    state: 'down',
    isLeft: false
  }
};

// Static Wall Segments
const walls = [];

// Circular Bumpers
const bumpers = [
  { id: 'nirvana', pos: Vec.create(235, 245), radius: 30, label: 'NIRVANA', color: '#FF2D20', flashTime: 0, activeColor: '#FFFFFF', points: 1000 },
  { id: 'gnr', pos: Vec.create(150, 350), radius: 26, label: 'GNR', color: '#FF3B30', flashTime: 0, activeColor: '#FF9E9E', points: 1000 },
  { id: 'rage', pos: Vec.create(320, 350), radius: 26, label: 'RATM', color: '#B80F0A', flashTime: 0, activeColor: '#FFFFFF', points: 1000 },
  { id: 'amp', pos: Vec.create(92, 268), radius: 19, label: 'AMP', color: '#FF453A', flashTime: 0, activeColor: '#FFC1BC', points: 1250 },
  { id: 'skull', pos: Vec.create(382, 265), radius: 19, label: 'SKULL', color: '#D7D7DC', flashTime: 0, activeColor: '#FFFFFF', points: 1500 },
  { id: 'riff', pos: Vec.create(235, 438), radius: 22, label: 'RIFF', color: '#FF2D20', flashTime: 0, activeColor: '#FFD0CC', points: 1500 },
  { id: 'fire', pos: Vec.create(285, 505), radius: 18, label: 'FIRE', color: '#FF6961', flashTime: 0, activeColor: '#FFFFFF', points: 1750 }
];

// Slingshots (Triangles) - only the front edge kicks
const slingshots = [
  {
    // Left Slingshot
    p1: Vec.create(95, lowerY(590)),
    p2: Vec.create(125, lowerY(665)),
    restitution: 0.8,
    friction: 0.1,
    isSlingshot: true,
    flashTime: 0,
    normal: Vec.create(0.9, -0.4) // points up-right
  },
  {
    // Right Slingshot
    p1: Vec.create(355, lowerY(590)),
    p2: Vec.create(325, lowerY(665)),
    restitution: 0.8,
    friction: 0.1,
    isSlingshot: true,
    flashTime: 0,
    normal: Vec.create(-0.9, -0.4) // points up-left
  }
];

// Target definitions
const dropTargets = [
  { id: 'target_1', p1: Vec.create(30, 440), p2: Vec.create(45, 450), active: true, color: '#D31510', flashTime: 0 },
  { id: 'target_2', p1: Vec.create(30, 470), p2: Vec.create(45, 480), active: true, color: '#D31510', flashTime: 0 },
  { id: 'target_3', p1: Vec.create(30, 500), p2: Vec.create(45, 510), active: true, color: '#D31510', flashTime: 0 },
  { id: 'target_4', p1: Vec.create(405, 440), p2: Vec.create(420, 450), active: true, color: '#FF3B30', flashTime: 0 },
  { id: 'target_5', p1: Vec.create(405, 470), p2: Vec.create(420, 480), active: true, color: '#FF3B30', flashTime: 0 },
  { id: 'target_6', p1: Vec.create(405, 500), p2: Vec.create(420, 510), active: true, color: '#FF3B30', flashTime: 0 }
];

// Center spinner: a scoring gate that keeps the middle of the table active.
const centerSpinner = {
  p1: Vec.create(185, 535),
  p2: Vec.create(255, 535),
  restitution: 0.72,
  friction: 0.04,
  flashTime: 0,
  cooldown: 0,
};

const multiplierInserts = [2, 3, 4, 5, 6].map((value, index) => ({
  value,
  x: 155 + index * 38,
  y: lowerY(565),
}));

const modeInserts = [
  { label: 'N', color: '#FF3B30', isLit: () => state.bandHits.nirvana >= 5 },
  { label: 'G', color: '#FF3B30', isLit: () => state.bandHits.gnr >= 5 },
  { label: 'R', color: '#B80F0A', isLit: () => state.bandHits.rage >= 5 },
  { label: 'R', color: '#FF2D20', isLit: () => rolloverLanes[0].lit },
  { label: 'O', color: '#FF453A', isLit: () => rolloverLanes[1].lit },
  { label: 'C', color: '#FF6961', isLit: () => rolloverLanes[2].lit },
  { label: 'K', color: '#FF8A80', isLit: () => rolloverLanes[3].lit },
  { label: 'TGT', color: '#D31510', isLit: () => dropTargets.every((target) => !target.active) },
  { label: 'RAMP', color: '#FF3B30', isLit: () => ball.onRamp },
].map((insert, index) => ({
  ...insert,
  x: 190 + (index % 3) * 40,
  baseY: 595 + Math.floor(index / 3) * 28,
  y: lowerY(595 + Math.floor(index / 3) * 28),
}));

const playfieldPosts = [
  { pos: Vec.create(78, 390), radius: 8, color: '#FF3B30', flashTime: 0 },
  { pos: Vec.create(392, 390), radius: 8, color: '#FF3B30', flashTime: 0 },
  { pos: Vec.create(115, lowerY(535)), baseY: 535, radius: 9, color: '#D31510', flashTime: 0 },
  { pos: Vec.create(350, lowerY(535)), baseY: 535, radius: 9, color: '#FF453A', flashTime: 0 },
  { pos: Vec.create(150, lowerY(650)), baseY: 650, radius: 8, color: '#B80F0A', flashTime: 0 },
  { pos: Vec.create(310, lowerY(650)), baseY: 650, radius: 8, color: '#FF3B30', flashTime: 0 },
];

// Rollover Lanes (R-O-C-K at top)
const rolloverLanes = [
  { id: 'r', x1: 170, x2: 205, y: 110, lit: false, label: 'R', color: '#FF2D20' },
  { id: 'o', x1: 205, x2: 240, y: 110, lit: false, label: 'O', color: '#D31510' },
  { id: 'c', x1: 240, x2: 275, y: 110, lit: false, label: 'C', color: '#B80F0A' },
  { id: 'k', x1: 275, x2: 310, y: 110, lit: false, label: 'K', color: '#FF6B61' }
];

// Ramp definition
const rampEntrance = { x: 55, y: 400, width: 25, height: 15 };
const rampPath = [
  Vec.create(60, 390),
  Vec.create(50, 300),
  Vec.create(65, 200),
  Vec.create(110, 130),
  Vec.create(180, 100),
  Vec.create(240, 120), // Drops onto the R-O-C-K lanes
];

// (Plunger Gate removed to prevent trapping bugs)

// Visual particles for hits
let particles = [];

// Initialize Static Boundaries
function initWalls() {
  walls.length = 0; // Clear array

  // Outer left wall
  walls.push({ p1: Vec.create(20, 230), p2: Vec.create(20, lowerY(640)), restitution: 0.6, friction: 0.05 });
  // Left outlane outer guide
  walls.push({ p1: Vec.create(20, lowerY(640)), p2: Vec.create(80, lowerY(710)), restitution: 0.6, friction: 0.05 });

  // Plunger lane inner wall divider
  walls.push({ p1: Vec.create(440, 230), p2: Vec.create(440, HEIGHT), restitution: 0.6, friction: 0.05 });
  // Plunger lane outer right wall
  walls.push({ p1: Vec.create(480, 230), p2: Vec.create(480, HEIGHT), restitution: 0.6, friction: 0.05 });

  // Right outlane outer guide
  walls.push({ p1: Vec.create(440, lowerY(640)), p2: Vec.create(380, lowerY(710)), restitution: 0.6, friction: 0.05 });

  // Bottom drain slanted outer structures
  walls.push({ p1: Vec.create(20, lowerY(710)), p2: Vec.create(100, lowerY(780)), restitution: 0.1, friction: 0.1 });
  walls.push({ p1: Vec.create(440, lowerY(710)), p2: Vec.create(350, lowerY(780)), restitution: 0.1, friction: 0.1 });

  // Inlane guide rails (slanted dividers that feed flippers or let ball go to outlane)
  // Left inlane guide
  walls.push({ p1: Vec.create(80, lowerY(560)), p2: Vec.create(125, lowerY(660)), restitution: 0.4, friction: 0.05 });
  walls.push({ p1: Vec.create(100, lowerY(700)), p2: Vec.create(125, lowerY(660)), restitution: 0.4, friction: 0.05 });
  
  // Right inlane guide
  walls.push({ p1: Vec.create(380, lowerY(560)), p2: Vec.create(335, lowerY(660)), restitution: 0.4, friction: 0.05 });
  walls.push({ p1: Vec.create(360, lowerY(700)), p2: Vec.create(335, lowerY(660)), restitution: 0.4, friction: 0.05 });

  // Top arch: smooth circle semi-curve connecting left wall (20, 230) to right outer wall (480, 230)
  const archCenter = Vec.create(250, 230);
  const archRadius = 230;
  const numSteps = 24;
  let prevPt = Vec.create(20, 230);
  for (let i = 1; i <= numSteps; i++) {
    const angle = Math.PI - (i / numSteps) * Math.PI;
    const nextPt = Vec.create(
      archCenter.x + archRadius * Math.cos(angle),
      archCenter.y - archRadius * Math.sin(angle)
    );
    walls.push({ p1: prevPt, p2: nextPt, restitution: 0.7, friction: 0.02 });
    prevPt = nextPt;
  }

  // Visual/physical lane dividers at the top to direct ball into ROCK lanes
  walls.push({ p1: Vec.create(170, 70), p2: Vec.create(170, 130), restitution: 0.2, friction: 0.05 });
  walls.push({ p1: Vec.create(205, 70), p2: Vec.create(205, 130), restitution: 0.2, friction: 0.05 });
  walls.push({ p1: Vec.create(240, 70), p2: Vec.create(240, 130), restitution: 0.2, friction: 0.05 });
  walls.push({ p1: Vec.create(275, 70), p2: Vec.create(275, 130), restitution: 0.2, friction: 0.05 });
  walls.push({ p1: Vec.create(310, 70), p2: Vec.create(310, 130), restitution: 0.2, friction: 0.05 });
}

// Particle explosion helper
function spawnParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 150;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1 + Math.random() * 3,
      color,
      alpha: 1.0,
      decay: 0.02 + Math.random() * 0.03
    });
  }
}

function scheduleTimer(callback, delay) {
  const timerId = window.setTimeout(() => {
    scheduledTimers.delete(timerId);
    callback();
  }, delay);
  scheduledTimers.add(timerId);
  return timerId;
}

function clearScheduledTimers() {
  for (const timerId of scheduledTimers) {
    window.clearTimeout(timerId);
  }
  scheduledTimers.clear();
}

function configureViewportWorld() {
  const viewportWidth = Math.max(1, window.innerWidth || WIDTH);
  const viewportHeight = Math.max(1, window.innerHeight || BASE_HEIGHT);
  document.documentElement.style.setProperty('--app-height', `${viewportHeight}px`);
  const playfield = document.querySelector('.playfield-container');
  const playfieldWidth = Math.max(1, playfield?.clientWidth || viewportWidth);
  const playfieldHeight = Math.max(1, playfield?.clientHeight || viewportHeight - 118);
  HEIGHT = Math.max(BASE_HEIGHT, Math.round(WIDTH * (playfieldHeight / playfieldWidth)));
  applyAdaptiveGeometry();
}

function resizeCanvasBackingStore() {
  if (!canvas || !ctx) return;
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  canvas.width = Math.round(WIDTH * dpr);
  canvas.height = Math.round(HEIGHT * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function handleViewportChange() {
  window.clearTimeout(viewportResizeTimer);
  viewportResizeTimer = window.setTimeout(() => {
    configureViewportWorld();
    resizeCanvasBackingStore();
    initWalls();
    render();
  }, 120);
}

function applyAdaptiveGeometry() {
  plunger.y = lowerY(770);
  flippers.left.pivot = Vec.create(145, lowerY(705));
  flippers.right.pivot = Vec.create(305, lowerY(705));

  slingshots[0].p1 = Vec.create(95, lowerY(590));
  slingshots[0].p2 = Vec.create(125, lowerY(665));
  slingshots[1].p1 = Vec.create(355, lowerY(590));
  slingshots[1].p2 = Vec.create(325, lowerY(665));
  for (const insert of multiplierInserts) insert.y = lowerY(565);
  for (const insert of modeInserts) insert.y = lowerY(insert.baseY);
  for (const post of playfieldPosts) {
    if (post.baseY) post.pos.y = lowerY(post.baseY);
  }

  if (!ball.active) {
    resetBall();
  }
}

// Game Reset
function resetBall() {
  ball.pos = Vec.create(460, lowerY(750));
  ball.vel = Vec.create(0, 0);
  ball.active = false;
  ball.onRamp = false;
  ball.rampProgress = 0;
  ball.stuckTime = 0;
  ball.pocketTime = 0;
}

function startGame() {
  clearScheduledTimers();
  window.clearTimeout(scoreCollapseTimer);
  scorePanel?.classList.remove('is-expanded');
  const selectedDifficulty = document.getElementById('difficulty-select')?.value || 'normal';
  const difficulty = difficultySettings[selectedDifficulty] ? selectedDifficulty : 'normal';
  const settings = difficultySettings[difficulty];

  state.score = 0;
  state.difficulty = difficulty;
  state.maxBalls = settings.balls;
  state.balls = settings.balls;
  state.multiplier = 1;
  state.activeBandMode = 'NONE';
  state.bandHits = { nirvana: 0, gnr: 0, rage: 0 };
  for (const lane of rolloverLanes) lane.lit = false;
  for (const t of dropTargets) t.active = true;
  state.gameState = 'PLAYING';
  state.isTilted = false;
  state.tiltCount = 0;
  resetCombo();
  centerSpinner.cooldown = 0;
  centerSpinner.flashTime = 0;
  for (const post of playfieldPosts) post.flashTime = 0;
  particles = [];
  resetBall();
  if (startScreen) startScreen.classList.remove('active');
  gameOverScreen?.classList.remove('active');
  closeMenu();
  updateUI();
}

// Keyboard input setup
function initInputs() {
  const blockNativeMenu = (e) => e.preventDefault();
  window.addEventListener('contextmenu', blockNativeMenu, { capture: true });
  document.addEventListener('contextmenu', blockNativeMenu, { capture: true });
  document.addEventListener('selectstart', blockNativeMenu, { capture: true });
  document.addEventListener('dragstart', blockNativeMenu, { capture: true });
  window.addEventListener('gesturestart', preventBrowserGesture, { passive: false });
  window.addEventListener('gesturechange', preventBrowserGesture, { passive: false });
  window.addEventListener('gestureend', preventBrowserGesture, { passive: false });
  window.addEventListener('touchmove', preventMultiTouchZoom, { passive: false });
  window.addEventListener('touchend', preventDoubleTapZoom, { passive: false });

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (controlledKeys.has(key) || controlledKeys.has(e.key)) {
      e.preventDefault();
    }
    
    // Resume context on first keypress
    audio.resume();

    if (e.key === ' ') {
      setPlungerInput(true);
    } else {
      keys[key] = true;
    }

    // Flipper sound on press
    if (key === 'a' || key === 'arrowleft') setFlipperInput('left', true);
    if (key === 'l' || key === 'arrowright') setFlipperInput('right', true);

    // Music toggle
    if (key === 'm') {
      toggleMusic();
    }

    // Reset / Start
    if (key === 'r') {
      startGame();
    }
    
    // Tilt action (shake)
    if (key === 't' && state.gameState === 'PLAYING' && !state.isTilted) {
      triggerTilt();
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (controlledKeys.has(key) || controlledKeys.has(e.key)) {
      e.preventDefault();
    }
    if (e.key === ' ') {
      setPlungerInput(false);
    } else {
      keys[key] = false;
    }

    if (key === 'a' || key === 'arrowleft') setFlipperInput('left', false);
    if (key === 'l' || key === 'arrowright') setFlipperInput('right', false);
  });
}

function preventBrowserGesture(e) {
  e.preventDefault();
}

function preventMultiTouchZoom(e) {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}

function preventDoubleTapZoom(e) {
  const now = Date.now();
  if (now - lastTouchEndTime < 320) {
    e.preventDefault();
  }
  lastTouchEndTime = now;
}

function setFlipperInput(side, isPressed) {
  const flipper = flippers[side];
  const keyName = side === 'left' ? 'a' : 'l';
  keys[keyName] = isPressed;

  if (isPressed && flipper.state !== 'up') {
    flipper.state = 'up';
    audio.playFlipper();
  } else if (!isPressed) {
    flipper.state = 'down';
  }
}

function setPlungerInput(isPressed) {
  keys.space = isPressed;
}

function initTouchControls() {
  bindHoldZone(document.getElementById('touch-left-flipper'), () => setFlipperInput('left', true), () => setFlipperInput('left', false));
  bindHoldZone(document.getElementById('touch-right-flipper'), () => setFlipperInput('right', true), () => setFlipperInput('right', false));
  bindPlungerZone(document.getElementById('touch-plunger'));
}

function bindHoldZone(element, onPress, onRelease) {
  if (!element) return;

  element.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    element.setPointerCapture?.(e.pointerId);
    element.classList.add('is-pressed');
    audio.resume();
    onPress();
  });

  const release = (e) => {
    e.preventDefault();
    element.classList.remove('is-pressed');
    onRelease();
  };

  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', () => {
    element.classList.remove('is-pressed');
    onRelease();
  });
}

function bindPlungerZone(element) {
  if (!element) return;

  let pointerActive = false;

  const suppressTouchCallout = (e) => e.preventDefault();
  element.addEventListener('touchstart', suppressTouchCallout, { passive: false });
  element.addEventListener('touchmove', suppressTouchCallout, { passive: false });
  element.addEventListener('touchend', suppressTouchCallout, { passive: false });

  element.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointerActive = true;
    element.setPointerCapture?.(e.pointerId);
    element.classList.add('is-pressed');
    audio.resume();
    setPlungerInput(true);
  });

  const release = (e) => {
    if (!pointerActive) return;
    e.preventDefault();
    pointerActive = false;
    element.classList.remove('is-pressed');
    setPlungerInput(false);
  };

  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', () => {
    pointerActive = false;
    element.classList.remove('is-pressed');
    setPlungerInput(false);
  });
}

function initUIControls() {
  startScreen = document.getElementById('start-screen');
  gameOverScreen = document.getElementById('gameover-screen');
  settingsPanel = document.getElementById('settings-panel');
  menuToggle = document.getElementById('menu-toggle');
  musicToggle = document.getElementById('music-toggle');
  scorePanel = document.getElementById('score-panel');
  plungerPowerIndicator = document.getElementById('plunger-power');

  document.getElementById('start-btn')?.addEventListener('click', () => {
    audio.resume();
    startGame();
    const startMusic = document.getElementById('start-music');
    if (startMusic?.checked && !audio.musicEnabled) {
      toggleMusic();
    } else {
      syncMusicButton();
    }
  });

  document.getElementById('reset-btn')?.addEventListener('click', () => {
    audio.resume();
    startGame();
  });

  document.getElementById('gameover-restart-btn')?.addEventListener('click', () => {
    audio.resume();
    startGame();
  });

  musicToggle?.addEventListener('click', () => toggleMusic());
  menuToggle?.addEventListener('click', () => toggleMenu());
  document.getElementById('menu-close')?.addEventListener('click', () => closeMenu());
}

function toggleMenu() {
  if (!settingsPanel) return;
  const isOpen = settingsPanel.classList.toggle('open');
  settingsPanel.setAttribute('aria-hidden', String(!isOpen));
  menuToggle?.setAttribute('aria-expanded', String(isOpen));
}

function closeMenu() {
  settingsPanel?.classList.remove('open');
  settingsPanel?.setAttribute('aria-hidden', 'true');
  menuToggle?.setAttribute('aria-expanded', 'false');
}

function toggleMusic() {
  const isPlaying = audio.toggleMusic();
  syncMusicButton(isPlaying);
}

function syncMusicButton(isPlaying = audio.musicEnabled) {
  if (!musicToggle) return;
  musicToggle.textContent = isPlaying ? 'Music On' : 'Music Off';
  musicToggle.classList.toggle('active', isPlaying);
}

function triggerTilt() {
  state.tiltCount++;
  
  // Add mild random velocity to ball if active
  if (ball.active) {
    ball.vel.x += (Math.random() * 200 - 100);
    ball.vel.y += (Math.random() * 200 - 100);
  }

  // Visual shake
  canvas.classList.add('shake');
  setTimeout(() => canvas.classList.remove('shake'), 200);

  if (state.tiltCount >= 3) {
    state.isTilted = true;
    state.activeBandMode = 'TILT!';
    audio.playDrain();
    updateUI();
  }
}

// UI display updates
function updateUI() {
  const scoreVal = document.getElementById('score-val');
  const scoreboardBallsVal = document.getElementById('scoreboard-balls-val');
  const hudMultiplierVal = document.getElementById('hud-multiplier-val');
  const hudModeVal = document.getElementById('hud-mode-val');
  const highVal = document.getElementById('high-val');
  const multiplierVal = document.getElementById('multiplier-val');
  const difficultyVal = document.getElementById('difficulty-val');
  if (scoreVal) scoreVal.textContent = state.score.toLocaleString();
  if (scoreboardBallsVal) scoreboardBallsVal.textContent = String(state.balls);
  if (hudMultiplierVal) hudMultiplierVal.textContent = `${state.multiplier}x`;
  if (hudModeVal) hudModeVal.textContent = state.isTilted ? 'TILT' : state.activeBandMode === 'NONE' ? 'READY' : state.activeBandMode;
  if (highVal) highVal.textContent = state.highScore.toLocaleString();
  if (multiplierVal) multiplierVal.textContent = `${state.multiplier}x`;
  if (difficultyVal) difficultyVal.textContent = difficultySettings[state.difficulty].label;

  updateObjectiveHUD();
  
  // Balls indicator (guitar icons or text)
  const ballsContainer = document.getElementById('balls-indicator');
  if (ballsContainer) {
    ballsContainer.innerHTML = '';
    for (let i = 0; i < state.maxBalls; i++) {
      const git = document.createElement('span');
      git.className = `guitar-icon ${i < state.balls ? 'active' : 'spent'}`;
      git.textContent = '🎸';
      ballsContainer.appendChild(git);
    }
  }

  // Update Band statuses
  const statusLabels = {
    nirvana: document.getElementById('nirvana-status'),
    gnr: document.getElementById('gnr-status'),
    rage: document.getElementById('rage-status')
  };

  for (const band in statusLabels) {
    if (statusLabels[band]) {
      const hits = state.bandHits[band];
      if (hits >= 5) {
        statusLabels[band].innerHTML = `<span class="active-badge glow-${band}">LIT</span> ${band.toUpperCase()}`;
        statusLabels[band].classList.add('lit');
      } else {
        statusLabels[band].innerHTML = `<span class="inactive-badge">[${hits}/5]</span> ${band.toUpperCase()}`;
        statusLabels[band].classList.remove('lit');
      }
    }
  }

  // Active status box
  const mainModeBox = document.getElementById('mode-text');
  if (mainModeBox) {
    if (state.isTilted) {
      mainModeBox.textContent = '!!! TILT !!!';
      mainModeBox.className = 'tilt-blink';
    } else if (state.activeBandMode !== 'NONE') {
      mainModeBox.textContent = `${state.activeBandMode} MODE ACTIVE!`;
      mainModeBox.className = `mode-blink glow-${state.activeBandMode.toLowerCase()}`;
    } else {
      mainModeBox.textContent = 'READY TO ROCK';
      mainModeBox.className = '';
    }
  }
}

function getNextObjective() {
  const activeTargets = dropTargets.filter((target) => target.active).length;
  if (activeTargets < dropTargets.length) {
    return `Derriba los targets · faltan ${activeTargets}`;
  }

  const litLanes = rolloverLanes.filter((lane) => lane.lit).length;
  if (litLanes > 0) {
    return `Completa ROCK · ${litLanes}/${rolloverLanes.length}`;
  }

  const pendingBand = bumpers
    .filter((bumper) => state.bandHits[bumper.id] < 5)
    .sort((a, b) => state.bandHits[b.id] - state.bandHits[a.id])[0];

  if (pendingBand) {
    const remaining = 5 - state.bandHits[pendingBand.id];
    return `Golpea ${pendingBand.label} · faltan ${remaining}`;
  }

  return `Completa ROCK · 0/${rolloverLanes.length}`;
}

function updateObjectiveHUD() {
  const objectiveText = document.getElementById('objective-text');
  const comboBadge = document.getElementById('combo-badge');
  if (objectiveText) objectiveText.textContent = getNextObjective();
  if (comboBadge) {
    comboBadge.textContent = `COMBO x${state.comboMultiplier.toFixed(1)}`;
    comboBadge.classList.toggle('is-active', state.comboCount > 1);
    const remaining = state.comboExpiresAt
      ? Math.max(0, Math.min(1, (state.comboExpiresAt - performance.now()) / COMBO_WINDOW_MS))
      : 0;
    comboBadge.style.setProperty('--combo-remaining', remaining.toFixed(3));
  }
}

function resetCombo() {
  state.comboCount = 0;
  state.comboMultiplier = 1;
  state.comboExpiresAt = 0;
}

function advanceCombo() {
  const now = performance.now();
  state.comboCount = now <= state.comboExpiresAt ? state.comboCount + 1 : 1;
  state.comboMultiplier = Math.min(3, 1 + Math.floor(state.comboCount / 3) * 0.5);
  state.comboExpiresAt = now + COMBO_WINDOW_MS;
}

function updateComboTimer() {
  if (state.comboCount > 0 && performance.now() > state.comboExpiresAt) {
    resetCombo();
    updateObjectiveHUD();
  }
}

function updatePlungerPowerIndicator() {
  if (!plungerPowerIndicator) return;

  const charge = Math.max(0, Math.min(1, plunger.compression / plunger.maxCompression));
  const percentage = Math.round(charge * 100);
  plungerPowerIndicator.style.setProperty('--power-level', charge.toFixed(3));
  plungerPowerIndicator.classList.toggle('is-charging', keys.space && !ball.active);
  plungerPowerIndicator.classList.toggle('is-hidden', ball.active);
  plungerPowerIndicator.setAttribute('aria-valuenow', String(percentage));

  const value = plungerPowerIndicator.querySelector('.plunger-power-value');
  if (value) value.textContent = `${percentage}%`;
}

// Add Score and handle achievements
function addScore(points, label = 'HIT', buildsCombo = true) {
  if (state.isTilted || state.gameState !== 'PLAYING') return;
  if (buildsCombo) advanceCombo();
  const awardedPoints = Math.round(points * state.multiplier * state.comboMultiplier);
  state.score += awardedPoints;
  
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem('rock_pinball_highscore', state.highScore.toString());
  }
  updateUI();
  showScorePanel(awardedPoints, label);
}

function showScorePanel(points, label) {
  const lastScoreVal = document.getElementById('last-score-val');
  if (lastScoreVal) lastScoreVal.textContent = `${label} +${points.toLocaleString()}`;
  if (!scorePanel) return;

  scorePanel.classList.add('is-expanded');
  scorePanel.setAttribute('aria-expanded', 'true');
  window.clearTimeout(scoreCollapseTimer);
  scoreCollapseTimer = window.setTimeout(() => {
    scorePanel.classList.remove('is-expanded');
    scorePanel.setAttribute('aria-expanded', 'false');
  }, 1800);
}

// Physics Sub-Step Update
function updatePhysics(sub_dt) {
  if (state.gameState !== 'PLAYING') return;

  // 1. Update flippers angle & angular velocity (omega)
  // Left Flipper
  const leftF = flippers.left;
  if (!state.isTilted && (keys['a'] || keys['arrowleft'])) {
    if (leftF.angle > leftF.minAngle) {
      leftF.angle = Math.max(leftF.minAngle, leftF.angle - leftF.speed * sub_dt);
      leftF.omega = -leftF.speed;
    } else {
      leftF.omega = 0;
    }
  } else {
    if (leftF.angle < leftF.maxAngle) {
      leftF.angle = Math.min(leftF.maxAngle, leftF.angle + leftF.restSpeed * sub_dt);
      leftF.omega = leftF.restSpeed;
    } else {
      leftF.omega = 0;
    }
  }

  // Right Flipper
  const rightF = flippers.right;
  if (!state.isTilted && (keys['l'] || keys['arrowright'])) {
    if (rightF.angle < rightF.maxAngle) {
      rightF.angle = Math.min(rightF.maxAngle, rightF.angle + rightF.speed * sub_dt);
      rightF.omega = rightF.speed;
    } else {
      rightF.omega = 0;
    }
  } else {
    if (rightF.angle > rightF.minAngle) {
      rightF.angle = Math.max(rightF.minAngle, rightF.angle - rightF.restSpeed * sub_dt);
      rightF.omega = -rightF.restSpeed;
    } else {
      rightF.omega = 0;
    }
  }

  // 2. Plunger charge
  if (keys['space'] && !ball.active) {
    const compressionPerSecond = plunger.maxCompression / plunger.chargeDuration;
    plunger.compression = Math.min(
      plunger.maxCompression,
      plunger.compression + compressionPerSecond * sub_dt
    );
    // Play hum modulated by compression
    if (Math.random() < 0.25) {
      audio.playPlungerHum(plunger.compression / plunger.maxCompression);
    }
  } else {
    // Release plunger
    if (plunger.compression > 0) {
      if (!ball.active && ball.pos.x > 450) {
        const charge = plunger.compression / plunger.maxCompression;
        const launchSpeed = plunger.minLaunchSpeed
          + charge * (plunger.maxLaunchSpeed - plunger.minLaunchSpeed);
        ball.vel.y = -launchSpeed;
        // Keep launches centered in the plunger lane. Lateral movement should
        // come from the top arch and table collisions, never random deviation.
        ball.vel.x = 0;
        ball.active = true;
        audio.playLaunch();
      }
      plunger.compression = Math.max(0, plunger.compression - 200 * sub_dt);
    }
  }

  // 3. Ball movement & collisions
  if (ball.onRamp) {
    // Move ball along pre-defined ramp spline path
    ball.rampProgress += ball.rampSpeed * 60 * sub_dt;
    if (ball.rampProgress >= 1.0) {
      // Exit ramp
      ball.onRamp = false;
      ball.rampProgress = 0;
      // Drop onto top layout
      const exitPos = rampPath[rampPath.length - 1];
      ball.pos = Vec.clone(exitPos);
      ball.vel = Vec.create(150, 100); // Shoot out rightwards/downwards
      audio.playRamp();
      addScore(5000, 'RAMPA');
    } else {
      // Interpolate along path
      const pathLength = rampPath.length;
      const idx = Math.floor(ball.rampProgress * (pathLength - 1));
      const nextIdx = Math.min(pathLength - 1, idx + 1);
      const segmentT = (ball.rampProgress * (pathLength - 1)) - idx;
      
      const p1 = rampPath[idx];
      const p2 = rampPath[nextIdx];
      
      ball.pos.x = p1.x + (p2.x - p1.x) * segmentT;
      ball.pos.y = p1.y + (p2.y - p1.y) * segmentT;
      ball.vel = Vec.create(0, 0); // No velocity while captured
    }
    return;
  }

  // Normal physical movement
  if (ball.active) {
    // Apply gravity
    ball.vel.y += difficultySettings[state.difficulty].gravity * sub_dt;
    // Air resistance
    ball.vel = Vec.mult(ball.vel, Math.exp(-PHYSICS_TUNING.airDrag * sub_dt));

    // Speed clamp (safety)
    const speed = Vec.mag(ball.vel);
    if (speed > PHYSICS_TUNING.maxBallSpeed) {
      ball.vel = Vec.mult(Vec.normalize(ball.vel), PHYSICS_TUNING.maxBallSpeed);
    }

    // Automatic ball search: real machines pulse coils when a ball rests in
    // a dead spot. Here we relaunch it toward center after a short timeout.
    if (speed < 70 && ball.pos.y < HEIGHT - 45) {
      ball.stuckTime += sub_dt;
    } else if (speed > 110) {
      ball.stuckTime = 0;
    }
    if (ball.stuckTime >= 2.4) {
      const centerPull = Math.max(-260, Math.min(260, (WIDTH / 2 - ball.pos.x) * 1.4));
      ball.vel = Vec.create(centerPull, -720);
      ball.pos.y -= 8;
      ball.stuckTime = 0;
      spawnParticles(ball.pos.x, ball.pos.y, '#FFFFFF', 10);
      audio.playSlingshot();
    }

    // The rear side of either lower slingshot can form a narrow mechanical
    // pocket with its guide rail. A ball may keep jittering there forever, so
    // speed-only ball search never fires. Detect those two exact cavities and
    // pulse the ball toward the open center after a short grace period.
    const pocketTop = lowerY(515);
    const pocketBottom = lowerY(735);
    const inLeftSlingPocket = ball.pos.x < 190
      && ball.pos.y > pocketTop && ball.pos.y < pocketBottom;
    const inRightSlingPocket = ball.pos.x > 280
      && ball.pos.y > pocketTop && ball.pos.y < pocketBottom;
    if (inLeftSlingPocket || inRightSlingPocket) {
      ball.pocketTime += sub_dt;
    } else {
      ball.pocketTime = 0;
    }
    if (ball.pocketTime >= 0.75) {
      // Move outside the nearby collision surfaces first. A velocity-only
      // pulse can be cancelled immediately by the same rail that trapped it.
      ball.pos = Vec.create(WIDTH / 2, lowerY(500));
      ball.vel = Vec.create(inLeftSlingPocket ? 120 : -120, -680);
      ball.pocketTime = 0;
      ball.stuckTime = 0;
      spawnParticles(ball.pos.x, ball.pos.y, '#FF6A00', 12);
      audio.playSlingshot();
    }

    // Update position
    ball.pos = Vec.add(ball.pos, Vec.mult(ball.vel, sub_dt));

    // Last-resort containment for very fast shots. The physical walls remain
    // the primary collision surface, but a ball can never disappear offscreen.
    const safetyInset = 26;
    const minBallX = safetyInset + ball.radius;
    const maxBallX = WIDTH - safetyInset - ball.radius;
    if (ball.pos.x < minBallX) {
      ball.pos.x = minBallX;
      ball.vel.x = Math.abs(ball.vel.x) * 0.72;
    } else if (ball.pos.x > maxBallX) {
      ball.pos.x = maxBallX;
      ball.vel.x = -Math.abs(ball.vel.x) * 0.72;
    }
    if (ball.pos.y < safetyInset + ball.radius) {
      ball.pos.y = safetyInset + ball.radius;
      ball.vel.y = Math.abs(ball.vel.y) * 0.72;
    }

    // A. Check wall collisions
    for (const wall of walls) {
      const col = checkSegmentCollision(ball, wall);
      if (col) {
        resolveCollision(ball, col, wall.restitution, wall.friction);
      }
    }

    // B. Plunger return check (replaces old gate, resets ball to plunger if it rolls back)
    if (ball.active && ball.pos.x > 440 && ball.pos.y > lowerY(750) && ball.vel.y > 0) {
      resetBall();
    }

    // C. Bumper collisions
    for (const bumper of bumpers) {
      const col = checkCircleCollision(ball, bumper);
      if (col) {
        const hit = resolveCollision(
          ball,
          col,
          PHYSICS_TUNING.bumperRestitution,
          PHYSICS_TUNING.bumperFriction,
          null,
          true,
          false
        );
        if (hit) {
          bumper.flashTime = 12; // number of frames to flash
          spawnParticles(col.point.x, col.point.y, bumper.color);
          
          // Trigger audio
          let bumperIdx = 1;
          if (bumper.id === 'gnr') bumperIdx = 2;
          if (bumper.id === 'rage') bumperIdx = 3;
          audio.playBumper(bumperIdx);

          // Update game state
          addScore(bumper.points || 1000, bumper.id in state.bandHits ? 'BANDA' : bumper.label);

          if (bumper.id in state.bandHits) {
            state.bandHits[bumper.id]++;

            // Trigger Band Mode if hitting a band bumper 5 times
            if (state.bandHits[bumper.id] === 5) {
              state.activeBandMode = bumper.label;
              state.multiplier += 1;
              addScore(15000, 'MODO', false);
            }
          }
          updateUI();
        }
      }
    }

    // Illuminated metal posts add real deflection points around the lanes.
    for (const post of playfieldPosts) {
      const col = checkCircleCollision(ball, post);
      if (!col) continue;
      const hit = resolveCollision(ball, col, 0.72, 0.08);
      if (hit) {
        post.flashTime = 10;
        spawnParticles(col.point.x, col.point.y, post.color, 4);
        audio.playSlingshot();
        addScore(250, 'POSTE');
      }
    }

    // D. Slingshot collisions
    for (const sling of slingshots) {
      const col = checkSegmentCollision(ball, sling);
      if (col) {
        // Only the visible front face is active. Without this check, contact
        // from behind could kick the ball further into the slingshot.
        const isFrontFace = Vec.dot(col.normal, sling.normal) >= PHYSICS_TUNING.slingshotFacingThreshold;
        const velAlongNormal = Vec.dot(ball.vel, sling.normal);
        if (isFrontFace && velAlongNormal < 0) {
          const hit = resolveCollision(ball, col, sling.restitution, sling.friction, null, false, true);
          if (hit) {
            sling.flashTime = 12;
            spawnParticles(col.point.x, col.point.y, '#FFFFFF', 8);
            audio.playSlingshot();
            addScore(500, 'SLING');
          }
        }
      }
    }

    // E. Center spinner
    centerSpinner.cooldown = Math.max(0, centerSpinner.cooldown - sub_dt);
    const spinnerCol = checkSegmentCollision(ball, centerSpinner, 4);
    if (spinnerCol) {
      const hit = resolveCollision(
        ball,
        spinnerCol,
        centerSpinner.restitution,
        centerSpinner.friction
      );
      if (hit && centerSpinner.cooldown === 0) {
        centerSpinner.flashTime = 12;
        centerSpinner.cooldown = 0.18;
        spawnParticles(spinnerCol.point.x, spinnerCol.point.y, '#FF3B30', 7);
        audio.playRollover();
        addScore(1500, 'SPINNER');
      }
    }

    // F. Drop Targets collisions
    for (const target of dropTargets) {
      if (!target.active) continue;
      const col = checkSegmentCollision(ball, target, 4); // target thickness
      if (col) {
        target.active = false;
        target.flashTime = 15;
        spawnParticles(col.point.x, col.point.y, target.color, 10);
        audio.playTarget();
        addScore(2500, 'TARGET');

        // Check if all targets are down
        const allDown = dropTargets.every(t => !t.active);
        if (allDown) {
          addScore(20000, 'TARGETS', false);
          // Spawn extra particles and reset drop targets
          scheduleTimer(() => {
            for (const t of dropTargets) {
              t.active = true;
              t.flashTime = 10;
            }
            audio.playRollover();
          }, 1500);
        }
      }
    }

    // G. Flipper collisions
    // Left Flipper
    const leftCol = checkSegmentCollision(ball, getFlipperSegment(leftF), leftF.radius);
    if (leftCol) {
      // Calculate contact point linear velocity: v_f = omega x r_perp
      const rVec = Vec.sub(leftCol.point, leftF.pivot);
      const flipperVel = Vec.create(-leftF.omega * rVec.y, leftF.omega * rVec.x);
      resolveCollision(
        ball,
        leftCol,
        PHYSICS_TUNING.flipperRestitution,
        PHYSICS_TUNING.flipperFriction,
        flipperVel
      );
    }

    // Right Flipper
    const rightCol = checkSegmentCollision(ball, getFlipperSegment(rightF), rightF.radius);
    if (rightCol) {
      const rVec = Vec.sub(rightCol.point, rightF.pivot);
      const flipperVel = Vec.create(-rightF.omega * rVec.y, rightF.omega * rVec.x);
      resolveCollision(
        ball,
        rightCol,
        PHYSICS_TUNING.flipperRestitution,
        PHYSICS_TUNING.flipperFriction,
        flipperVel
      );
    }

    // H. Rollover Lanes trigger
    for (const lane of rolloverLanes) {
      if (ball.pos.y >= lane.y - 12 && ball.pos.y <= lane.y + 12) {
        if (ball.pos.x >= lane.x1 && ball.pos.x <= lane.x2 && !lane.lit) {
          lane.lit = true;
          audio.playRollover();
          addScore(3000, 'LANE');
          
          // Check if all ROCK lanes are lit
          const allLit = rolloverLanes.every(l => l.lit);
          if (allLit) {
            state.multiplier += 1;
            addScore(25000, 'ROCK', false);
            // Reset lanes after a delay
            scheduleTimer(() => {
              for (const l of rolloverLanes) l.lit = false;
            }, 1000);
          }
          updateUI();
        }
      }
    }

    // I. Ramp entrance trigger
    if (ball.pos.x >= rampEntrance.x && ball.pos.x <= rampEntrance.x + rampEntrance.width &&
        ball.pos.y >= rampEntrance.y && ball.pos.y <= rampEntrance.y + rampEntrance.height) {
      // Ball must have upward speed
      if (ball.vel.y < -150) {
        ball.onRamp = true;
        ball.rampProgress = 0;
      }
    }

    // J. Drain check
    if (ball.pos.y > HEIGHT + 20) {
      ball.active = false;
      state.balls--;
      resetCombo();
      audio.playDrain();
      updateUI();

      if (state.balls > 0) {
        resetBall();
        state.isTilted = false;
        state.tiltCount = 0;
      } else {
        state.gameState = 'GAMEOVER';
        const finalScore = document.getElementById('gameover-score');
        if (finalScore) finalScore.textContent = state.score.toLocaleString();
        gameOverScreen?.classList.add('active');
      }
    }
  }
}

// Get the actual line segment representing a flipper
function getFlipperSegment(flipper) {
  return {
    p1: flipper.pivot,
    p2: Vec.create(
      flipper.pivot.x + flipper.length * Math.cos(flipper.angle),
      flipper.pivot.y + flipper.length * Math.sin(flipper.angle)
    )
  };
}

// Particles rendering and updating
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.alpha -= p.decay;
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }
}

// Draw a flipper (glowing capsule/rod)
function drawFlipper(flipper) {
  const seg = getFlipperSegment(flipper);
  const color = flipper.isLeft ? '#FF3B30' : '#B80F0A';
  const bodyGradient = ctx.createLinearGradient(seg.p1.x, seg.p1.y - 10, seg.p1.x, seg.p1.y + 10);
  bodyGradient.addColorStop(0, '#FFFFFF');
  bodyGradient.addColorStop(0.22, color);
  bodyGradient.addColorStop(0.7, color);
  bodyGradient.addColorStop(1, '#17171D');
  
  ctx.save();
  ctx.lineCap = 'round';

  // Neon underglow projected onto the playfield.
  ctx.globalAlpha = 0.42;
  ctx.shadowBlur = 26;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = flipper.radius * 2 + 12;
  ctx.beginPath();
  ctx.moveTo(seg.p1.x, seg.p1.y + 3);
  ctx.lineTo(seg.p2.x, seg.p2.y + 3);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Raised contact shadow
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.lineWidth = flipper.radius * 2 + 5;
  ctx.beginPath();
  ctx.moveTo(seg.p1.x + 2, seg.p1.y + 5);
  ctx.lineTo(seg.p2.x + 2, seg.p2.y + 5);
  ctx.stroke();

  // Chrome rim and dimensional body
  ctx.shadowBlur = 12;
  ctx.shadowColor = color;
  ctx.strokeStyle = '#D8D8DE';
  ctx.lineWidth = flipper.radius * 2 + 2;
  ctx.beginPath();
  ctx.moveTo(seg.p1.x, seg.p1.y);
  ctx.lineTo(seg.p2.x, seg.p2.y);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = bodyGradient;
  ctx.lineWidth = flipper.radius * 2 - 2;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(seg.p1.x, seg.p1.y - 3);
  ctx.lineTo(seg.p2.x, seg.p2.y - 3);
  ctx.stroke();

  // Pivot cap
  const pivotGradient = ctx.createRadialGradient(seg.p1.x - 3, seg.p1.y - 3, 1, seg.p1.x, seg.p1.y, flipper.radius + 3);
  pivotGradient.addColorStop(0, '#FFFFFF');
  pivotGradient.addColorStop(0.45, '#A9A9B2');
  pivotGradient.addColorStop(1, '#24242A');
  ctx.fillStyle = pivotGradient;
  ctx.beginPath();
  ctx.arc(seg.p1.x, seg.p1.y, flipper.radius + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw static boundary lines
function drawWalls() {
  ctx.save();

  for (const wall of walls) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(wall.p1.x + 2, wall.p1.y + 3);
    ctx.lineTo(wall.p2.x + 2, wall.p2.y + 3);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(190, 198, 214, 0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(wall.p1.x, wall.p1.y);
    ctx.lineTo(wall.p2.x, wall.p2.y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.56)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawCoverImage(image, x, y, width, height) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;

  if (imageRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    sh = image.naturalWidth / targetRatio;
    sy = (image.naturalHeight - sh) / 2;
  }

  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function drawPlayfieldLighting() {
  const lightPools = [
    { x: 235, y: 250, radius: 105, color: '255, 59, 48' },
    { x: 150, y: 360, radius: 88, color: '255, 59, 48' },
    { x: 320, y: 360, radius: 88, color: '184, 15, 10' },
    { x: 230, y: lowerY(675), radius: 150, color: '255, 45, 32' },
    { x: 235, y: 470, radius: 125, color: '255, 45, 32' },
  ];

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const light of lightPools) {
    const glow = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
    glow.addColorStop(0, `rgba(${light.color}, 0.1)`);
    glow.addColorStop(0.45, `rgba(${light.color}, 0.035)`);
    glow.addColorStop(1, `rgba(${light.color}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
  }

  for (const bumper of bumpers) {
    const radius = bumper.radius * 2.7;
    const glow = ctx.createRadialGradient(bumper.pos.x, bumper.pos.y, 0, bumper.pos.x, bumper.pos.y, radius);
    glow.addColorStop(0, bumper.color);
    glow.addColorStop(0.22, bumper.color);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = bumper.flashTime > 0 ? 0.24 : 0.09;
    ctx.fillStyle = glow;
    ctx.fillRect(bumper.pos.x - radius, bumper.pos.y - radius, radius * 2, radius * 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.46, WIDTH * 0.22, WIDTH / 2, HEIGHT * 0.48, HEIGHT * 0.72);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.72, 'rgba(0, 0, 0, 0.08)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.54)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawTableLabel(text, x, y, color = '#FFFFFF', align = 'center') {
  ctx.save();
  ctx.font = '700 9px "Orbitron", sans-serif';
  ctx.textAlign = align;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillText(text, x + 1, y + 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.72;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawHitSpark(x, y, color, intensity = 1) {
  const rotation = performance.now() * 0.004;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = color;
  ctx.shadowBlur = 14 * intensity;
  ctx.shadowColor = color;
  ctx.lineCap = 'round';

  for (let i = 0; i < 8; i++) {
    const length = (i % 2 === 0 ? 18 : 10) * intensity;
    ctx.rotate(Math.PI / 4);
    ctx.globalAlpha = i % 2 === 0 ? 0.9 : 0.55;
    ctx.lineWidth = i % 2 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(6 + length, 0);
    ctx.stroke();
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.arc(0, 0, 2.4 * intensity, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCabinetFrame() {
  const railWidth = 27;
  const topRailHeight = 23;
  const bottomRailHeight = 30;

  ctx.save();

  // Deep shadows make the playfield appear recessed below the cabinet rails.
  ctx.shadowBlur = 22;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.fillStyle = '#050506';
  ctx.fillRect(0, 0, railWidth + 4, HEIGHT);
  ctx.fillRect(WIDTH - railWidth - 4, 0, railWidth + 4, HEIGHT);
  ctx.fillRect(0, 0, WIDTH, topRailHeight + 3);
  ctx.fillRect(0, HEIGHT - bottomRailHeight - 3, WIDTH, bottomRailHeight + 3);
  ctx.shadowBlur = 0;

  const leftMetal = ctx.createLinearGradient(0, 0, railWidth, 0);
  leftMetal.addColorStop(0, '#050506');
  leftMetal.addColorStop(0.22, '#34343A');
  leftMetal.addColorStop(0.46, '#111115');
  leftMetal.addColorStop(0.7, '#777780');
  leftMetal.addColorStop(0.84, '#202026');
  leftMetal.addColorStop(1, '#030304');
  ctx.fillStyle = leftMetal;
  ctx.fillRect(0, 0, railWidth, HEIGHT);

  const rightMetal = ctx.createLinearGradient(WIDTH - railWidth, 0, WIDTH, 0);
  rightMetal.addColorStop(0, '#030304');
  rightMetal.addColorStop(0.16, '#202026');
  rightMetal.addColorStop(0.3, '#777780');
  rightMetal.addColorStop(0.54, '#111115');
  rightMetal.addColorStop(0.78, '#34343A');
  rightMetal.addColorStop(1, '#050506');
  ctx.fillStyle = rightMetal;
  ctx.fillRect(WIDTH - railWidth, 0, railWidth, HEIGHT);

  const horizontalMetal = ctx.createLinearGradient(0, 0, 0, topRailHeight);
  horizontalMetal.addColorStop(0, '#070709');
  horizontalMetal.addColorStop(0.38, '#777780');
  horizontalMetal.addColorStop(0.58, '#1A1A20');
  horizontalMetal.addColorStop(1, '#030304');
  ctx.fillStyle = horizontalMetal;
  ctx.fillRect(0, 0, WIDTH, topRailHeight);
  ctx.save();
  ctx.translate(0, HEIGHT);
  ctx.scale(1, -1);
  ctx.fillRect(0, 0, WIDTH, bottomRailHeight);
  ctx.restore();

  // Recessed screws spaced around both side rails.
  for (let y = 42; y < HEIGHT - 34; y += 118) {
    for (const x of [railWidth / 2, WIDTH - railWidth / 2]) {
      const screw = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 5);
      screw.addColorStop(0, '#FFFFFF');
      screw.addColorStop(0.3, '#8B8B94');
      screw.addColorStop(0.72, '#25252B');
      screw.addColorStop(1, '#050507');
      ctx.fillStyle = screw;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 2.5, y);
      ctx.lineTo(x + 2.5, y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// Draw the entire scene
function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // 1. Draw Background texture
  if (bgImage.complete && bgImage.naturalWidth !== 0) {
    drawCoverImage(bgImage, 0, 0, WIDTH, HEIGHT);
  } else {
    // Fallback retro style background
    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    // Grid lines
    ctx.strokeStyle = 'rgba(255, 0, 128, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < HEIGHT; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
    }
  }

  // Draw semi-dark overlay to make neon stand out
  ctx.fillStyle = 'rgba(8, 8, 10, 0.38)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawPlayfieldLighting();

  // 2. Draw static walls & plunger lane boundaries
  drawWalls();

  // 3. Plunger Gate (removed)

  // 4. Draw Rollover lanes
  for (const lane of rolloverLanes) {
    ctx.save();
    const midX = (lane.x1 + lane.x2) / 2;
    ctx.shadowBlur = lane.lit ? 15 : 0;
    ctx.shadowColor = lane.color;
    ctx.fillStyle = lane.lit ? lane.color : 'rgba(255, 255, 255, 0.15)';
    
    // Draw letters
    ctx.font = 'bold 20px "Orbitron", "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lane.label, midX, lane.y - 15);

    // Raised rollover wire with contact shadow and chrome highlight
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(lane.x1 + 4, lane.y + 3);
    ctx.lineTo(lane.x2 - 4, lane.y + 3);
    ctx.stroke();

    ctx.strokeStyle = lane.lit ? lane.color : '#A8ADB8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lane.x1 + 4, lane.y);
    ctx.lineTo(lane.x2 - 4, lane.y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // 5. Draw Ramp outline
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Raised shadow below the acrylic ramp.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.lineWidth = 30;
  ctx.shadowBlur = 16;
  ctx.shadowColor = '#000000';
  ctx.beginPath();
  ctx.moveTo(rampPath[0].x, rampPath[0].y);
  for (let i = 1; i < rampPath.length; i++) {
    ctx.lineTo(rampPath[i].x, rampPath[i].y);
  }
  ctx.stroke();

  // Transparent acrylic bed with a red edge light.
  ctx.shadowBlur = 16;
  ctx.shadowColor = '#FF3B30';
  ctx.strokeStyle = 'rgba(255, 118, 108, 0.42)';
  ctx.lineWidth = 24;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(88, 10, 8, 0.48)';
  ctx.lineWidth = 17;
  ctx.stroke();

  // Twin chrome rails and a sharp glass reflection.
  ctx.shadowBlur = 5;
  ctx.shadowColor = '#FFFFFF';
  ctx.strokeStyle = '#DCE7ED';
  ctx.lineWidth = 3;
  for (const offsetX of [-9, 9]) {
    ctx.beginPath();
    ctx.moveTo(rampPath[0].x + offsetX, rampPath[0].y);
    for (let i = 1; i < rampPath.length; i++) {
      ctx.lineTo(rampPath[i].x + offsetX, rampPath[i].y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rampPath[0].x, rampPath[0].y);
  for (let i = 1; i < rampPath.length; i++) {
    ctx.lineTo(rampPath[i].x, rampPath[i].y);
  }
  ctx.stroke();
  ctx.restore();
  drawTableLabel('TOUR RAMP', 74, 372, '#FF3B30', 'left');

  // 6. Draw Drop Targets
  for (const target of dropTargets) {
    if (!target.active && target.flashTime <= 0) continue;
    
    ctx.save();
    ctx.shadowBlur = target.active ? 10 : 25;
    ctx.shadowColor = target.color;

    const width = target.p2.x - target.p1.x;
    const height = target.p2.y - target.p1.y;
    const faceGradient = ctx.createLinearGradient(target.p1.x, target.p1.y, target.p2.x, target.p2.y);
    faceGradient.addColorStop(0, '#FFFFFF');
    faceGradient.addColorStop(0.22, target.active ? target.color : '#FFFFFF');
    faceGradient.addColorStop(1, target.active ? '#3D004F' : '#77777F');

    // Extruded side and contact shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.fillRect(target.p1.x + 4, target.p1.y + 5, width, height);
    ctx.fillStyle = target.active ? '#4A075E' : '#55555C';
    ctx.beginPath();
    ctx.moveTo(target.p2.x, target.p1.y);
    ctx.lineTo(target.p2.x + 4, target.p1.y + 4);
    ctx.lineTo(target.p2.x + 4, target.p2.y + 4);
    ctx.lineTo(target.p2.x, target.p2.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = faceGradient;
    ctx.beginPath();
    ctx.rect(target.p1.x, target.p1.y, target.p2.x - target.p1.x, target.p2.y - target.p1.y);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = target.flashTime > 0 ? '#FFFFFF' : target.color;
    ctx.shadowBlur = target.flashTime > 0 ? 18 : 8;
    ctx.shadowColor = target.color;
    ctx.beginPath();
    ctx.arc(target.p1.x + width / 2, target.p1.y - 4, target.flashTime > 0 ? 2.7 : 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (target.flashTime > 0) {
      drawHitSpark(target.p1.x + width / 2, target.p1.y + height / 2, target.color, 0.65);
    }
    if (target.flashTime > 0) target.flashTime--;
  }
  drawTableLabel('POWER CHORDS', 28, 425, '#D31510', 'left');
  drawTableLabel('HELLFIRE', 422, 425, '#FF6961', 'right');

  // Raised illuminated posts, each one also participates in physics.
  for (const post of playfieldPosts) {
    ctx.save();
    const isFlashing = post.flashTime > 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#000000';
    ctx.beginPath();
    ctx.ellipse(post.pos.x + 3, post.pos.y + 5, post.radius + 4, post.radius * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    const postGradient = ctx.createRadialGradient(
      post.pos.x - 3,
      post.pos.y - 4,
      1,
      post.pos.x,
      post.pos.y,
      post.radius + 3
    );
    postGradient.addColorStop(0, '#FFFFFF');
    postGradient.addColorStop(0.3, isFlashing ? '#FFFFFF' : post.color);
    postGradient.addColorStop(0.62, '#4A4A52');
    postGradient.addColorStop(1, '#08080B');
    ctx.fillStyle = postGradient;
    ctx.strokeStyle = post.color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = isFlashing ? 22 : 10;
    ctx.shadowColor = post.color;
    ctx.beginPath();
    ctx.arc(post.pos.x, post.pos.y, post.radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (isFlashing) drawHitSpark(post.pos.x, post.pos.y, post.color, 0.55);
    if (post.flashTime > 0) post.flashTime--;
  }

  // Center spinner with a metal axle and illuminated insert.
  ctx.save();
  const spinnerFlash = centerSpinner.flashTime > 0;
  ctx.shadowBlur = spinnerFlash ? 20 : 8;
  ctx.shadowColor = '#FF3B30';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(centerSpinner.p1.x + 2, centerSpinner.p1.y + 4);
  ctx.lineTo(centerSpinner.p2.x + 2, centerSpinner.p2.y + 4);
  ctx.stroke();

  const spinnerGradient = ctx.createLinearGradient(centerSpinner.p1.x, 0, centerSpinner.p2.x, 0);
  spinnerGradient.addColorStop(0, '#3A3A42');
  spinnerGradient.addColorStop(0.2, '#FFFFFF');
  spinnerGradient.addColorStop(0.5, spinnerFlash ? '#FFFFFF' : '#FF3B30');
  spinnerGradient.addColorStop(0.8, '#FFFFFF');
  spinnerGradient.addColorStop(1, '#3A3A42');
  ctx.strokeStyle = spinnerGradient;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(centerSpinner.p1.x, centerSpinner.p1.y);
  ctx.lineTo(centerSpinner.p2.x, centerSpinner.p2.y);
  ctx.stroke();
  ctx.restore();
  drawTableLabel('RIFF SPINNER', 220, 520, '#FF8A80');
  if (centerSpinner.flashTime > 0) {
    drawHitSpark((centerSpinner.p1.x + centerSpinner.p2.x) / 2, centerSpinner.p1.y, '#FF3B30', 0.75);
  }
  if (centerSpinner.flashTime > 0) centerSpinner.flashTime--;

  // Physical-style multiplier inserts inspired by classic pinball tables.
  for (const insert of multiplierInserts) {
    const isLit = state.multiplier >= insert.value;
    ctx.save();
    ctx.shadowBlur = isLit ? 18 : 3;
    ctx.shadowColor = '#FF3B30';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.beginPath();
    ctx.arc(insert.x + 2, insert.y + 3, 13, 0, Math.PI * 2);
    ctx.fill();

    const insertGradient = ctx.createRadialGradient(insert.x - 3, insert.y - 4, 1, insert.x, insert.y, 11);
    insertGradient.addColorStop(0, isLit ? '#FFFFFF' : '#5B5B62');
    insertGradient.addColorStop(0.38, isLit ? '#FF5A4F' : '#25252B');
    insertGradient.addColorStop(1, isLit ? '#8E0800' : '#08080B');
    ctx.fillStyle = insertGradient;
    ctx.strokeStyle = isLit ? '#FF8A80' : '#777780';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(insert.x, insert.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = isLit ? '#FFFFFF' : '#8C8C94';
    ctx.font = '800 8px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${insert.value}X`, insert.x, insert.y + 1);
    ctx.restore();
  }

  // Dense 3x3 mode matrix inspired by classic mission inserts.
  for (const insert of modeInserts) {
    const isLit = insert.isLit();
    ctx.save();
    ctx.translate(insert.x, insert.y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.74)';
    ctx.shadowBlur = 7;
    ctx.shadowColor = '#000000';
    ctx.fillRect(-16, -9, 32, 18);

    const modeGradient = ctx.createLinearGradient(0, -8, 0, 8);
    modeGradient.addColorStop(0, isLit ? '#FFFFFF' : '#4A4A51');
    modeGradient.addColorStop(0.32, isLit ? insert.color : '#202026');
    modeGradient.addColorStop(1, isLit ? '#360505' : '#08080B');
    ctx.fillStyle = modeGradient;
    ctx.strokeStyle = isLit ? insert.color : '#6C6C74';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = isLit ? 16 : 0;
    ctx.shadowColor = insert.color;
    ctx.fillRect(-14, -7, 28, 14);
    ctx.strokeRect(-14, -7, 28, 14);

    ctx.shadowBlur = 0;
    ctx.fillStyle = isLit ? '#FFFFFF' : '#A2A2AA';
    ctx.font = `800 ${insert.label.length > 2 ? 5.5 : 8}px "Orbitron", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(insert.label, 0, 0.5);
    ctx.restore();
  }
  drawTableLabel('ROCK MISSIONS', 230, lowerY(578), '#FF6961');

  // 7. Draw Slingshots
  for (const sling of slingshots) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowBlur = sling.flashTime > 0 ? 24 : 10;
    ctx.shadowColor = '#FF3B30';

    // Raised rubber kicker: keeps the gameplay surface without the pink triangle.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(sling.p1.x + 2, sling.p1.y + 4);
    ctx.lineTo(sling.p2.x + 2, sling.p2.y + 4);
    ctx.stroke();

    const slingGradient = ctx.createLinearGradient(sling.p1.x, sling.p1.y, sling.p2.x, sling.p2.y);
    slingGradient.addColorStop(0, '#FFFFFF');
    slingGradient.addColorStop(0.24, sling.flashTime > 0 ? '#FFFFFF' : '#FF665D');
    slingGradient.addColorStop(0.58, '#9C1008');
    slingGradient.addColorStop(1, '#1A0505');
    ctx.strokeStyle = slingGradient;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(sling.p1.x, sling.p1.y);
    ctx.lineTo(sling.p2.x, sling.p2.y);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sling.p1.x, sling.p1.y - 2);
    ctx.lineTo(sling.p2.x, sling.p2.y - 2);
    ctx.stroke();
    ctx.restore();

    if (sling.flashTime > 0) {
      drawHitSpark((sling.p1.x + sling.p2.x) / 2, (sling.p1.y + sling.p2.y) / 2, '#FF3B30', 0.85);
    }
    if (sling.flashTime > 0) sling.flashTime--;
  }
  drawTableLabel('SLING', 108, lowerY(580), '#FF3B30');
  drawTableLabel('SLING', 342, lowerY(580), '#FF3B30');

  // 8. Draw Bumpers
  for (const bumper of bumpers) {
    ctx.save();
    const isFlashing = bumper.flashTime > 0;
    const lightPulse = 0.72 + Math.sin(performance.now() * 0.006 + bumper.pos.x) * 0.18;

    // Soft contact shadow establishes height above the playfield.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#000000';
    ctx.beginPath();
    ctx.ellipse(bumper.pos.x + 5, bumper.pos.y + 8, bumper.radius + 3, bumper.radius * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();

    // Thick illuminated pedestal below the cap.
    const pedestalGradient = ctx.createRadialGradient(
      bumper.pos.x - 5,
      bumper.pos.y - 6,
      bumper.radius * 0.25,
      bumper.pos.x,
      bumper.pos.y,
      bumper.radius + 9
    );
    pedestalGradient.addColorStop(0, '#6E6E76');
    pedestalGradient.addColorStop(0.58, '#202027');
    pedestalGradient.addColorStop(0.78, '#09090D');
    pedestalGradient.addColorStop(0.84, bumper.color);
    pedestalGradient.addColorStop(1, '#050507');
    ctx.shadowBlur = isFlashing ? 34 : 18;
    ctx.shadowColor = bumper.color;
    ctx.fillStyle = pedestalGradient;
    ctx.strokeStyle = bumper.color;
    ctx.lineWidth = isFlashing ? 4 : 2;
    ctx.beginPath();
    ctx.arc(bumper.pos.x, bumper.pos.y + 2, bumper.radius + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // LED studs make the bumper base read as a physical illuminated assembly.
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const ledRadius = bumper.radius + 5;
      const ledX = bumper.pos.x + Math.cos(angle) * ledRadius;
      const ledY = bumper.pos.y + 2 + Math.sin(angle) * ledRadius;
      ctx.shadowBlur = isFlashing ? 14 : 7;
      ctx.shadowColor = bumper.color;
      ctx.fillStyle = i % 2 === 0 ? '#FFFFFF' : bumper.color;
      ctx.globalAlpha = isFlashing ? 1 : lightPulse;
      ctx.beginPath();
      ctx.arc(ledX, ledY, isFlashing ? 2.4 : 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.shadowBlur = isFlashing ? 28 : 12;
    ctx.shadowColor = bumper.color;
    const outerGradient = ctx.createRadialGradient(
      bumper.pos.x - bumper.radius * 0.35,
      bumper.pos.y - bumper.radius * 0.42,
      2,
      bumper.pos.x,
      bumper.pos.y,
      bumper.radius
    );
    outerGradient.addColorStop(0, '#FFFFFF');
    outerGradient.addColorStop(0.16, isFlashing ? bumper.activeColor : '#777781');
    outerGradient.addColorStop(0.52, '#24242B');
    outerGradient.addColorStop(1, '#07070A');
    ctx.fillStyle = outerGradient;
    ctx.strokeStyle = bumper.color;
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.arc(bumper.pos.x, bumper.pos.y, bumper.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Convex inner cap
    const capGradient = ctx.createRadialGradient(
      bumper.pos.x - 7,
      bumper.pos.y - 8,
      1,
      bumper.pos.x,
      bumper.pos.y,
      bumper.radius - 7
    );
    capGradient.addColorStop(0, '#FFFFFF');
    capGradient.addColorStop(0.22, bumper.activeColor);
    capGradient.addColorStop(0.55, bumper.color);
    capGradient.addColorStop(1, '#111116');
    ctx.fillStyle = capGradient;
    ctx.beginPath();
    ctx.arc(bumper.pos.x, bumper.pos.y, bumper.radius - 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bumper.pos.x, bumper.pos.y, bumper.radius - 4, Math.PI * 1.08, Math.PI * 1.82);
    ctx.stroke();

    // Bumper Label
    ctx.shadowBlur = 0;
    ctx.fillStyle = isFlashing ? '#000000' : '#FFFFFF';
    ctx.font = 'bold 11px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bumper.label, bumper.pos.x, bumper.pos.y);

    ctx.restore();
    if (isFlashing) {
      drawHitSpark(bumper.pos.x, bumper.pos.y, bumper.color, 0.8 + bumper.flashTime / 20);
    }
    if (bumper.flashTime > 0) bumper.flashTime--;
  }

  // 9. Draw Flippers
  drawFlipper(flippers.left);
  drawFlipper(flippers.right);

  // 10. Draw Plunger spring
  ctx.save();
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#000000';
  const plungerGradient = ctx.createLinearGradient(plunger.x, 0, plunger.x + plunger.width, 0);
  plungerGradient.addColorStop(0, '#2D2D33');
  plungerGradient.addColorStop(0.28, '#DADAE0');
  plungerGradient.addColorStop(0.5, '#FFFFFF');
  plungerGradient.addColorStop(0.72, '#777780');
  plungerGradient.addColorStop(1, '#18181D');
  ctx.fillStyle = plungerGradient;
  ctx.fillRect(plunger.x, plunger.y + plunger.compression, plunger.width, plunger.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.fillRect(plunger.x + 4, plunger.y + plunger.compression + 3, 2, plunger.height - 6);
  
  // Spring wire representation
  ctx.shadowBlur = 3;
  ctx.shadowColor = '#FFFFFF';
  ctx.strokeStyle = '#AEB0B8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const springTop = plunger.y + plunger.compression;
  const springBottom = HEIGHT - 10;
  ctx.moveTo(plunger.x + plunger.width/2, springBottom);
  
  const coils = 6;
  const spacing = (springBottom - springTop) / coils;
  for (let i = 1; i <= coils; i++) {
    const coilY = springBottom - i * spacing;
    const offset = (i % 2 === 0 ? 8 : -8);
    ctx.lineTo(plunger.x + plunger.width/2 + offset, coilY + spacing/2);
    ctx.lineTo(plunger.x + plunger.width/2, coilY);
  }
  ctx.stroke();
  ctx.restore();

  // 11. Draw particles
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 12. Draw Ball
  if (ball.active || !ball.active && ball.pos.x > 450) {
    ctx.save();

    if (!ball.onRamp) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
      ctx.shadowBlur = 7;
      ctx.shadowColor = '#000000';
      ctx.beginPath();
      ctx.ellipse(ball.pos.x + 4, ball.pos.y + 6, ball.radius * 0.95, ball.radius * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw ball body (Metal finish)
    const grad = ctx.createRadialGradient(
      ball.pos.x - 3, ball.pos.y - 3, 1,
      ball.pos.x, ball.pos.y, ball.radius
    );
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.3, '#E0E0E5');
    grad.addColorStop(0.8, '#707078');
    grad.addColorStop(1, '#202025');

    // Aura glow if on ramp
    if (ball.onRamp) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#FF3B30';
    } else {
      ctx.shadowBlur = 5;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Small hard specular reflection makes the ball read as polished steel.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(ball.pos.x - 4, ball.pos.y - 5, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Chrome reflection arc
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ball.pos.x, ball.pos.y, ball.radius - 2, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
    
    ctx.restore();
  }

  // Cabinet rails sit above the ball and playfield, creating a physical enclosure.
  drawCabinetFrame();

  // 13. Overlay Game states text
  if (state.gameState === 'START') {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 12, 0.8)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = 'bold 36px "Orbitron", sans-serif';
    ctx.fillStyle = '#FF3B30';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#FF3B30';
    ctx.fillText('90s ALTERNATIVE', WIDTH/2, HEIGHT/2 - 80);
    
    ctx.font = 'bold 48px "Orbitron", sans-serif';
    ctx.fillStyle = '#FF3B30';
    ctx.shadowColor = '#FF3B30';
    ctx.fillText('PINBALL', WIDTH/2, HEIGHT/2 - 20);

    ctx.font = '16px "Inter", sans-serif';
    ctx.fillStyle = '#CCCCCC';
    ctx.shadowBlur = 0;
    ctx.fillText('Press "R" to launch game and load sounds', WIDTH/2, HEIGHT/2 + 50);
    ctx.fillText('Press "M" to toggle 90s bass soundtrack', WIDTH/2, HEIGHT/2 + 80);
    ctx.fillText('Left Flipper: [A] or [←] | Right Flipper: [L] or [→]', WIDTH/2, HEIGHT/2 + 120);
    ctx.fillText('Launch: Hold [Space] / Release', WIDTH/2, HEIGHT/2 + 150);
    
    ctx.restore();
  } else if (state.gameState === 'GAMEOVER') {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 12, 0.85)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = 'bold 50px "Orbitron", sans-serif';
    ctx.fillStyle = '#FF3B30';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#FF3B30';
    ctx.fillText('GAME OVER', WIDTH/2, HEIGHT/2 - 40);

    ctx.font = 'bold 24px "Orbitron", sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowBlur = 0;
    ctx.fillText(`FINAL SCORE: ${state.score.toLocaleString()}`, WIDTH/2, HEIGHT/2 + 30);

    ctx.font = '16px "Inter", sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('Press "R" to replay', WIDTH/2, HEIGHT/2 + 90);
    ctx.restore();
  }
}

// Core Game Loop
let lastTime = 0;
function loop(currentTime) {
  if (!lastTime) lastTime = currentTime;
  let dt = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  // Cap frame duration to prevent physics explosion on tab change/lag
  if (dt > 0.1) dt = 0.1;

  // Sub-stepping for physics stability
  const sub_dt = dt / SUB_STEPS;
  for (let i = 0; i < SUB_STEPS; i++) {
    updatePhysics(sub_dt);
  }

  // Update particles and animations
  updateParticles(dt);
  updateComboTimer();
  updateObjectiveHUD();
  updatePlungerPowerIndicator();

  // Draw scene
  render();

  requestAnimationFrame(loop);
}

// Entrypoint
window.addEventListener('load', () => {
  canvas = document.getElementById('pinball-canvas');
  ctx = canvas.getContext('2d');

  configureViewportWorld();
  resizeCanvasBackingStore();

  // Initialize systems
  initWalls();
  initUIControls();
  initInputs();
  initTouchControls();
  updateUI();
  syncMusicButton();
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('orientationchange', handleViewportChange);

  // Run loop
  requestAnimationFrame(loop);
});
