import type { Metadata } from "next";
import { AttackLab } from "@/components/audit/AttackLab";

export const metadata: Metadata = { title: "Laboratorio de ataques" };

export default function AuditLabPage() {
  return <AttackLab />;
}
