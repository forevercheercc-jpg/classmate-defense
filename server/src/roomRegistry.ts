/**
 * Registro código → roomId para salas privadas e espectadores.
 * O endpoint HTTP /room-by-code consulta este mapa.
 */
const codes = new Map<string, string>();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I

export function generateRoomCode(): string {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join('');
  } while (codes.has(code));
  return code;
}

export function registerRoomCode(code: string, roomId: string): void {
  codes.set(code, roomId);
}

export function unregisterRoomCode(code: string): void {
  codes.delete(code);
}

export function lookupRoomByCode(code: string): string | undefined {
  return codes.get(code.toUpperCase());
}
