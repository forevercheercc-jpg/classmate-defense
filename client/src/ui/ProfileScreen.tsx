import { useState } from 'react';
import { ACHIEVEMENTS, ARENAS, currentArena, nextArena } from './achievements';
import { loadSettings, saveSettings } from './settings';
import { useI18n, LOCALES } from '../i18n';
import type { Profile } from './profileStorage';

interface ProfileScreenProps {
  profile: Profile;
  onNameChange: (name: string) => void;
}

/** Aba Perfil: identidade, caminho dos troféus, estatísticas, conquistas e histórico. */
export function ProfileScreen({ profile, onNameChange }: ProfileScreenProps) {
  const { t } = useI18n();
  const arena = currentArena(profile.trophies);
  const next = nextArena(profile.trophies);
  const winrate =
    profile.stats.matches > 0
      ? Math.round((profile.stats.wins / profile.stats.matches) * 100)
      : 0;
  const unlockedCount = Object.keys(profile.achievements).length;

  return (
    <div className="profile-screen">
      <h2 className="screen-title">{t('profile.title')}</h2>

      <div className="profile-card">
        <div className="profile-avatar">{arena.emoji}</div>
        <div className="profile-identity">
          <input
            className="profile-name big"
            value={profile.name}
            maxLength={16}
            onChange={(e) => onNameChange(e.target.value)}
            aria-label={t('home.playerName')}
          />
          <p className="profile-arena">
            {arena.emoji} {t(`arenas.${arena.id}`)} · 🏆 {profile.trophies} · 💰 {profile.gold}
          </p>
        </div>
      </div>

      <h3 className="section-title">{t('profile.trophyRoad')}</h3>
      <div className="trophy-road">
        {ARENAS.map((step) => {
          const reached = profile.trophies >= step.minTrophies;
          const isCurrent = step.name === arena.name;
          return (
            <div
              key={step.name}
              className={`road-step ${reached ? 'reached' : ''} ${isCurrent ? 'current' : ''}`}
            >
              <span className="road-emoji">{step.emoji}</span>
              <span className="road-name">{t(`arenas.${step.id}`)}</span>
              <span className="road-trophies">🏆 {step.minTrophies}</span>
            </div>
          );
        })}
      </div>
      {next && (
        <p className="deck-hint">
          {t('profile.toNext', { n: next.minTrophies - profile.trophies, emoji: next.emoji, name: t(`arenas.${next.id}`) })}
        </p>
      )}

      <h3 className="section-title">{t('profile.stats')}</h3>
      <div className="stats-grid">
        <Stat label={t('profile.matches')} value={profile.stats.matches} />
        <Stat label={t('profile.wins')} value={profile.stats.wins} />
        <Stat label={t('profile.losses')} value={profile.stats.losses} />
        <Stat label={t('profile.draws')} value={profile.stats.draws} />
        <Stat label={t('profile.winrate')} value={`${winrate}%`} />
        <Stat label={t('profile.crowns')} value={profile.stats.crowns} />
      </div>

      <h3 className="section-title">
        {t('profile.achievements', { n: unlockedCount, total: ACHIEVEMENTS.length })}
      </h3>
      <div className="achievements-grid">
        {ACHIEVEMENTS.map((achievement) => {
          const unlockedAt = profile.achievements[achievement.id];
          return (
            <div
              key={achievement.id}
              className={`achievement ${unlockedAt ? 'unlocked' : 'locked'}`}
              title={t(`ach.${achievement.id}.desc`)}
            >
              <span className="achievement-emoji">{unlockedAt ? achievement.emoji : '🔒'}</span>
              <span className="achievement-name">{t(`ach.${achievement.id}.name`)}</span>
              <span className="achievement-desc">{t(`ach.${achievement.id}.desc`)}</span>
              {unlockedAt && (
                <span className="achievement-date">{unlockedAt.slice(0, 10)}</span>
              )}
            </div>
          );
        })}
      </div>

      <SettingsPanel />

      {profile.history.length > 0 && (
        <>
          <h3 className="section-title">{t('profile.recent')}</h3>
          <div className="match-history full">
            <ul>
              {profile.history.map((match, i) => (
                <li key={i} className={`history-row ${match.result}`}>
                  <span className="history-result">
                    {match.result === 'win' ? `✅ ${t('common.win')}` : match.result === 'loss' ? `❌ ${t('common.loss')}` : `🤝 ${t('common.draw')}`}
                  </span>
                  <span className="history-score">
                    {match.myCrowns} 👑 {match.oppCrowns}
                  </span>
                  <span className="history-mode">{match.vsBot ? t('profile.bot') : t('profile.pvp')}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/** Acessibilidade e conforto. */
function SettingsPanel() {
  const { t, locale, setLocale } = useI18n();
  const [settings, setSettings] = useState(loadSettings);
  const update = (patch: Partial<ReturnType<typeof loadSettings>>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };
  return (
    <>
      <h3 className="section-title">{t('settings.title')}</h3>
      <div className="mode-row settings-row">
        <div className="lang-picker" role="radiogroup" aria-label={t('settings.language')}>
          <span className="lang-label">{t('settings.language')}</span>
          {LOCALES.map((l) => (
            <button
              key={l.id}
              className={`difficulty-option ${locale === l.id ? 'active' : ''}`}
              onClick={() => setLocale(l.id)}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>
        <label className={`party-toggle ${settings.reduceEffects ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={settings.reduceEffects}
            onChange={(e) => update({ reduceEffects: e.target.checked })}
          />
          {t('settings.reduceEffects')}
        </label>
        <label className={`party-toggle ${settings.colorblind ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={settings.colorblind}
            onChange={(e) => update({ colorblind: e.target.checked })}
          />
          {t('settings.teamMarkers')}
        </label>
        <div className="difficulty-picker">
          {[1, 1.15, 1.3].map((scale) => (
            <button
              key={scale}
              className={`difficulty-option ${settings.fontScale === scale ? 'active' : ''}`}
              onClick={() => update({ fontScale: scale })}
            >
              A{scale > 1 ? (scale > 1.2 ? '++' : '+') : ''}
            </button>
          ))}
        </div>
      </div>
      <p className="deck-hint">{t('settings.applyNextBattle')}</p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-value">{value}</span>
      <span className="stat-tile-label">{label}</span>
    </div>
  );
}
