import type { Metadata } from "next";
import { Projector } from "@/components/room/Projector";

export const metadata: Metadata = { title: "Proyector" };

export default async function ProjectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Projector electionId={id} />;
}
