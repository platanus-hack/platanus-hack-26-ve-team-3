import type { Metadata } from "next";
import { MyElections } from "@/components/elections/MyElections";
import { FIXTURE_PACKAGE_ID } from "@/lib/client/fixtures";

export const metadata: Metadata = { title: "Mis votaciones" };

const DEMO_ID = process.env.NEXT_PUBLIC_DEMO_ELECTION_ID ?? FIXTURE_PACKAGE_ID;

export default function VotacionesPage() {
  return <MyElections demoHref={`/e/${encodeURIComponent(DEMO_ID)}`} />;
}
