import type { Metadata } from "next";
import { TransparencyCenter } from "@/components/election/TransparencyCenter";

export const metadata: Metadata = { title: "Centro de transparencia" };

export default async function ElectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TransparencyCenter electionId={id} />;
}
