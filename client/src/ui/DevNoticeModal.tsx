import { useI18n } from '../i18n';

const DISCORD = 'https://discord.gg/CCnKH4XBmy';
const GITHUB = 'https://github.com/adrianoreinert/claude-royale';
const EMAIL = 'hello@clauderoyale.net';

/** Aviso de "em desenvolvimento" + canais de apoio/sugestões. */
export function DevNoticeModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop">
      <div className="modal-card dev-notice">
        <h3>{t('dev.title')}</h3>
        <p className="modal-type">{t('dev.body')}</p>
        <p className="modal-type">{t('dev.support')}</p>
        <div className="dev-links">
          <a href={DISCORD} target="_blank" rel="noopener noreferrer">💬 Discord</a>
          <a href={GITHUB} target="_blank" rel="noopener noreferrer">💻 GitHub</a>
          <a href={`mailto:${EMAIL}`}>✉️ {EMAIL}</a>
        </div>
        <button className="play-button" onClick={onClose}>{t('dev.gotIt')}</button>
      </div>
    </div>
  );
}
