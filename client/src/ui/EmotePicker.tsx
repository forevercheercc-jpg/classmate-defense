import { useState } from 'react';
import type { Room } from 'colyseus.js';

/** Emotes base + desbloqueáveis por conquista. */
const BASE_EMOTES = ['👍', '😂', '😭', '😡'];
const UNLOCKABLE: Array<{ emoji: string; achievement: string }> = [
  { emoji: '🏆', achievement: 'ascensao' },
  { emoji: '💎', achievement: 'vitoria-perfeita' },
  { emoji: '🤖', achievement: 'domador-de-maquinas' },
  { emoji: '✨', achievement: 'toque-de-mestre' },
];
const COOLDOWN_MS = 2000;

interface EmotePickerProps {
  room: Room;
  unlockedAchievements?: Record<string, string>;
}

/** Botão 💬 no canto que abre os emotes; envia ao servidor com cooldown local. */
export function EmotePicker({ room, unlockedAchievements = {} }: EmotePickerProps) {
  const emotes = [
    ...BASE_EMOTES,
    ...UNLOCKABLE.filter((u) => unlockedAchievements[u.achievement]).map((u) => u.emoji),
  ];
  const [open, setOpen] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);

  const send = (emoji: string) => {
    if (coolingDown) return;
    room.send('emote', { emoji });
    setOpen(false);
    setCoolingDown(true);
    setTimeout(() => setCoolingDown(false), COOLDOWN_MS);
  };

  return (
    <div className="emote-picker">
      {open && (
        <div className="emote-options">
          {emotes.map((emoji) => (
            <button key={emoji} className="emote-option" onClick={() => send(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}
      <button
        className={`icon-button emote-toggle ${coolingDown ? 'cooling' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Emotes"
      >
        💬
      </button>
    </div>
  );
}
