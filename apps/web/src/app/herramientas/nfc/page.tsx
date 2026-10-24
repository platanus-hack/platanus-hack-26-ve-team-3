import type { Metadata } from "next";
import { NfcReader } from "@/components/tools/NfcReader";

export const metadata: Metadata = { title: "Lector NFC (diagnóstico)", robots: { index: false } };

export default function NfcPage() {
  return <NfcReader />;
}
