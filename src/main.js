import { Game } from './Core/Game.js';
import { AuthHandler } from './Core/AuthHandler.js';
import { SettingsMenu } from './Core/SettingsMenu.js';

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game(); // Expose to window for debugging
  window.game.start();

  // Initialize Auth and Settings Menu
  const authHandler = new AuthHandler(window.game);
  const settingsMenu = new SettingsMenu(window.game, authHandler);

  // Connect them
  authHandler.settingsMenu = settingsMenu;
});
