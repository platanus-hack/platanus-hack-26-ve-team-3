import type { Metadata } from "next";
import { DrawView } from "@/components/election/DrawView";

export const metadata: Metadata = { title: "Sorteo verificable" };

export default async function DrawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DrawView electionId={id} />;
}
