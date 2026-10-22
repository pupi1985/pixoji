import './styles.css';
import { Application } from 'pixi.js';
import { GRID_CONFIG } from './config.js';
import { DIFFICULTIES } from './game/presets.js';
import { MenuScene } from './scenes/menu-scene.js';
import { GameScene } from './scenes/game-scene.js';
import { LevelCatalog } from './game/catalog.js';
import { generateRandomLevel, CANCELLED } from './game/level-source.js';
import { clearSavedGame, loadMenuState, loadSavedGame, saveGame, saveMenuState } from './game/saved-game.js';
import { markLevelCompleted } from './progress.js';
import { registerServiceWorker } from './pwa/register.js';

(async () => {
  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundColor: GRID_CONFIG.background,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.getElementById('app').appendChild(app.canvas);
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  let current = null;
  const show = (scene) => {
    if (current === game) game.stop();
    current = scene;
    app.stage.removeChildren();
    app.stage.addChild(scene);
    scene.layout(app.screen.width, app.screen.height);
  };

  const catalog = new LevelCatalog();

  // ------------------------------------------------------------------ playing

  const play = (session, title, levelData, saved = null) => {
    game.start({ levelData, title, session, saved });
    show(game);
    if (!saved) saveGame(game.snapshot());   // a reload right now must not lose the level (random levels cannot be re-created)
  };

  // ---- downloads (predefined levels are saved on the device so they can be played offline)
  let download = null;   // AbortController of the running download

  /** Saves levels on this device. Returns true if all of them were saved; otherwise explains and returns false. */
  const downloadLevels = async (items) => {
    menu.showDownloading(items.length);
    const abort = (download = new AbortController());
    try {
      await catalog.downloadMany(items, { signal: abort.signal, onProgress: (done, total) => menu.setBusyText(`${done} / ${total}`) });
      if (download !== abort) return false;
      download = null;
      menu.endBusy({ show: true });
      return true;
    } catch (error) {
      if (download !== abort) return false;   // cancelled by the player
      download = null;
      menu.showMessage('The levels could not be downloaded (is there a connection?).\n\nLevels already saved on this device stay available, and random levels always work offline.');
      return false;
    }
  };

  const playPredefined = async (difficulty, entry, number) => {
    if (catalog.canSaveLevels && !catalog.isDownloaded(entry) && !(await downloadLevels([{ difficulty, entry }]))) return;
    try {
      const levelData = await catalog.get(difficulty, entry);
      play({ mode: 'predefined', difficulty, levelId: entry.id, levelNumber: number }, `Difficulty: ${difficulty}  ·  Level ${number}`, levelData);
    } catch (error) {
      menu.showMessage('This level is not saved on this device yet and could not be downloaded.\n\nConnect to the internet once to download it, or play a random level: those work offline.');
    }
  };

  // ---- random levels
  let job = null, timer = null;
  const stopJob = () => { clearInterval(timer); timer = null; job = null; };

  /** seed = null: any seed; a number: exactly that seed (replays the level another player or the CLI reported). */
  const playRandom = async (difficulty, seed = null) => {
    menu.showLoading(difficulty);
    const started = Date.now();
    let tried = 0;
    const text = () => `Generating a level… ${Math.round((Date.now() - started) / 1000)}s  ·  ${tried} seeds discarded`;
    timer = setInterval(() => menu.setBusyText(text()), 500);
    const mine = (job = generateRandomLevel(difficulty, { seed, onProgress: (n) => { tried = n; } }));
    try {
      const { data, seed: usedSeed } = await mine.promise;
      if (job !== mine) return;
      stopJob();
      menu.endBusy();
      play({ mode: 'random', difficulty, seed: usedSeed }, `Difficulty: ${difficulty}  ·  Seed: ${usedSeed}`, data);
    } catch (error) {
      if (error === CANCELLED || job !== mine) return;
      stopJob();
      menu.showMessage(`The level could not be generated.\n\n${error.message}`);
    }
  };

  // ------------------------------------------------------------------ scenes

  const menu = new MenuScene({
    onPlayPredefined: playPredefined,
    onPlayRandom: (difficulty) => playRandom(difficulty),
    onDownload: downloadLevels,
    onCancelGeneration: () => { job?.cancel(); stopJob(); },
    onCancelDownload: () => { download?.abort(); download = null; },
    onNavigate: saveMenuState,
  }, catalog);

  const game = new GameScene({
    onExit: () => { clearSavedGame(); show(menu); menu.refresh(); },
    onChange: saveGame,
    // random levels are not tracked, only the predefined ones
    onWin: (session) => { if (session.mode === 'predefined') markLevelCompleted(session.levelId); },
  });

  // also save when the page is hidden or closed (the browser may discard or reload it in the background)
  const saveNow = () => { if (current === game) saveGame(game.snapshot()); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);

  app.renderer.on('resize', (width, height) => current?.layout(width, height));

  // ------------------------------------------------------------------ start: resume whatever was going on
  // a link like  ?difficulty=4&seed=123456789  replays exactly that random level
  const params = new URLSearchParams(window.location.search);
  const linkSeed = params.get('seed'), linkDifficulty = Number(params.get('difficulty'));
  const fromLink = linkSeed !== null && /^\d+$/.test(linkSeed) && DIFFICULTIES.includes(linkDifficulty);
  if (params.has('seed') || params.has('difficulty')) window.history.replaceState(null, '', window.location.pathname);

  const saved = fromLink ? null : loadSavedGame();
  menu.restore(loadMenuState());   // so "back to menu" lands where the player was
  if (fromLink) {
    show(menu);
    playRandom(linkDifficulty, Number(linkSeed));
  } else if (saved) {
    play(saved.session, saved.title, saved.levelData, saved);
  } else {
    show(menu);
  }

  // the level list loads in the background (a few seconds at most when offline) and redraws the menu when it is here
  catalog.load().then(() => { if (current === menu && menu.view !== 'busy') menu.refresh(); });

  // offline support + updates: the browser keeps the app files, a new version waits until the player taps "Update available"
  registerServiceWorker({ onUpdateReady: (apply) => menu.setUpdateAvailable(apply) });
})();
