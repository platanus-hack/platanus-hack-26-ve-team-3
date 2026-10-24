import type { Metadata } from "next";
import { VoterFlow } from "@/components/voter/VoterFlow";

export const metadata: Metadata = { title: "Votar" };

export default async function VoterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <VoterFlow token={token} />;
}
