import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/states";

export default function NotFound() {
  return (
    <div className="q-container q-narrow py-16">
      <EmptyState
        title="Página no encontrada"
        action={
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Ir al inicio
          </Link>
        }
      >
        El enlace puede estar incompleto o haber expirado.
      </EmptyState>
    </div>
  );
}
