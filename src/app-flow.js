/**
 * app-flow.js - how the player moves between the menu, a level, the next level and a random level. Kept apart from main.js (which
 * owns the Pixi application) so the order of the screens can be tested.
 *
 * The rule that matters: a screen is only put on the display when it already shows what it should. Going to the next level never
 * flashes the menu: if the level is on the device the game goes straight to it (the cleared level stays on screen for the few
 * milliseconds it takes); if it has to be downloaded or generated, the menu is prepared as a "downloading / generating" screen
 * BEFORE it is shown.
 */
/**
 * The screen on the display. Switching from one level straight to the next keeps the same game scene, so it must NOT be stopped
 * (stopping removes its keyboard shortcuts); leaving the game for the menu does stop it.
 */
export function createScreens({ stage, scenes, size }) {
  let current = null;
  return {
    current: () => current,
    show(scene) {
      if (current === scenes.game && scene !== scenes.game) scenes.game.stop();
      current = scene;
      stage.removeChildren();
      stage.addChild(scene);
      const { width, height } = size();
      scene.layout(width, height);
    },
  };
}

export function createFlow({ scenes, show, current, catalog, generateRandomLevel, CANCELLED, saveGame, clearSavedGame, saveMenuState, nextLevel }) {
  let download = null;          // AbortController of the running download
  let job = null, timer = null; // the running random-level generation
  let leaving = false;          // a "next" is in progress: a second tap is ignored

  const showMenu = () => { if (current() !== scenes.menu) show(scenes.menu); };

  const play = (session, title, levelData, saved = null) => {
    scenes.game.start({ levelData, title, session, saved });
    show(scenes.game);
    if (!saved) saveGame(scenes.game.snapshot());   // a reload right now must not lose the level (random levels cannot be re-created)
  };

  /**
   * Saves levels on this device. Returns true if all of them were saved; otherwise explains and returns false.
   * thenPlay: the caller goes on to play right away, so the menu list is not redrawn when the download ends.
   */
  const downloadLevels = async (items, { thenPlay = false } = {}) => {
    const menu = scenes.menu;
    menu.showDownloading(items.length);
    showMenu();
    const abort = (download = new AbortController());
    try {
      await catalog.downloadMany(items, { signal: abort.signal, onProgress: (done, total) => menu.setBusyText(`${done} / ${total}`) });
      if (download !== abort) return false;
      download = null;
      menu.endBusy({ show: !thenPlay });
      return true;
    } catch (error) {
      if (download !== abort) return false;   // cancelled by the player
      download = null;
      menu.showMessage('The levels could not be downloaded (is there a connection?).\n\nLevels already saved on this device stay available, and random levels always work offline.');
      showMenu();
      return false;
    }
  };

  const playPredefined = async (difficulty, entry, number) => {
    const needsDownload = catalog.canSaveLevels && !catalog.isDownloaded(entry);
    if (needsDownload && !(await downloadLevels([{ difficulty, entry }], { thenPlay: true }))) return;
    try {
      const levelData = await catalog.get(difficulty, entry);
      play({ mode: 'predefined', difficulty, levelId: entry.id, levelNumber: number }, `Difficulty: ${difficulty}  ·  Level ${number}`, levelData);
    } catch (error) {
      scenes.menu.showMessage('This level is not saved on this device yet and could not be downloaded.\n\nConnect to the internet once to download it, or play a random level: those work offline.');
      showMenu();
    }
  };

  const stopJob = () => { clearInterval(timer); timer = null; job = null; };

  /** seed = null: any seed; a number: exactly that seed (replays the level another player or the CLI reported). */
  const playRandom = async (difficulty, seed = null) => {
    const menu = scenes.menu;
    menu.showLoading(difficulty);
    showMenu();
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

  /** The button under a cleared level: next level (or the first of the next difficulty), another random level, or the menu after the last one. */
  const next = async (session) => {
    if (leaving) return;
    leaving = true;
    try {
      const target = nextLevel(session, catalog);
      clearSavedGame();
      if (!target) { showMenu(); scenes.menu.refresh(); return; }
      // where "← Menu" will land later: set now, without drawing (the menu is not on screen and must not appear)
      const menu = scenes.menu;
      menu.mode = target.kind;
      menu.difficulty = target.difficulty;
      menu.view = target.kind === 'random' ? 'difficulty' : 'levels';
      saveMenuState({ view: menu.view, mode: menu.mode, difficulty: menu.difficulty });
      if (target.kind === 'random') await playRandom(target.difficulty);
      else await playPredefined(target.difficulty, target.entry, target.number);
    } finally { leaving = false; }
  };

  const exitToMenu = () => { clearSavedGame(); showMenu(); scenes.menu.refresh(); };

  return {
    play, playPredefined, playRandom, downloadLevels, next, exitToMenu,
    cancelGeneration: () => { job?.cancel(); stopJob(); },
    cancelDownload: () => { download?.abort(); download = null; },
  };
}
