import { Game } from './core/Game';
import { UI } from './ui/UI';
import { setLang, watchTranslations } from './ui/i18n';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const root = document.getElementById('ui') as HTMLElement;
const game = new Game(canvas);
setLang(game.settings.language);
const ui = new UI(game, root);
game.ui = ui;
watchTranslations(root);
game.setState('menu');
game.start();
(window as any).akoi = game;

// Android back button: close panels / pause instead of leaving the app.
(async () => {
  try {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      if (game.state === 'play') game.setState('pause');
      else if (game.state === 'inventory' || game.state === 'pause') game.setState('play');
    });
    App.addListener('pause', () => { game.save(); });
  } catch { /* not running natively */ }
})();
