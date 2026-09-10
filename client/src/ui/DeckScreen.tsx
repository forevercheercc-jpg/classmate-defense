import { useMemo, useState } from 'react';
import { DEFAULT_DECK, collectionCards, getCard } from '@claude-royale/shared';
import { CardArt } from './CardArt';
import { useI18n, cardName } from '../i18n';

interface DeckScreenProps {
  deck: string[];
  onDeckChange: (deck: string[]) => void;
}

/** Arquétipos prontos (nome/descrição via i18n). */
const SUGGESTED_DECKS: Array<{ nameKey: string; descKey: string; deck: string[] }> = [
  {
    nameKey: 'deckScreen.cycleName', descKey: 'deckScreen.cycleDesc',
    deck: ['javali', 'esqueletos', 'salteadores', 'lanceiros', 'choque', 'flechas', 'canhao', 'morcegos'],
  },
  {
    nameKey: 'deckScreen.beatdownName', descKey: 'deckScreen.beatdownDesc',
    deck: ['golem', 'bruxa', 'mago', 'dragaozinho', 'furia', 'bolaDeFogo', 'curandeira', 'pocoDeElixir'],
  },
  {
    nameKey: 'deckScreen.controlName', descKey: 'deckScreen.controlDesc',
    deck: ['balestra', 'bobina', 'torreBombas', 'executor', 'congelamento', 'foguete', 'arqueiras', 'guardiaoRunico'],
  },
];

export function DeckScreen({ deck, onDeckChange }: DeckScreenProps) {
  const { t } = useI18n();
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const avgCost = useMemo(() => {
    const total = deck.reduce((sum, id) => sum + (getCard(id)?.cost ?? 0), 0);
    return (total / deck.length).toFixed(1);
  }, [deck]);

  const available = collectionCards().filter((card) => !deck.includes(card.id));

  const handleSlotClick = (index: number) => {
    setSelectedSlot((current) => (current === index ? null : index));
  };

  const handleReplacement = (cardId: string) => {
    if (selectedSlot === null) return;
    const next = [...deck];
    next[selectedSlot] = cardId;
    onDeckChange(next);
    setSelectedSlot(null);
  };

  return (
    <div className="deck-screen">
      <div className="deck-header">
        <h2 className="screen-title">{t('deckScreen.title')}</h2>
        <span className="avg-cost">
          {t('deckScreen.avgCost')} <strong>{avgCost}</strong>
        </span>
        <button className="text-button" onClick={() => onDeckChange([...DEFAULT_DECK])}>
          {t('deckScreen.restore')}
        </button>
      </div>

      <div className="deck-slots">
        {deck.map((cardId, i) => {
          const card = getCard(cardId);
          if (!card) return null;
          return (
            <button
              key={`${cardId}-${i}`}
              className={`grid-card deck-slot ${selectedSlot === i ? 'selected' : ''}`}
              style={{ ['--card-color' as string]: card.color }}
              onClick={() => handleSlotClick(i)}
            >
              <span className="card-cost">{card.cost}</span>
              <CardArt cardId={cardId} color="blue" emoji={card.emoji} />
              <span className="grid-card-name">{cardName(cardId)}</span>
            </button>
          );
        })}
      </div>

      <div className="mode-row">
        {SUGGESTED_DECKS.map((suggestion) => (
          <button
            key={suggestion.nameKey}
            className="text-button"
            title={t(suggestion.descKey)}
            onClick={() => onDeckChange([...suggestion.deck])}
          >
            {t(suggestion.nameKey)}
          </button>
        ))}
      </div>

      <p className="deck-hint">
        {selectedSlot === null ? t('deckScreen.hintSwap') : t('deckScreen.hintPick')}
      </p>

      <div className={`card-grid trade-grid ${selectedSlot === null ? 'dimmed' : ''}`}>
        {available.map((card) => (
          <button
            key={card.id}
            className="grid-card"
            style={{ ['--card-color' as string]: card.color }}
            disabled={selectedSlot === null}
            onClick={() => handleReplacement(card.id)}
          >
            <span className="card-cost">{card.cost}</span>
            <CardArt cardId={card.id} color="blue" emoji={card.emoji} />
            <span className="grid-card-name">{cardName(card.id)}</span>
          </button>
        ))}
        {available.length === 0 && <p className="deck-hint">{t('deckScreen.allInDeck')}</p>}
      </div>
    </div>
  );
}
