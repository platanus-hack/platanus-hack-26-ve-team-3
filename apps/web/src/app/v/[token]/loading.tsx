import { LoadingState } from "@/components/states";

export default function Loading() {
  return (
    <div className="q-container q-narrow py-10">
      <LoadingState label="Abriendo tu invitación…" lines={4} />
    </div>
  );
}
