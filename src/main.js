import './styles.css';
import { Application } from 'pixi.js';
import { GRID_CONFIG } from './config.js';
import { DIFFICULTIES } from './game/presets.js';
import { MenuScene } from './scenes/menu-scene.js';
import { GameScene } from './scenes/game-scene.js';
import { LevelCatalog } from './game/catalog.js';
import { generateRandomLevel, CANCELLED } from './game/level-source.js';
import { createFlow, createScreens } from './app-flow.js';
import { clearSavedGame, loadMenuState, loadSavedGame, saveGame, saveMenuState } from './game/saved-game.js';
import { markLevelCompleted } from './progress.js';
import { nextLevel, nextLabel } from './game/next-level.js';
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

  const scenes = {};
  const screens = createScreens({ stage: app.stage, scenes, size: () => app.screen });
  const { show } = screens;
  const current = () => screens.current();

  const catalog = new LevelCatalog();
  const flow = createFlow({ scenes, show, current, catalog, generateRandomLevel, CANCELLED, saveGame, clearSavedGame, saveMenuState, nextLevel });

  // ------------------------------------------------------------------ scenes

  scenes.menu = new MenuScene({
    onPlayPredefined: flow.playPredefined,
    onPlayRandom: (difficulty) => flow.playRandom(difficulty),
    onDownload: (items) => flow.downloadLevels(items),
    onCancelGeneration: flow.cancelGeneration,
    onCancelDownload: flow.cancelDownload,
    onNavigate: saveMenuState,
  }, catalog);

  scenes.game = new GameScene({
    onExit: flow.exitToMenu,
    onChange: saveGame,
    // random levels are not tracked, only the predefined ones
    onWin: (session) => { if (session.mode === 'predefined') markLevelCompleted(session.levelId); },
    // the button under a cleared level: next level (or next difficulty), a new random level, or the menu after the last one
    nextLabel: (session) => nextLabel(nextLevel(session, catalog)),
    onNext: flow.next,
  });
  const { menu, game } = scenes;

  // also save when the page is hidden or closed (the browser may discard or reload it in the background)
  const saveNow = () => { if (current() === game) saveGame(game.snapshot()); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);

  app.renderer.on('resize', (width, height) => current()?.layout(width, height));

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
    flow.playRandom(linkDifficulty, Number(linkSeed));
  } else if (saved) {
    flow.play(saved.session, saved.title, saved.levelData, saved);
  } else {
    show(menu);
  }

  // the level list loads in the background (a few seconds at most when offline) and redraws the menu when it is here
  catalog.load().then(() => { if (current() === menu && menu.view !== 'busy') menu.refresh(); });

  // offline support + updates: the browser keeps the app files, a new version waits until the player taps "Update available"
  registerServiceWorker({ onUpdateReady: (apply) => menu.setUpdateAvailable(apply) });
})();
