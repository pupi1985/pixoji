import { validateTutorial } from '../../shared/tutorial.js';

/**
 * Where the player is in a level's tutorial (the list of steps comes from the level file, see shared/tutorial.js).
 * `finished` becomes true after the last step, when the player skips, or when the level is solved.
 */
export class Tutorial {
  constructor(steps, index = 0) {
    this.steps = steps;
    this.index = Math.min(Math.max(0, index), steps.length - 1);
    this.finished = false;
  }

  get step() { return this.steps[this.index]; }
  get count() { return this.steps.length; }
  get blocking() { return !this.finished && this.step.kind === 'say'; }
  get canGoBack() { return this.index > 0; }
  /** A play step with a condition ends by itself, so it shows no Next button. */
  get hasNextButton() { return this.step.kind === 'say' || this.step.until.mode === 'next'; }

  /** Moves on; after the last step the tutorial is finished. Returns true if there is a next step. */
  next() {
    if (this.index >= this.steps.length - 1) { this.finished = true; return false; }
    this.index++;
    return true;
  }

  back() {
    if (this.index === 0) return false;
    this.index--;
    return true;
  }

  skip() { this.finished = true; }
}

/** The tutorial of a level file, or null if it has none (or it is malformed: then it is ignored and the level just plays). */
export function createTutorial(levelData, index = 0) {
  if (!levelData?.tutorial) return null;
  try {
    return new Tutorial(validateTutorial(levelData.tutorial, levelData.grid), index);
  } catch (error) {
    console.warn(error.message);
    return null;
  }
}
