import './styles.css';
import { Application } from 'pixi.js';
import { GRID_CONFIG } from './config.js';
import { MenuScene } from './scenes/menu-scene.js';
import { GameScene } from './scenes/game-scene.js';
import { loadPredefinedLevel, generateRandomLevel, CANCELLED } from './game/level-source.js';
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

  const play = (session, title, levelData) => {
    game.start({ levelData, title, session });
    show(game);
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
    timer = setInterval(() => menu.setLoadingText(`Generating a level… ${Math.round((Date.now() - started) / 1000)}s`), 500);
    const mine = (job = generateRandomLevel(difficulty));
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
  });

  const game = new GameScene({
    onExit: () => { show(menu); menu.refresh(); },
    // random levels are not tracked, only the predefined ones
    onWin: (session) => { if (session.mode === 'predefined') markLevelCompleted(session.difficulty, session.levelNumber); },
  });

  app.renderer.on('resize', (width, height) => current?.layout(width, height));
  show(menu);
})();
