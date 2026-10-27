/** The difficulty presets, loaded from the same file the command line tools use (shared/presets.json). */
import raw from '../../shared/presets.json';
import { validatePresets, difficultiesOf, introducedClues } from '../../shared/presets.js';

export const PRESETS = validatePresets(raw, 'shared/presets.json');
export const DIFFICULTIES = difficultiesOf(PRESETS);
/** Clue types that each difficulty adds for the first time: { difficulty: [{ kind, code }] } (shown as icons in the menu). */
export const INTRODUCED = introducedClues(PRESETS);
