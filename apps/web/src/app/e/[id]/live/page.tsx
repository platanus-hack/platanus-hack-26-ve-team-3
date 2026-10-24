import type { Metadata } from "next";
import { LiveDashboard } from "@/components/live/LiveDashboard";

export const metadata: Metadata = { title: "Resultados en vivo" };

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveDashboard electionId={id} />;
}
