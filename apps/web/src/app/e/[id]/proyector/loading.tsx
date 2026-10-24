export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white text-[#111122]">
      <p role="status" className="text-[clamp(2rem,5vw,5rem)] font-extrabold">
        Cargando proyector…
      </p>
    </div>
  );
}
