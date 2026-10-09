import type { Metadata } from "next";
import { LegalDocument, legalMetadata } from "@/components/legal/legal-document";

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata("privacy");
}

export default function PrivacyPage() {
  return <LegalDocument pageKey="privacy" />;
}
