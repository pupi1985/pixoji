import './styles.css';
import { Application } from 'pixi.js';
import { GRID_CONFIG } from './config.js';
import { MenuScene } from './scenes/menu-scene.js';
import { GameScene } from './scenes/game-scene.js';
import { loadPredefinedLevel, generateRandomLevel, CANCELLED } from './game/level-source.js';
import { clearSavedGame, loadMenuState, loadSavedGame, saveGame, saveMenuState } from './game/saved-game.js';
import { markLevelCompleted } from './progress.js';

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

  // ------------------------------------------------------------------ playing

  const play = (session, title, levelData, saved = null) => {
    game.start({ levelData, title, session, saved });
    show(game);
    if (!saved) saveGame(game.snapshot());   // a reload right now must not lose the level (random levels cannot be re-created)
  };

  const playPredefined = async (difficulty, levelNumber) => {
    try {
      const levelData = await loadPredefinedLevel(difficulty, levelNumber);
      play({ mode: 'predefined', difficulty, levelNumber }, `Difficulty: ${difficulty}  ·  Level ${levelNumber}`, levelData);
    } catch (error) {
      menu.showMessage(`Could not load level ${levelNumber} of difficulty ${difficulty}.\n\n${error.message}`);
    }
  };

  let job = null, timer = null;
  const stopJob = () => { clearInterval(timer); timer = null; job = null; };

  const playRandom = async (difficulty) => {
    menu.showLoading(difficulty);
    const started = Date.now();
    let tried = 0;
    const text = () => `Generating a level… ${Math.round((Date.now() - started) / 1000)}s  ·  ${tried} seeds discarded`;
    timer = setInterval(() => menu.setLoadingText(text()), 500);
    const mine = (job = generateRandomLevel(difficulty, { onProgress: (n) => { tried = n; } }));
    try {
      const { data, seed } = await mine.promise;
      if (job !== mine) return;
      stopJob();
      menu.finishLoading();
      play({ mode: 'random', difficulty, seed }, `Difficulty: ${difficulty}  ·  Seed: ${seed}`, data);
    } catch (error) {
      if (error === CANCELLED || job !== mine) return;
      stopJob();
      menu.showMessage(`The level could not be generated.\n\n${error.message}`);
    }
  };

  // ------------------------------------------------------------------ scenes

  const menu = new MenuScene({
    onPlayPredefined: playPredefined,
    onPlayRandom: playRandom,
    onCancelGeneration: () => { job?.cancel(); stopJob(); },
    onNavigate: saveMenuState,
  });

  const game = new GameScene({
    onExit: () => { clearSavedGame(); show(menu); menu.refresh(); },
    onChange: saveGame,
    // random levels are not tracked, only the predefined ones
    onWin: (session) => { if (session.mode === 'predefined') markLevelCompleted(session.difficulty, session.levelNumber); },
  });

  // also save when the page is hidden or closed (the browser may discard or reload it in the background)
  const saveNow = () => { if (current === game) saveGame(game.snapshot()); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);

  app.renderer.on('resize', (width, height) => current?.layout(width, height));

  // ------------------------------------------------------------------ start: resume whatever was going on
  const saved = loadSavedGame();
  menu.restore(loadMenuState());   // so "back to menu" lands where the player was
  if (saved) {
    play(saved.session, saved.title, saved.levelData, saved);
  } else {
    show(menu);
  }
})();
