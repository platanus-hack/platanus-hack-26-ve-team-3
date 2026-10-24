import { LoadingState } from "@/components/states";

export default function Loading() {
  return (
    <div className="q-container py-10">
      <LoadingState label="Cargando sorteo…" lines={4} />
    </div>
  );
}
