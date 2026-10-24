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
export function recentElections(): { id: string; title: string }[] {
  try {
    const raw = localStorage.getItem(RECENT);
    return raw ? (JSON.parse(raw) as { id: string; title: string }[]) : [];
  } catch {
    return [];
  }
}
