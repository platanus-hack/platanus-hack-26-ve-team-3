import { cn } from "@/lib/client/cn";

const TICKS = 72;

/** Anillo de marcas tipo Face ID: se encienden en sentido horario según el avance; verde al terminar. */
export function FaceRing({ progress, done }: { progress: number; done: boolean }) {
  const lit = Math.round(progress * TICKS);
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
      {Array.from({ length: TICKS }, (_, i) => {
        const a = (i / TICKS) * 2 * Math.PI - Math.PI / 2;
        const on = i < lit;
        return (
          <line
            key={i}
            x1={50 + 44 * Math.cos(a)}
            y1={50 + 44 * Math.sin(a)}
            x2={50 + (on ? 49 : 47.5) * Math.cos(a)}
            y2={50 + (on ? 49 : 47.5) * Math.sin(a)}
            strokeWidth={1.4}
            strokeLinecap="round"
            className={cn("transition-colors duration-200", on ? (done ? "stroke-[#4fb58a]" : "stroke-[#ff714e]") : "stroke-white/20")}
          />
        );
      })}
    </svg>
  );
}
