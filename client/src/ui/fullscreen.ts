/**
 * Entra em tela cheia e tenta travar a orientação em paisagem.
 * iOS Safari (iPhone) não suporta fullscreen programático — o overlay CSS de
 * orientação cobre esse caso pedindo para deitar o aparelho.
 */
export async function enterLandscapeFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Usuário/navegador negou fullscreen — o jogo segue em janela normal.
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation.lock?.('landscape');
  } catch {
    // Lock indisponível (desktop/iOS) — o overlay de orientação cuida do resto.
  }
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Ignora falhas (ex.: iframe sem permissão).
  }
}
