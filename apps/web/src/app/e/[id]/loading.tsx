import { LoadingState } from "@/components/states";

export default function Loading() {
  return (
    <div className="q-container py-10">
      <LoadingState label="Cargando centro de transparencia…" lines={5} />
    </div>
  );
}
