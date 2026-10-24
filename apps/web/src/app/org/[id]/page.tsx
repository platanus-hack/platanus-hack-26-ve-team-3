import type { Metadata } from "next";
import { OrgPanel } from "@/components/org/OrgPanel";

export const metadata: Metadata = { title: "Panel del organizador" };

export default async function OrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrgPanel electionId={id} />;
}
