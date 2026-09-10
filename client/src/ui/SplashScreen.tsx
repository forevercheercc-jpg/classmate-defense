import { useI18n } from '../i18n';

/** Splash animada exibida na abertura do jogo. */
export function SplashScreen() {
  const { t } = useI18n();
  return (
    <div className="splash-screen">
      <img className="splash-logo" src="/logo.png" alt="Claude Royale" />
      <div className="splash-bar">
        <div className="splash-bar-fill" />
      </div>
      <p className="splash-hint">{t('common.splashHint')}</p>
    </div>
  );
}
