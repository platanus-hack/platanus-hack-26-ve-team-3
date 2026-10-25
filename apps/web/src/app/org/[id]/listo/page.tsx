import type { Metadata } from "next";
import { ReadyScreen } from "@/components/org/ReadyScreen";

export const metadata: Metadata = { title: "¡Listo! Comparte la votación" };

export default async function ReadyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReadyScreen electionId={id} />;
}
