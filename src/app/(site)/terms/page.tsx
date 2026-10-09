import type { Metadata } from "next";
import { LegalDocument, legalMetadata } from "@/components/legal/legal-document";

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata("terms");
}

export default function TermsPage() {
  return <LegalDocument pageKey="terms" />;
}
