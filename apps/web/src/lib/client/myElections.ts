import { forgetRecentElection, recentElections } from "./orgStore";

export type MyElection = { electionId: string; title: string; role: "voter" | "organizer"; href: string };

const VOTER_PREFIX = "quorum.mine.";
const ROOM_PREFIX = "quorum.room.";

export function rememberVoterLink(electionId: string, invitePath: string, title: string) {
  try {
    localStorage.setItem(VOTER_PREFIX + electionId, JSON.stringify({ electionId, invitePath, title }));
  } catch {
    return;
  }
}

function voterLinks(): MyElection[] {
  const out: MyElection[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const raw = k.startsWith(VOTER_PREFIX) || k.startsWith(ROOM_PREFIX) ? localStorage.getItem(k) : null;
      if (!raw) continue;
      const v = JSON.parse(raw) as { electionId?: string; invitePath?: string; title?: string };
      if (typeof v.electionId === "string" && typeof v.invitePath === "string" && v.invitePath.startsWith("/v/")) {
        out.push({ electionId: v.electionId, title: v.title ?? "", role: "voter", href: v.invitePath });
      }
    }
  } catch {
    return out;
  }
  return out;
}

export function myElections(): MyElection[] {
  const seen = new Set<string>();
  const all = [...voterLinks(), ...recentElections().map((e) => ({ electionId: e.id, title: e.title, role: "organizer" as const, href: `/org/${encodeURIComponent(e.id)}` }))];
  return all.filter((e) => {
    const key = `${e.role}:${e.electionId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Quita votaciones de «Mis votaciones» en este teléfono. Solo borra los enlaces guardados (`quorum.mine.*`,
 * `quorum.room.*` y la lista reciente del organizador): no toca la credencial del votante, el recibo ni nada
 * en el servidor. Si la persona vuelve a abrir su enlace, la votación reaparece.
 */
export function forgetElections(entries: Pick<MyElection, "electionId" | "role">[]) {
  const voterIds = new Set(entries.filter((e) => e.role === "voter").map((e) => e.electionId));
  for (const e of entries) if (e.role === "organizer") forgetRecentElection(e.electionId);
  if (voterIds.size === 0) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !(k.startsWith(VOTER_PREFIX) || k.startsWith(ROOM_PREFIX))) continue;
      try {
        const v = JSON.parse(localStorage.getItem(k) ?? "null") as { electionId?: string } | null;
        if (v && typeof v.electionId === "string" && voterIds.has(v.electionId)) keys.push(k);
      } catch {
        /* entrada ajena: se deja */
      }
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    return;
  }
}
