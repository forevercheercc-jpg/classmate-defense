import { ELIXIR_MAX } from '@claude-royale/shared';

interface ElixirBarProps {
  elixir: number;
  /** Último minuto / morte súbita: regeneração em dobro */
  boosted?: boolean;
}

export function ElixirBar({ elixir, boosted }: ElixirBarProps) {
  const segments = Array.from({ length: ELIXIR_MAX }, (_, i) => {
    const fill = Math.min(1, Math.max(0, elixir - i));
    return <div key={i} className="elixir-segment" style={{ ['--fill' as string]: fill }} />;
  });

  const overflowing = elixir >= ELIXIR_MAX;
  return (
    <div
      className={`elixir-bar ${boosted ? 'boosted' : ''} ${overflowing ? 'overflow' : ''}`}
      aria-label={`Elixir: ${Math.floor(elixir)} de ${ELIXIR_MAX}`}
    >
      <div className="elixir-drop">💧</div>
      <span className="elixir-number">{Math.floor(elixir)}</span>
      <div className="elixir-segments">{segments}</div>
      {boosted ? <span className="elixir-boost">⚡x2</span> : <span className="elixir-max">Máx.: {ELIXIR_MAX}</span>}
    </div>
  );
}
