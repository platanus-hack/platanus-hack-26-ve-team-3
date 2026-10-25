import { memo, type CSSProperties, type ReactNode } from "react";
import { Check, IdCard, ShieldCheck, Smile, UserRound, UserX, XCircle } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { QrCode } from "@/components/room/QrCode";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";
import { FaceRing } from "@/components/voter/FaceRing";
import { cn } from "@/lib/client/cn";
import { ResultsPreview } from "../molecules";
import { arrive, keys, leave, lerp, presence, seg, settle, shake, travel } from "./engine";
import { BADGE_COPY } from "@/lib/client/badge";
import { LOOP, toScene } from "./timeline";

/**
 * Escena del hero: un solo objeto que se transforma en el siguiente, en 5 actos (guion en ./timeline.ts y
 * design/motion/LANDING.md). Estado = función pura de `t` (segundos dentro del loop). Solo `transform` y `opacity`
 * (más un `clip-path` medido: la boleta que sale del teléfono). Componentes reales: ResultsCard, QrCode, FaceRing,
 * Button, Badge, StatusPill, LogoMark. Datos de ejemplo: hashes reales de `public/fixtures/protocol/valid.json`.
 */

export type Layout = ReturnType<typeof layoutFor>;

export function layoutFor(compact: boolean) {
  return compact
    ? { compact, W: 328, H: 400, d: 820, cardW: 296, cardH: 352, phoneW: 176, phoneH: 356, phoneR: 32, bezel: 7, qr: 92, ring: 124, paperW: 172, paperH: 118, sP: 1.12, blockW: 116, blockH: 72, dx: 46, pitch0: 44, pitch1: 104, plateW: 304, plateH: 76, plateY: 152, aRy: -9, bRy: -16, cY: 70, cS: 0.78, chainY: -16 }
    : { compact, W: 560, H: 620, d: 1050, cardW: 392, cardH: 406, phoneW: 248, phoneH: 500, phoneR: 44, bezel: 9, qr: 128, ring: 168, paperW: 216, paperH: 146, sP: 1.24, blockW: 166, blockH: 98, dx: 82, pitch0: 60, pitch1: 150, plateW: 404, plateH: 88, plateY: 236, aRy: -15, bRy: -23, cY: 78, cS: 0.82, chainY: -22 };
}

/* Hashes reales del paquete de ejemplo (valid.json): génesis → 3 votos; el último es el hash final. */
const CHAIN = [
  { n: 0, label: "génesis", hash: "2982…d755", prev: null },
  { n: 1, label: "voto", hash: "e9ac…8327", prev: "2982…d755" },
  { n: 2, label: "voto", hash: "fc81…f5a6", prev: "e9ac…8327" },
  { n: 3, label: "tu voto", hash: "1222…33a3", prev: "fc81…f5a6" },
] as const;
const TAMPERED = "7d0f…c41b";
const NULLIFIER = "1680…4310";

const f2 = (n: number) => n.toFixed(2);

type Pose = { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; s?: number; o?: number };

function tf({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1 }: Pose) {
  return `translate3d(${f2(x)}px, ${f2(y)}px, ${f2(z)}px) rotateX(${f2(rx)}deg) rotateY(${f2(ry)}deg) rotateZ(${f2(rz)}deg) scale(${s.toFixed(4)})`;
}

