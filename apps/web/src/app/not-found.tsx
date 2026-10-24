import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/states";

export default function NotFound() {
  return (
    <div className="q-container q-narrow py-16">
      <EmptyState
        title="Página no encontrada"
        icon={<SearchX className="size-6" />}
        action={
          <div className="flex flex-col items-center gap-1">
            <Link href="/" className={buttonVariants()}>
              Ir al inicio
            </Link>
            <Link href="/votaciones" className={buttonVariants({ variant: "link" })}>
              Mis votaciones
            </Link>
          </div>
        }
      >
        El enlace puede estar incompleto o haber expirado.
      </EmptyState>
    </div>
  );
}
