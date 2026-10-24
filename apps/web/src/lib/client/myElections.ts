import { recentElections } from "./orgStore";

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