/** Un objeto anclado por su centro en (x, y) respecto al centro del lienzo. Invisible (sin pintar) con opacidad 0. */
function Obj({ pose, w, h, className, style, children }: { pose: Pose; w?: number; h?: number; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const o = pose.o ?? 1;
  return (
    <div className="absolute left-1/2 top-1/2 size-0" style={{ transform: tf(pose), opacity: o, visibility: o <= 0.002 ? "hidden" : undefined }}>
      <div className={cn("absolute -translate-x-1/2 -translate-y-1/2", className)} style={{ width: w, height: h, ...style }}>
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────── Piezas estáticas (memo: no se re-renderizan con `t`) ───────────────────────── */

/** La ResultsCard real; sin desenfoque de fondo (sobre fondo liso se ve igual y no repinta en cada cuadro). */
const Card = memo(function Card() {
  return <ResultsPreview className="backdrop-blur-none backdrop-saturate-100" />;
});

const BallotScreen = memo(function BallotScreen({ L, press }: { L: Layout; press: number }) {
  const c = L.compact;
  return (
    <div className={cn("flex h-full flex-col bg-background text-foreground", c ? "gap-2 p-3 pt-9" : "gap-3 p-4 pt-12")}>
      <span className={cn("q-eyebrow", c ? "text-[0.5625rem]" : "text-[0.6875rem]")}>Fecha de la asamblea</span>
      <span className={cn("rounded-md border-2 border-primary bg-card font-semibold", c ? "px-2 py-1.5 text-[0.6875rem]" : "px-3 py-2.5 text-[0.875rem]")}>Sábado 14</span>
      <span className={cn("rounded-md border border-border bg-card text-muted-foreground", c ? "px-2 py-1.5 text-[0.6875rem]" : "px-3 py-2.5 text-[0.875rem]")}>Domingo 15</span>
      <span className="mt-auto" style={{ transform: `scale(${press.toFixed(4)})` }}>
        <span className={cn(buttonVariants({ size: "sm", full: true }), "pointer-events-none", c ? "min-h-9 px-2 text-[0.6875rem]" : "min-h-11 text-[0.8125rem]")}>Votar: Sábado 14</span>
      </span>
    </div>
  );
});

/** Cara exterior del sobre: la solapa de la boleta doblada, con el sello de la prueba y el nullifier. */
const Envelope = memo(function Envelope({ L, seal }: { L: Layout; seal: number }) {
  const c = L.compact;
  return (
    <div className="relative size-full overflow-hidden rounded-md border border-border bg-muted">
      <svg aria-hidden="true" viewBox="0 0 100 50" preserveAspectRatio="none" className="absolute inset-0 size-full text-input">
        <polyline points="0,0 50,30 100,0" fill="none" stroke="currentColor" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={cn("q-mono absolute inset-x-0 text-center font-semibold text-muted-foreground", c ? "bottom-1.5 text-[0.5625rem]" : "bottom-2.5 text-[0.6875rem]")}>nullifier {NULLIFIER}</span>
      <span
        className={cn("absolute left-1/2 grid -translate-x-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-primary", c ? "top-[30%] size-8 [&_svg]:size-4" : "top-[30%] size-11 [&_svg]:size-5")}
        style={{ opacity: seal, transform: `translate(-50%, -50%) scale(${lerp(1.35, 1, arrive(seal)).toFixed(4)})` }}
      >
        <ShieldCheck aria-hidden="true" />
      </span>
    </div>
  );
});

function Block({ L, i, red, stale, hashShift }: { L: Layout; i: number; red: number; stale: number; hashShift: number }) {
  const b = CHAIN[i];
  const c = L.compact;
  const mine = i === 3;
  return (
    <div className={cn("relative flex size-full flex-col justify-between rounded-md bg-card shadow-card", mine ? "border-2 border-primary" : "border border-border", c ? "p-2" : "p-3")}>
      <span className={cn("flex items-baseline justify-between gap-1", c ? "text-[0.5625rem]" : "text-[0.6875rem]")}>
        <span className="q-num font-semibold text-muted-foreground">#{b.n}</span>
        <span className={cn("font-semibold", mine ? "text-primary-ink" : "text-muted-foreground")}>{b.label}</span>
      </span>
      <span className={cn("relative block overflow-hidden", c ? "h-4" : "h-5")}>
        <span className={cn("q-mono absolute inset-0 font-semibold", c ? "text-[0.75rem]" : "text-[0.9375rem]")} style={{ transform: `translateY(${f2(-hashShift * 110)}%)` }}>
          {b.hash}
        </span>
        {i === 1 ? (
          <span className={cn("q-mono absolute inset-0 font-semibold text-danger-strong", c ? "text-[0.75rem]" : "text-[0.9375rem]")} style={{ transform: `translateY(${f2((1 - hashShift) * 110)}%)` }}>
            {TAMPERED}
          </span>
        ) : null}
      </span>
      <span className={cn("q-mono text-muted-foreground", c ? "text-[0.5625rem]" : "text-[0.6875rem]")}>{b.prev ? `← ${b.prev}` : "inicio"}</span>
      {i === 1 ? <span className="pointer-events-none absolute -inset-px rounded-md border-2 border-danger bg-danger-soft/40" style={{ opacity: red }} /> : null}
      {i >= 2 ? <span className="pointer-events-none absolute -inset-px rounded-md border-2 border-danger/80" style={{ opacity: stale }} /> : null}
    </div>
  );
}

const Plate = memo(function Plate({ L, hashO, markO }: { L: Layout; hashO: number; markO: number }) {
  const c = L.compact;
  return (
    <div className={cn("flex size-full items-center rounded-lg bg-navy text-[var(--q-white-perfect)] shadow-elevated", c ? "gap-2.5 px-3" : "gap-4 px-5")}>
      <span className="shrink-0" style={{ opacity: markO, transform: `scale(${lerp(0.9, 1, markO).toFixed(4)})` }}>
        <LogoMark size={c ? 34 : 44} knockout="var(--color-navy)" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("font-semibold", c ? "text-[0.75rem]" : "text-[0.9375rem]")}>Ancla on-chain</span>
        <span className={cn("text-[var(--q-dark-ages)]", c ? "text-[0.625rem]" : "text-[0.75rem]")}>
          Base Sepolia · QuorumRegistry <span className="q-mono">0x64e7…be13</span>
        </span>
        <span className={cn("q-mono font-semibold text-primary", c ? "text-[0.625rem]" : "text-[0.75rem]")} style={{ opacity: hashO }}>
          hash final {CHAIN[3].hash}
        </span>
      </span>
    </div>
  );
});

/* ───────────────────────── La escena ───────────────────────── */

export function Scene({ t, L }: { t: number; L: Layout }) {
  const { W, H, d } = L;
  const t0 = ((t % LOOP) + LOOP) % LOOP; // tiempo del loop
  const T = toScene(t0); // tiempo de la escena (el impostor se intercala en 8,2 → 12,2 s)
  const screenW = L.phoneW - 2 * L.bezel;
  const screenH = L.phoneH - 2 * L.bezel;
  const cs1 = screenW / L.cardW;

  // Vida en reposo: una deriva lenta y continua de cámara (cierra el loop sin salto).
  const driftR = 1.4 * Math.sin((2 * Math.PI * t0 * 3) / LOOP);
  // Acto «impostor»: el mismo teléfono gira hacia el otro lado (otra persona que intenta entrar) y vuelve.
  const swing = 43 * travel(seg(t0, 8.2, 8.9)) * (1 - travel(seg(t0, 12.2, 13.0)));
  const zoom = keys(T, [[0, 1], [3.4, 1], [4.6, 1.03], [8.2, 1.03], [9.0, 1], [10.5, 1], [11.3, 1.05], [13.0, 1.05], [14.1, 1], [18.4, 1], [18.9, 1.03], [21.7, 1.03], [22.6, 1]]) * (1 + 0.006 * Math.sin((2 * Math.PI * t0 * 2) / LOOP));

  /* ── A ⇄ B ⇄ C: tarjeta → teléfono ── */
  const reset = T >= 21.9; // la tarjeta vuelve recompuesta (acto E → A)
  const exitU = leave(seg(T, 10.45, 11.25));
  const gPose: Pose = reset
    ? { ry: lerp(-30, L.aRy, travel(seg(T, 22.05, 23.2))) + driftR, rx: 5, s: 1 }
    : {
        y: keys(T, [[8.2, 0], [9.0, L.cY]]) + exitU * H * 0.95,
        ry: keys(T, [[3.4, L.aRy], [4.6, L.bRy], [8.2, L.bRy], [9.0, -3]]) + driftR + swing,
        rx: keys(T, [[3.4, 5], [4.6, 4], [8.2, 4], [9.0, 2]]) + exitU * 16,
        rz: keys(T, [[3.4, 0], [4.6, 1.5], [8.2, 1.5], [9.0, 0]]),
        s: keys(T, [[8.2, 1], [9.0, L.cS]]),
        o: 1 - seg(T, 10.95, 11.25),
      };
  const cs = reset ? 1 : keys(T, [[3.55, 1], [4.5, cs1]]);
  const clip = !reset && cs * L.cardW <= screenW + 1;
  const cardO = reset ? arrive(seg(T, 22.1, 22.75)) : 1;
  const cardS = reset ? lerp(0.94, 1, arrive(seg(T, 22.1, 22.8))) : cs;
  const bezelU = reset ? 0 : arrive(seg(T, 3.5, 4.4));
  const camY = reset ? 100 : lerp(100, 0, travel(seg(T, 4.35, 4.95)));
  const ballotY = reset ? 100 : lerp(100, 0, travel(seg(T, 8.2, 8.95)));
  const press = 1 - 0.035 * Math.sin(Math.PI * seg(T, 9.45, 9.65));

  // Acto B dentro de la pantalla: credencial (QR) → rostro.
  const qrO = presence(T, 4.85, 5.15, 6.25, 6.5);
  const scanU = travel(seg(T, 5.2, 6.0));
  const scanO = presence(T, 5.15, 5.25, 5.95, 6.05);
  const qrShrink = travel(seg(T, 6.05, 6.5));
  const chipY = -screenH / 2 + (L.compact ? 48 : 64);
  const bOut = 1 - leave(seg(t0, 8.25, 8.6)); // lo del acto B se retira al empezar el intento de suplantación
  const chipO = Math.min(presence(T, 6.3, 6.6), bOut);
  const ringO = Math.min(presence(T, 6.35, 6.75), bOut);
  const ringP = seg(T, 6.7, 7.65);
  const headRy = keys(T, [[6.8, 0], [7.15, -38], [7.5, 0]]);
  const okO = Math.min(presence(T, 7.7, 7.95), bOut);
  const turnO = presence(T, 6.7, 6.9, 7.5, 7.7);
  const step2 = t0 < 8.25 ? presence(t0, 6.2, 6.5) : t0 < 10.4 ? 1 - arrive(seg(t0, 8.3, 8.6)) : arrive(seg(t0, 10.45, 10.7));

  // Acto «impostor»: el mismo teléfono gira hacia el otro lado (otra persona) y dos intentos rebotan.
  const frameO = presence(t0, 8.45, 8.7, 10.3, 10.5);
  const qrRed = arrive(seg(t0, 9.75, 9.95));
  const badIn = arrive(seg(t0, 8.9, 9.2));
  const badOut = leave(seg(t0, 10.0, 10.45));
  const badPose: Pose = { x: shake(seg(t0, 9.75, 10.0), 5), y: lerp(screenH * 0.55, -12, badIn) + badOut * screenH * 0.6, rz: 9 * badOut, o: Math.min(presence(t0, 8.9, 9.0), 1 - seg(t0, 10.3, 10.45)) };
  const badScanU = travel(seg(t0, 9.2, 9.75));
  const badScanO = presence(t0, 9.15, 9.25, 9.7, 9.8);
  const alert1 = presence(t0, 9.85, 10.1, 10.45, 10.65);
  const fakeO = Math.min(presence(t0, 10.5, 10.8), 1 - leave(seg(t0, 12.05, 12.35)));
  const fakeP = seg(t0, 10.8, 11.35);
  const shut = arrive(seg(t0, 11.35, 11.6));
  const xO = presence(t0, 11.45, 11.65);
  const alert2 = Math.min(presence(t0, 11.5, 11.75), 1 - leave(seg(t0, 12.05, 12.35)));

  /* ── C: la boleta sale del teléfono, se dobla en sobre y se sella; un segundo voto rebota ── */
  const phoneTop = L.cY - (L.phoneH / 2) * L.cS;
  const emergeU = travel(seg(T, 9.7, 10.5));
  const toCenterU = travel(seg(T, 10.5, 11.3));
  const pS = lerp(L.cS, L.sP, toCenterU);
  const yEmerge = lerp(phoneTop + (L.paperH / 2) * L.cS + 2, phoneTop - (L.paperH / 2) * L.cS - 10, emergeU);
  const yCenter = (-L.paperH / 4) * L.sP; // centro del contenedor para que el sobre (mitad de abajo) quede centrado
  let paperY = lerp(yEmerge, yCenter, toCenterU);
  const overlap = Math.max(0, paperY + (L.paperH / 2) * L.cS - phoneTop);
  const clipBottom = toCenterU > 0 ? 0 : overlap / L.cS;
  const fold = travel(seg(T, 11.35, 11.95));
  const seal = seg(T, 11.95, 12.3);
  const dip = 4 * Math.sin(Math.PI * seg(T, 12.6, 12.85)) + 3 * Math.sin(Math.PI * seg(T, 11.95, 12.2));
  const envH = (L.paperH / 2) * L.sP;

  // C → D: el sobre cae a la cadena y se vuelve el último bloque.
  const plane = planeAt(T, L);
  const p3 = blockCenter(3, plane, L);
  const dropU = travel(seg(T, 13.0, 14.0));
  const envScale = lerp(L.sP, (L.blockW / L.paperW) * p3.f * 1.04, dropU);
  const envCx = lerp(0, p3.x, dropU);
  const envCy = lerp(0, p3.y, dropU);
  if (dropU > 0) paperY = envCy - (L.paperH / 4) * envScale;
  const paperPose: Pose = {
    x: envCx,
    y: paperY + dip,
    rz: lerp(-3, 0, toCenterU) + driftR * 0.5,
    rx: lerp(0, 28, dropU),
    s: dropU > 0 ? envScale : pS,
    o: Math.min(presence(T, 9.7, 9.75), 1 - leave(seg(T, 13.75, 14.05))),
  };

  // Segundo voto: cae, choca, rebota con «rechazado» y se va.
  const dupIn = leave(seg(T, 12.3, 12.6));
  const dupBounce = arrive(seg(T, 12.6, 12.88));
  const dupOut = leave(seg(T, 12.9, 13.3));
  const contactY = -envH - 2;
  const dupPose: Pose = {
    x: shake(seg(T, 12.6, 12.82), 3) + dupOut * W * 0.62,
    y: lerp(contactY - envH * 1.6, contactY, dupIn) - dupBounce * (L.compact ? 30 : 46) + dupOut * envH * 1.4,
    rz: -7 * dupBounce + 22 * dupOut,
    s: L.sP,
    o: Math.min(presence(T, 12.3, 12.45), 1 - dupOut),
  };
  const rejO = presence(T, 12.62, 12.76);

  /* ── D: cadena en profundidad + ancla ── */
  const pillU = travel(seg(T, 16.5, 17.3));
  const plateCx = 0;
  const plateCy = L.plateY + plane.py * 0.3;
  const slot = { x: plateCx + (L.compact ? -30 : -40), y: plateCy + (L.compact ? 20 : 24) };
  const p3b = blockCenter(3, plane, L, 0.5);
  const pillPose: Pose = { x: lerp(p3b.x, slot.x, pillU), y: lerp(p3b.y + 8, slot.y, pillU), s: lerp(1, 0.86, pillU), o: presence(T, 16.35, 16.55, 17.2, 17.4) };
  const plateU = arrive(seg(T, 16.1, 16.6));
  const stamp = 1 + 0.025 * Math.sin(Math.PI * seg(T, 17.2, 17.45));
  const platePose: Pose = { x: plateCx, y: plateCy + lerp(26, 0, plateU) + 20 * leave(seg(T, 21.7, 22.2)), rx: 8, s: stamp, o: Math.min(plateU, 1 - leave(seg(T, 21.7, 22.2))) };
  const hashO = presence(T, 17.15, 17.4);
  const markO = arrive(seg(T, 17.35, 17.75));

  /* ── E: alguien altera una copia ── */
  const restore = travel(seg(T, 21.05, 21.6));
  const red = arrive(seg(T, 19.0, 19.45)) * (1 - restore);
  const brk = arrive(seg(T, 19.5, 19.95)) * (1 - restore);
  const sag = settle(seg(T, 19.55, 20.35)) * (1 - restore);
  const stale = (i: number) => arrive(seg(T, 19.6 + 0.12 * (i - 2), 19.9 + 0.12 * (i - 2))) * (1 - restore);
  const mid12 = linkMid(1, plane, L);
  const failO = Math.min(presence(T, 19.85, 20.1), 1 - leave(seg(T, 21.0, 21.3)));
  const failPose: Pose = { x: mid12.x + shake(seg(T, 20.1, 20.5), 4), y: mid12.y - (L.compact ? 30 : 40) - 12 * leave(seg(T, 21.0, 21.3)), s: lerp(0.94, 1, arrive(seg(T, 19.85, 20.1))), o: failO };
  const p0 = blockCenter(0, plane, L, 1);
  const tagA = Math.min(presence(T, 18.7, 19.0), 1 - travel(seg(T, 21.0, 21.3)));
  const tagB = presence(T, 21.0, 21.3, 21.75, 22.0);
  const tagPose: Pose = { x: p0.x, y: p0.y - (L.compact ? 14 : 18), o: Math.max(tagA, tagB) };
  const okBadge = presence(T, 22.45, 22.75, 23.4, 23.75);

  /* ── sombra de contacto (una luz cenital) ── */
  const shY = keys(T, [[3.4, L.cardH / 2 + 22], [4.6, L.phoneH / 2 + 14], [8.2, L.phoneH / 2 + 14], [9.0, L.cY + (L.phoneH / 2) * L.cS + 10], [10.6, L.cY + (L.phoneH / 2) * L.cS + 10], [11.3, envH / 2 + 40], [13.0, envH / 2 + 40], [14.1, L.plateY - 10], [21.7, L.plateY - 10], [22.6, L.cardH / 2 + 22]]);
  const shW = keys(T, [[3.4, L.cardW * 0.95], [4.6, L.phoneW * 1.15], [10.6, L.phoneW * 1.15 * L.cS], [11.3, L.paperW * L.sP * 1.1], [13.0, L.paperW * L.sP * 1.1], [14.1, W * 0.85], [21.7, W * 0.85], [22.6, L.cardW * 0.95]]);

  // Golpe del acto E: la cámara empuja hacia el eslabón roto y vuelve al restaurar la copia original.
  const push = travel(seg(T, 19.35, 20.05)) * (1 - travel(seg(T, 21.0, 21.7)));
  const camZ = zoom * (1 + push * (L.compact ? 0.05 : 0.08));
  const camX = -mid12.x * push * 0.6;
  const camY2 = -(mid12.y - (L.compact ? 20 : 30)) * push * 0.5;

  return (
    <div aria-hidden="true" className="pointer-events-none relative select-none" style={{ width: W, height: H }}>
      <div className="absolute inset-0" style={{ perspective: d, transform: `translate3d(${f2(camX)}px, ${f2(camY2)}px, 0) scale(${camZ.toFixed(4)})` }}>
        <Obj pose={{ y: shY, s: 1 }} w={shW} h={L.compact ? 36 : 48} className="rounded-[50%] bg-[radial-gradient(closest-side,rgb(17_17_34/0.16),transparent)] dark:bg-[radial-gradient(closest-side,rgb(0_0_0/0.4),transparent)]" />

        {/* D/E: la cadena en un plano que se estira en profundidad (los bloques se paran de frente a la cámara). */}
        <Chain T={T} L={L} plane={plane} red={red} brk={brk} sag={sag} stale={stale} />

        <Obj pose={platePose} w={L.plateW} h={L.plateH}>
          <Plate L={L} hashO={hashO} markO={markO} />
        </Obj>
        <Obj pose={pillPose} className={cn("flex items-center whitespace-nowrap rounded-full border border-primary/60 bg-card shadow-primary", L.compact ? "px-2.5 py-1" : "px-3 py-1.5")}>
          <span className={cn("q-mono font-semibold", L.compact ? "text-[0.625rem]" : "text-[0.75rem]")}>final {CHAIN[3].hash}</span>
        </Obj>

        {/* A/B/C: la tarjeta de resultados que se vuelve teléfono */}
        <Obj pose={gPose} w={L.phoneW} h={L.phoneH}>
          <div className="absolute inset-0 shadow-elevated" style={{ borderRadius: L.phoneR, background: "var(--q-graphite)", opacity: bezelU, transform: `scale(${lerp(1.06, 1, bezelU).toFixed(4)})` }} />
          <div className="absolute" style={{ inset: L.bezel, borderRadius: L.phoneR - L.bezel, overflow: clip ? "hidden" : "visible" }}>
            <div className="absolute left-1/2 top-1/2" style={{ width: L.cardW, transform: `translate(-50%, -50%) scale(${cardS.toFixed(4)})`, opacity: cardO }}>
              <Card />
            </div>
            {/* cámara del teléfono (como la pantalla real de FaceCapture) */}
            <div className="absolute inset-0 bg-navy text-white" style={{ transform: `translateY(${f2(camY)}%)`, visibility: camY >= 100 ? "hidden" : undefined }}>
              <span className={cn("absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/10 px-2.5 py-0.5 font-semibold text-white/80", L.compact ? "text-[0.5625rem]" : "text-[0.6875rem]")}>
                <span style={{ opacity: 1 - step2 }}>Paso 1 de 2</span>
                <span className="absolute inset-0 grid place-items-center" style={{ opacity: step2 }}>
                  Paso 2 de 2
                </span>
              </span>
              <Obj pose={{ y: lerp(-12, chipY, qrShrink), s: lerp(1, 0.26, qrShrink), o: qrO }} w={L.qr + 20} h={L.qr + 20}>
                <QrCode value="quorum:credencial:ejemplo-26ve" label="" className="absolute inset-[10px] size-auto rounded-sm" />
                <Brackets className="border-primary" o={1} />
                <span className="absolute inset-x-1 top-[8px] h-[3px] rounded-full bg-primary" style={{ opacity: scanO, transform: `translateY(${f2(scanU * (L.qr + 2))}px)` }} />
              </Obj>
              <Obj pose={{ y: L.qr / 2 + (L.compact ? 22 : 30), o: Math.min(qrO, 1 - qrShrink) }} className={cn("whitespace-nowrap font-semibold text-white/70", L.compact ? "text-[0.625rem]" : "text-[0.75rem]")}>
                Escanear mi credencial
              </Obj>
              <Obj pose={{ y: chipY, s: lerp(0.94, 1, chipO), o: chipO }}>
                <Badge tone="success" className={cn("gap-1 whitespace-nowrap", L.compact ? "px-2 text-[0.5625rem] [&_svg]:size-3" : "text-[0.6875rem] [&_svg]:size-3.5")}>
                  <IdCard aria-hidden="true" /> Credencial · 1 uso
                </Badge>
              </Obj>
              <Obj pose={{ y: 14, s: lerp(0.94, 1, ringO), o: ringO }} w={L.ring} h={L.ring}>
                <FaceRing progress={ringP} done={T >= 7.7} />
                <span className="absolute inset-[9%] grid place-items-center overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10" style={{ perspective: 300 }}>
                  <Smile aria-hidden="true" className="size-[58%] text-white/85" strokeWidth={1.1} style={{ transform: `rotateY(${f2(headRy)}deg)` }} />
                  <span className="absolute inset-0 grid place-items-center bg-black/45" style={{ opacity: okO }}>
                    <span className="grid size-[46%] place-items-center rounded-full bg-[#4fb58a] text-[#111122]" style={{ transform: `scale(${lerp(0.9, 1, okO).toFixed(4)})` }}>
                      <Check aria-hidden="true" className="size-[60%]" strokeWidth={3} />
                    </span>
                  </span>
                </span>
              </Obj>
              <Obj pose={{ y: 14 + L.ring / 2 + (L.compact ? 20 : 28), o: turnO }} className={cn("whitespace-nowrap font-semibold", L.compact ? "text-[0.6875rem]" : "text-[0.875rem]")}>
                Gira la cabeza a la izquierda
              </Obj>
            </div>
            {/* intento de suplantación (mismos mensajes que el producto) */}
            <div className="absolute inset-0 text-white" style={{ visibility: frameO + badPose.o! + fakeO + alert1 + alert2 <= 0.002 ? "hidden" : undefined }}>
              <Obj pose={{ y: -12, o: frameO }} w={L.qr + 20} h={L.qr + 20}>
                <Brackets className="border-primary" o={1 - qrRed} />
                <Brackets className="border-danger" o={qrRed} />
              </Obj>
              <Obj pose={badPose} w={L.qr} h={L.qr}>
                <QrCode value="https://ejemplo.org/entrada-general" label="" className="size-full rounded-sm" />
                <span className="absolute inset-x-[-6px] top-0 h-[3px] rounded-full bg-primary" style={{ opacity: badScanO, transform: `translateY(${f2(badScanU * (L.qr - 2))}px)` }} />
              </Obj>
              <Obj pose={{ y: 14, s: lerp(0.94, 1, fakeO), o: fakeO }} w={L.ring} h={L.ring}>
                <FaceRing progress={fakeP} done={false} />
                <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" style={{ opacity: shut, transform: `scale(${lerp(1.1, 1, shut).toFixed(4)})` }}>
                  <circle cx="50" cy="50" r="46.5" fill="none" stroke="var(--color-danger)" strokeWidth="3" />
                </svg>
                <span className="absolute inset-[9%] grid place-items-center overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
                  <UserRound aria-hidden="true" className="size-[56%] text-white/80" strokeWidth={1.1} />
                  <span className="absolute inset-0 grid place-items-center bg-black/45" style={{ opacity: xO }}>
                    <span className="grid size-[46%] place-items-center rounded-full bg-danger text-white" style={{ transform: `scale(${lerp(0.9, 1, xO).toFixed(4)})` }}>
                      <UserX aria-hidden="true" className="size-[56%]" strokeWidth={2.4} />
                    </span>
                  </span>
                </span>
              </Obj>
              <Notice L={L} o={alert1} y={screenH / 2 - (L.compact ? 40 : 52)}>{BADGE_COPY.invalid}</Notice>
              <Notice L={L} o={alert2} y={screenH / 2 - (L.compact ? 40 : 52)}>Este rostro ya está inscrito en esta votación.</Notice>
            </div>
            {/* pantalla de la boleta */}
            <div className="absolute inset-0" style={{ transform: `translateY(${f2(ballotY)}%)`, visibility: ballotY >= 100 ? "hidden" : undefined }}>
              <BallotScreen L={L} press={press} />
            </div>
          </div>
        </Obj>

        {/* C: la boleta (sale del borde superior del teléfono: recorte medido) que se dobla en sobre */}
        <Obj pose={paperPose} w={L.paperW} h={L.paperH} style={{ perspective: 700, clipPath: clipBottom > 0 ? `inset(-40px -40px ${f2(clipBottom)}px -40px)` : undefined }}>
          <Paper L={L} fold={fold} seal={seal} />
        </Obj>
        <Obj pose={dupPose} w={L.paperW} h={L.paperH / 2}>
          <Envelope L={L} seal={1} />
          <span className="absolute -top-3 left-1/2 -translate-x-1/2" style={{ opacity: rejO, transform: `translateX(-50%) scale(${lerp(0.94, 1, rejO).toFixed(4)})` }}>
            <Badge tone="danger" className={cn("whitespace-nowrap shadow-card", L.compact ? "px-2 text-[0.625rem]" : "text-[0.75rem]")}>
              rechazado · mismo nullifier
            </Badge>
          </span>
        </Obj>

        {/* E: etiquetas y el golpe */}
        <Obj pose={tagPose} className="whitespace-nowrap">
          <span className="relative block">
            <span style={{ opacity: tagA }} className="block">
              <Badge tone="neutral" className={L.compact ? "px-2 text-[0.625rem]" : "text-[0.75rem]"}>copia descargada</Badge>
            </span>
            <span style={{ opacity: tagB }} className="absolute left-0 top-0 block">
              <Badge tone="success" className={L.compact ? "px-2 text-[0.625rem]" : "text-[0.75rem]"}>copia original</Badge>
            </span>
          </span>
        </Obj>
        <Obj pose={failPose} className="whitespace-nowrap">
          <StatusPill status="fallo detectado" size={L.compact ? "sm" : "md"} className="shadow-card" />
        </Obj>
        <Obj pose={{ y: -L.cardH / 2 - 4, s: lerp(0.94, 1, okBadge), o: okBadge }} className="whitespace-nowrap">
          <Badge tone="success" className={cn("shadow-card", L.compact ? "px-2 text-[0.625rem]" : "text-[0.75rem]")}>recalculado · igual</Badge>
        </Obj>
      </div>
    </div>
  );
}

function Brackets({ className, o }: { className: string; o: number }) {
  return (
    <span className="absolute inset-0" style={{ opacity: o }}>
      {[0, 1, 2, 3].map((k) => (
        <span key={k} className={cn("absolute size-4", className, k === 0 && "left-0 top-0 rounded-tl-md border-l-[3px] border-t-[3px]", k === 1 && "right-0 top-0 rounded-tr-md border-r-[3px] border-t-[3px]", k === 2 && "bottom-0 left-0 rounded-bl-md border-b-[3px] border-l-[3px]", k === 3 && "bottom-0 right-0 rounded-br-md border-b-[3px] border-r-[3px]")} />
      ))}
    </span>
  );
}

/** Aviso del teléfono: sube un poco al entrar; tono de error sereno, sin castigo. */
function Notice({ L, o, y, children }: { L: Layout; o: number; y: number; children: ReactNode }) {
  return (
    <Obj pose={{ y: y + lerp(8, 0, o), o }} w={L.phoneW - 2 * L.bezel - (L.compact ? 16 : 24)}>
      <span className={cn("flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger-soft font-semibold leading-snug text-danger-strong", L.compact ? "p-2 text-[0.625rem] [&_svg]:size-3.5" : "p-2.5 text-[0.75rem] [&_svg]:size-4")}>
        <XCircle aria-hidden="true" className="mt-px shrink-0" />
        {children}
      </span>
    </Obj>
  );
}

/** La boleta: mitad de arriba (bisagra al centro) que se dobla sobre la de abajo; su dorso es el sobre. */
function Paper({ L, fold, seal }: { L: Layout; fold: number; seal: number }) {
  const c = L.compact;
  return (
    <div className="relative size-full">
      <div className={cn("absolute inset-x-0 bottom-0 flex h-1/2 flex-col justify-center gap-1 rounded-b-md border border-t-0 border-border bg-card shadow-elevated", c ? "px-3" : "px-4")}>
        <span className={cn("flex items-center gap-1.5 font-semibold text-success-strong", c ? "text-[0.625rem] [&_svg]:size-3.5" : "text-[0.75rem] [&_svg]:size-4")}>
          <ShieldCheck aria-hidden="true" /> Prueba: estás en la lista
        </span>
        <span className={cn("q-mono text-muted-foreground", c ? "text-[0.5625rem]" : "text-[0.6875rem]")}>nullifier {NULLIFIER}</span>
      </div>
      <div className="absolute inset-x-0 top-0 h-1/2" style={{ transformStyle: "preserve-3d", transformOrigin: "50% 100%", transform: `rotateX(${f2(-178 * fold)}deg)` }}>
        <div className={cn("absolute inset-0 flex flex-col justify-center gap-0.5 rounded-t-md border border-b-0 border-border bg-card", c ? "px-3" : "px-4")} style={{ backfaceVisibility: "hidden" }}>
          <span className={cn("q-eyebrow", c ? "text-[0.5625rem]" : "text-[0.6875rem]")}>Boleta</span>
          <span className={cn("font-display font-semibold leading-tight", c ? "text-[1rem]" : "text-[1.25rem]")}>Sábado 14</span>
          <span className="absolute inset-x-3 bottom-0 border-b border-dashed border-input" />
        </div>
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateX(180deg)" }}>
          <Envelope L={L} seal={seal} />
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── La cadena (plano 3D) ───────────────────────── */

type Plane = { a: number; pitch: number; dx: number; py: number };

function planeAt(T: number, L: Layout): Plane {
  const a = keys(T, [[13.0, 70], [14.1, 62], [15.6, 56], [18.4, 56], [18.9, 50], [21.7, 50], [22.5, 22]]);
  const pitch = keys(T, [[13.0, L.pitch0], [14.2, L.pitch0], [15.6, L.pitch1], [21.7, L.pitch1], [22.5, 0]]);
  const py = keys(T, [[18.4, 0], [18.9, L.chainY], [21.7, L.chainY], [22.5, 0]]);
  return { a, pitch, dx: L.dx * (pitch / L.pitch1), py };
}

/** Pie del bloque `i` en el plano (antes de inclinarlo). */
const foot = (i: number, p: Plane) => ({ x: (i - 1.5) * p.dx, y: (i - 1.5) * p.pitch });

/** Proyección de un punto del plano (x, y) inclinado `a` grados, con la perspectiva del lienzo. */
function project(x: number, y: number, p: Plane, L: Layout) {
  const r = (p.a * Math.PI) / 180;
  const z = y * Math.sin(r);
  const f = L.d / (L.d - z);
  return { x: x * f, y: (p.py + y * Math.cos(r)) * f, f };
}

/** Centro en pantalla del bloque `i` (de pie); `k` = fracción de altura sobre el pie (0,5 = centro, 1 = borde de arriba). */
function blockCenter(i: number, p: Plane, L: Layout, k = 0.5) {
  const ft = foot(i, p);
  const q = project(ft.x, ft.y, p, L);
  return { x: q.x, y: q.y - L.blockH * k * q.f, f: q.f };
}

function linkMid(i: number, p: Plane, L: Layout) {
  const a = foot(i, p), b = foot(i + 1, p);
  return project((a.x + b.x) / 2, (a.y + b.y) / 2, p, L);
}

function Chain({ T, L, plane, red, brk, sag, stale }: { T: number; L: Layout; plane: Plane; red: number; brk: number; sag: number; stale: (i: number) => number }) {
  const gather = (i: number) => 1 - leave(seg(T, 21.8 + 0.05 * i, 22.15 + 0.05 * i));
  const blockO = (i: number) => Math.min(i === 3 ? presence(T, 13.8, 14.1) : presence(T, 13.1 + 0.18 * i, 13.45 + 0.18 * i), gather(i));
  const fall = (i: number) => (i === 3 ? 0 : lerp(-70, 0, arrive(seg(T, 13.1 + 0.18 * i, 13.55 + 0.18 * i))));
  const linkS = (i: number) => (i === 2 ? arrive(seg(T, 14.0, 14.35)) : arrive(seg(T, 13.55 + 0.15 * i, 13.95 + 0.15 * i)));
  if (T < 13.0 || T > 22.6) return null;
  return (
    <div className="absolute left-1/2 top-1/2 size-0" style={{ transformStyle: "preserve-3d", transform: `translate3d(0, ${f2(plane.py)}px, 0) rotateX(${f2(plane.a)}deg)` }}>
      {[0, 1, 2].map((i) => {
        const a = foot(i, plane), b = foot(i + 1, plane);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        const o = Math.min(blockO(i), blockO(i + 1)) > 0.5 ? gather(i) : 0;
        const broken = i === 1 ? brk : 0;
        return (
          <div key={`l${i}`} className="absolute left-0 top-0" style={{ width: len, height: 6, transformOrigin: "0 50%", transform: `translate3d(${f2(a.x)}px, ${f2(a.y - 3)}px, 0) rotateZ(${f2(ang)}deg)`, opacity: o }}>
            <span className="absolute inset-0 origin-left rounded-full bg-primary" style={{ transform: `scaleX(${linkS(i).toFixed(4)})`, opacity: 1 - broken }} />
            {i === 1 ? (
              <>
                <span className="absolute left-0 top-0 h-full w-1/2 origin-left rounded-full bg-danger" style={{ opacity: broken, transform: `rotateZ(${f2(-32 * broken)}deg) translateX(${f2(-3 * broken)}px)` }} />
                <span className="absolute right-0 top-0 h-full w-1/2 origin-right rounded-full bg-danger" style={{ opacity: broken, transform: `rotateZ(${f2(32 * broken)}deg) translateX(${f2(3 * broken)}px)` }} />
              </>
            ) : null}
          </div>
        );
      })}
      {[0, 1, 2, 3].map((i) => {
        const ft = foot(i, plane);
        const o = blockO(i);
        const down = i >= 2 ? sag : 0;
        return (
          <div
            key={i}
            className="absolute left-0 top-0"
            style={{
              width: L.blockW,
              height: L.blockH,
              transformOrigin: "50% 100%",
              transform: `translate3d(${f2(ft.x - L.blockW / 2)}px, ${f2(ft.y - L.blockH)}px, 0) rotateX(${f2(-plane.a)}deg) translateY(${f2(fall(i) + down * 8)}px) rotateZ(${f2(down * (i === 2 ? 3 : -2.5))}deg)`,
              opacity: o,
              visibility: o <= 0.002 ? "hidden" : undefined,
            }}
          >
            <Block L={L} i={i} red={i === 1 ? red : 0} stale={i >= 2 ? stale(i) : 0} hashShift={i === 1 ? red : 0} />
          </div>
        );
      })}
    </div>
  );
}
