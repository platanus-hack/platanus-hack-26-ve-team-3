"use client";

import Link from "next/link";
import { ErrorState } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="q-container q-narrow py-16">
      <ErrorState title="Algo salió mal" message="Recarga la página o vuelve al inicio." onRetry={retry} retryLabel="Intentar de nuevo">
        <Link href="/" className={buttonVariants({ variant: "link" })}>
          Ir al inicio
        </Link>
      </ErrorState>
    </div>
  );
}
