/**
 * Memoria local del organizador (localStorage): ids de participantes y enlaces de invitación
 * devueltos por POST /voters. El contrato no expone GET de participantes; esto vive sólo en el navegador del organizador.
 * No se guardan teléfonos.
 */
export type StoredVoter = { id: string; displayName: string; inviteToken: string; inviteUrl: string };

const key = (electionId: string) => `quorum.org.${electionId}.voters`;

export function loadVoters(electionId: string): StoredVoter[] {
  try {
    const raw = localStorage.getItem(key(electionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredVoter[]) : [];
  } catch {
    return [];
  }
}

export function saveVoters(electionId: string, voters: StoredVoter[]) {
  try {
    localStorage.setItem(key(electionId), JSON.stringify(voters));
  } catch {
    /* ignorar */
  }
}

export function appendVoters(electionId: string, voters: StoredVoter[]) {
  const existing = loadVoters(electionId);
  const ids = new Set(existing.map((v) => v.id));
  saveVoters(electionId, [...existing, ...voters.filter((v) => !ids.has(v.id))]);
}

const RECENT = "quorum.org.recent";
export function rememberElection(id: string, title: string) {
  try {
    const raw = localStorage.getItem(RECENT);
    const list = raw ? (JSON.parse(raw) as { id: string; title: string }[]) : [];
    const next = [{ id, title }, ...list.filter((e) => e.id !== id)].slice(0, 10);
    localStorage.setItem(RECENT, JSON.stringify(next));
  } catch {
    /* ignorar */
  }
}
/** Quita una votación de la lista reciente del organizador (solo la lista: no toca tokens ni datos del servidor). */
export function forgetRecentElection(id: string) {
  try {
    const raw = localStorage.getItem(RECENT);
    const list = raw ? (JSON.parse(raw) as { id: string; title: string }[]) : [];
    localStorage.setItem(RECENT, JSON.stringify(list.filter((e) => e.id !== id)));
  } catch {
    /* ignorar */
  }
}
export function recentElections(): { id: string; title: string }[] {
  try {
    const raw = localStorage.getItem(RECENT);
    return raw ? (JSON.parse(raw) as { id: string; title: string }[]) : [];
  } catch {
    return [];
  }
}

/* ---------- Token del organizador (C4 del threat model) ----------
 * `POST /api/elections` lo devuelve UNA sola vez. Se guarda en sessionStorage (se borra al cerrar la pestaña) y se
 * envía como `Authorization: Bearer` en las acciones del organizador. Nunca va a localStorage ni al servidor de otra forma.
 */
const tokenKey = (electionId: string) => `quorum.orgToken.${electionId}`;
const tokenShownKey = (electionId: string) => `quorum.orgToken.shown.${electionId}`;

export function saveOrgToken(electionId: string, token: string) {
  try {
    sessionStorage.setItem(tokenKey(electionId), token);
    sessionStorage.removeItem(tokenShownKey(electionId));
  } catch {
    /* sin sessionStorage: el panel pedirá pegar el token */
  }
}

export function loadOrgToken(electionId: string): string | null {
  try {
    return sessionStorage.getItem(tokenKey(electionId));
  } catch {
    return null;
  }
}

/** true la primera vez (para mostrar el token con "guárdalo"); después false. */
export function consumeTokenReveal(electionId: string): boolean {
  try {
    if (!sessionStorage.getItem(tokenKey(electionId)) || sessionStorage.getItem(tokenShownKey(electionId))) return false;
    sessionStorage.setItem(tokenShownKey(electionId), "1");
    return true;
  } catch {
    return false;
  }
}

export function orgAuthHeaders(electionId: string): Record<string, string> {
  const t = loadOrgToken(electionId);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* ───────────────────────── D-25: código de acceso para crear ───────────────────────── */
const CREATE_CODE_KEY = "quorum.createCode";

/** Guarda el código de acceso solo en esta pestaña (sessionStorage). */
export function saveCreateCode(code: string) {
  try {
    sessionStorage.setItem(CREATE_CODE_KEY, code);
  } catch {
    /* sin almacenamiento: se pedirá otra vez */
  }
}
export function loadCreateCode(): string | null {
  try {
    return sessionStorage.getItem(CREATE_CODE_KEY);
  } catch {
    return null;
  }
}
export function clearCreateCode() {
  try {
    sessionStorage.removeItem(CREATE_CODE_KEY);
  } catch {
    /* nada */
  }
}
/** Cabecera `x-quorum-create-code` para `POST /api/elections` (vacía si no hay código guardado). */
export function createCodeHeaders(): Record<string, string> {
  const c = loadCreateCode();
  return c ? { "x-quorum-create-code": c } : {};
}
