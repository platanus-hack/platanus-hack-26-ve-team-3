import type { CSSProperties, ReactNode } from "react";
import { CheckCircle2, IdCard, Lock, QrCode, ScanFace, Server, ShieldCheck, Shuffle, UserPlus, Vote } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { Badge, FixtureTag } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/client/cn";
import { arrive, lerp, leave, local, presence, seg, shake, travel } from "./motion";

/** Lienzo fijo de 320×330 px; el contenedor lo escala con `--s` (estático por breakpoint, nunca animado). */
export const STAGE_W = 320;
export const STAGE_H = 330;

type Box = { x: number; y: number; w: number; h?: number };

function Obj({ box, o = 1, tx = 0, ty = 0, s = 1, r = 0, origin, className, children }: { box: Box; o?: number; tx?: number; ty?: number; s?: number; r?: number; origin?: string; className?: string; children?: ReactNode }) {
  const style: CSSProperties = {
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    opacity: o,
    transform: `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${s.toFixed(4)}) rotate(${r.toFixed(2)}deg)`,
    transformOrigin: origin,
  };
  return (
    <div className={cn("absolute", className)} style={style}>
      {children}
    </div>
  );
}

/* Cadena: 4 bloques de 62×80, separados 18 px, centrados. */
const BW = 62, BH = 80, GAP = 18, BY = 44;
const bx = (i: number) => (STAGE_W - (4 * BW + 3 * GAP)) / 2 + i * (BW + GAP);
const BLOCKS = [
  { n: 1, icon: UserPlus, hash: "a17f" },
  { n: 2, icon: Vote, hash: "9f2c" },
  { n: 3, icon: UserPlus, hash: "3b80" },
  { n: 4, icon: Vote, hash: "d4e1" },
] as const;

/* Teléfono: 140×236; centrado en el beat 1, a la izquierda en 2–3. */
const PHONE: Box = { x: 90, y: 46, w: 140, h: 236 };
const SLOT: Box = { x: 176, y: 62, w: 132, h: 136 };
const SEAL: Box = { x: 30, y: 178, w: 260, h: 76 };

export function Stage({ p }: { p: number }) {
  const u = [0, 1, 2, 3, 4, 5].map((i) => local(p, i));
  const [u1, u2, u3, u4, u5, u6] = u;

  // Teléfono
  const phoneX = lerp(0, -70, travel(seg(u2, 0, 0.3))) + lerp(0, -24, leave(seg(u4, 0, 0.3)));
  const phoneO = 1 - leave(seg(u4, 0.02, 0.24));
  const phoneS = lerp(1, 0.94, leave(seg(u4, 0, 0.3)));

  // Beat 1: QR + credencial
  const qrO = 1 - leave(seg(u1, 0.5, 0.62));
  const scanO = presence(u1, 0, 0.06, 0.45, 0.52);
  const scanY = lerp(0, 76, travel(seg(u1, 0.06, 0.45)));
  const badgeO = Math.min(presence(u1, 0.5, 0.68), 1 - leave(seg(u2, 0, 0.14)));
  const badgeY = lerp(10, 0, arrive(seg(u1, 0.5, 0.68))) - lerp(0, 8, seg(u2, 0, 0.14));

  // Beat 2: rostro → huella cifrada → servidor
  const faceO = Math.min(presence(u2, 0.08, 0.24), 1 - leave(seg(u3, 0, 0.12)));
  const frameS = lerp(1.18, 1, travel(seg(u2, 0.1, 0.38)));
  const turnO = presence(u2, 0.12, 0.24, 0.38, 0.46);
  const okO = Math.min(presence(u2, 0.4, 0.5), faceO);
  const serverO = Math.min(presence(u2, 0.3, 0.45), 1 - leave(seg(u3, 0, 0.16)));
  const serverX = lerp(12, 0, arrive(seg(u2, 0.3, 0.45)));
  const chipT = travel(seg(u2, 0.5, 0.8));
  const chipO = Math.min(presence(u2, 0.42, 0.5), 1 - leave(seg(u3, 0, 0.14)));
  const chipX = lerp(0, 152, chipT);
  const chipY = lerp(0, -72, chipT) - Math.sin(chipT * Math.PI) * 26;

  // Beat 3: voto + prueba + nullifier
  const voteO = presence(u3, 0.1, 0.24);
  const press = 1 - 0.04 * Math.sin(Math.PI * seg(u3, 0.28, 0.38));
  const ballotIn = travel(seg(u3, 0.38, 0.58));
  const ballotO = Math.min(presence(u3, 0.38, 0.52), 1 - seg(u4, 0.36, 0.52));
  const morph = travel(seg(u4, 0.1, 0.5));
  const ballotX = lerp(-64, 0, ballotIn) + lerp(0, bx(3) + BW / 2 - (SLOT.x + SLOT.w / 2), morph);
  const ballotY = lerp(0, BY + 64 + BH / 2 - (SLOT.y + (SLOT.h ?? 0) / 2), morph);
  const ballotS = lerp(0.92, 1, ballotIn) * lerp(1, 0.5, morph);
  const dupIn = arrive(seg(u3, 0.6, 0.74));
  const dupO = presence(u3, 0.6, 0.72, 0.9, 0.98);
  const dupX = lerp(-40, 0, dupIn) + shake(seg(u3, 0.74, 0.88), 3);
  const rejO = presence(u3, 0.72, 0.8);

  // Beat 4: cadena
  // La cadena entra centrada (beat 4) y sube para dejarle sitio al ancla (beat 5).
  const chainDY = lerp(64, 0, travel(seg(u5, 0, 0.3)));
  const blockO = (i: number) => (i === 3 ? presence(u4, 0.38, 0.52) : presence(u4, 0.2 + i * 0.07, 0.34 + i * 0.07));
  const blockX = (i: number) => (i === 3 ? 0 : lerp(-14, 0, arrive(seg(u4, 0.2 + i * 0.07, 0.36 + i * 0.07))));
  const blockS = (i: number) => (i === 3 ? lerp(0.92, 1, arrive(seg(u4, 0.38, 0.56))) : 1);
  const linkS = (i: number) => (i === 2 ? arrive(seg(u4, 0.52, 0.64)) : arrive(seg(u4, 0.3 + i * 0.07, 0.42 + i * 0.07)));
  const captionO = Math.min(presence(u4, 0.62, 0.76), 1 - leave(seg(u6, 0.3, 0.4)));

  // Beat 5: hash final → ancla
  const hashT = travel(seg(u5, 0.12, 0.5));
  const hashO = Math.min(presence(u5, 0.04, 0.14), 1 - leave(seg(u5, 0.5, 0.6)));
  const sealO = presence(u5, 0.3, 0.5);
  const sealY = lerp(10, 0, arrive(seg(u5, 0.3, 0.5)));
  const markT = arrive(seg(u5, 0.5, 0.72));

  // Beat 6: copia alterada → fallo detectado; sorteo recomputado
  const copyO = presence(u6, 0.02, 0.14);
  const tamperO = arrive(seg(u6, 0.14, 0.28));
  const staleO = (i: number) => arrive(seg(u6, 0.26 + (i - 2) * 0.06, 0.36 + (i - 2) * 0.06));
  const breakT = arrive(seg(u6, 0.32, 0.5));
  const failO = presence(u6, 0.44, 0.56);
  const failX = shake(seg(u6, 0.56, 0.74), 4);
  const drawO = presence(u6, 0.72, 0.86);
  const drawY = lerp(8, 0, arrive(seg(u6, 0.72, 0.86)));

  return (
    <div aria-hidden="true" className="relative select-none" style={{ width: STAGE_W, height: STAGE_H }}>
      <Obj box={{ x: 252, y: 6, w: 64 }} className="flex justify-end">
        <FixtureTag className="px-2 text-[0.6875rem]">ejemplo</FixtureTag>
      </Obj>

      {/* Beat 3 (detrás del teléfono: sale de él): boleta con prueba y nullifier; segundo voto rechazado */}
      <Obj box={SLOT} o={ballotO} tx={ballotX} ty={ballotY} s={ballotS} className="flex flex-col gap-1.5 rounded-lg border-2 border-primary bg-card p-3 shadow-elevated">
        <span className="q-eyebrow text-[0.625rem]">Boleta</span>
        <span className="text-[0.75rem] font-semibold">Sábado 14</span>
        <span className="flex items-start gap-1 text-[0.625rem] leading-tight text-success-strong">
          <ShieldCheck className="size-3.5 shrink-0" /> Prueba: está en la lista
        </span>
        <span className="text-[0.625rem] text-muted-foreground">nullifier</span>
        <span className="q-mono -mt-1 text-[0.625rem] font-semibold">0x7c2e…a91</span>
      </Obj>
      <Obj box={{ x: 178, y: 212, w: 128 }} o={dupO} tx={dupX} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2.5 shadow-card">
        <span className="text-[0.6875rem] font-semibold">Segundo voto</span>
        <span className="q-mono text-[0.5625rem] text-muted-foreground">mismo nullifier</span>
        <Badge tone="danger" className="self-start px-2 text-[0.625rem]" style={{ opacity: rejO }}>
          rechazado
        </Badge>
      </Obj>

      {/* ── Teléfono ── */}
      <Obj box={PHONE} o={phoneO} tx={phoneX} s={phoneS} className="rounded-[26px] border-2 border-foreground/80 bg-card shadow-elevated">
        <span className="absolute left-1/2 top-2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-foreground/15" />
        {/* Beat 1 */}
        <Obj box={{ x: 30, y: 40, w: 80, h: 80 }} o={qrO} className="grid place-items-center text-foreground">
          <QrCode className="size-[76px]" strokeWidth={1.6} />
        </Obj>
        <Obj box={{ x: 24, y: 40, w: 92, h: 3 }} o={scanO} ty={scanY} className="rounded-full bg-primary shadow-primary" />
        <Obj box={{ x: 8, y: 132, w: 124 }} o={qrO} className="text-center text-[0.6875rem] font-semibold text-muted-foreground">
          QR de la sala
        </Obj>
        <Obj box={{ x: 8, y: 56, w: 124 }} o={badgeO} ty={badgeY} className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-2.5">
          <IdCard className="size-6 text-primary-ink" />
          <span className="text-[0.6875rem] font-semibold leading-tight">Credencial del evento</span>
          <span className="q-mono text-[0.5625rem] text-muted-foreground">26-ve/id/tu-usuario</span>
          <Badge tone="success" className="self-start px-2 text-[0.625rem]">
            1 uso
          </Badge>
        </Obj>
        {/* Beat 2 */}
        <Obj box={{ x: 22, y: 42, w: 96, h: 96 }} o={faceO} s={frameS}>
          <span className="absolute left-0 top-0 size-4 rounded-tl-md border-l-[3px] border-t-[3px] border-primary" />
          <span className="absolute right-0 top-0 size-4 rounded-tr-md border-r-[3px] border-t-[3px] border-primary" />
          <span className="absolute bottom-0 left-0 size-4 rounded-bl-md border-b-[3px] border-l-[3px] border-primary" />
          <span className="absolute bottom-0 right-0 size-4 rounded-br-md border-b-[3px] border-r-[3px] border-primary" />
        </Obj>
        <Obj box={{ x: 38, y: 58, w: 64, h: 64 }} o={faceO} className="text-foreground">
          <ScanFace className="size-16" strokeWidth={1.5} />
        </Obj>
        <Obj box={{ x: 100, y: 34, w: 22, h: 22 }} o={okO} s={lerp(0.9, 1, arrive(seg(u2, 0.4, 0.5)))} className="grid place-items-center rounded-full bg-card text-success">
          <CheckCircle2 className="size-5" />
        </Obj>
        <Obj box={{ x: 6, y: 150, w: 128 }} o={turnO} className="text-center text-[0.6875rem] font-semibold text-muted-foreground">
          Gira un poco la cabeza
        </Obj>
        {/* Beat 3 */}
        <Obj box={{ x: 10, y: 34, w: 120 }} o={voteO} className="flex flex-col gap-1.5">
          <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">Fecha de la asamblea</span>
          <span className="rounded-md border-2 border-primary bg-card px-2 py-1.5 text-[0.6875rem] font-semibold">Sábado 14</span>
          <span className="rounded-md border border-border bg-card px-2 py-1.5 text-[0.6875rem] text-muted-foreground">Domingo 15</span>
        </Obj>
        <Obj box={{ x: 8, y: 150, w: 124 }} o={voteO} s={press}>
          <span className={cn(buttonVariants({ size: "sm", full: true }), "pointer-events-none px-2 text-[0.6875rem]")}>Votar: Sábado 14</span>
        </Obj>
      </Obj>

      {/* Beat 2: servidor + huella cifrada */}
      <Obj box={{ ...SLOT, h: 128 }} o={serverO} tx={serverX} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-card">
        <span className="flex items-center gap-1.5 text-[0.75rem] font-semibold">
          <Server className="size-4 text-primary-ink" /> Servidor
        </span>
        <span className="h-7 rounded-md border border-dashed border-input" />
        <span className="mt-auto flex items-baseline gap-1.5">
          <span className="q-num text-[1.375rem] font-semibold leading-none">0</span>
          <span className="text-[0.6875rem] text-muted-foreground">fotos guardadas</span>
        </span>
      </Obj>
      <Obj box={{ x: 30, y: 200, w: 116, h: 26 }} o={chipO} tx={chipX} ty={chipY} className="flex items-center gap-1.5 rounded-full border border-primary/60 bg-card px-2.5 shadow-primary">
        <Lock className="size-3.5 text-primary-ink" />
        <span className="q-mono text-[0.625rem] font-semibold">huella cifrada</span>
      </Obj>

      {/* Beat 4: cadena de hashes (grupo que sube en el beat 5) */}
      <Obj box={{ x: 9, y: 12, w: 200 }} o={copyO}>
        <Badge tone="neutral" className="px-2 text-[0.6875rem]">
          copia descargada
        </Badge>
      </Obj>
      <div className="absolute inset-0" style={{ transform: `translate3d(0, ${chainDY.toFixed(2)}px, 0)` }}>
      {[0, 1, 2].map((i) => (
        <div key={`l${i}`}>
          <Obj box={{ x: bx(i) + BW, y: BY + BH / 2 - 1.5, w: GAP, h: 3 }} o={1 - (i >= 1 ? breakT : 0)}>
            <span className="absolute inset-0 origin-left rounded-full bg-primary" style={{ transform: `scaleX(${linkS(i).toFixed(4)})` }} />
          </Obj>
          {i >= 1 ? (
            <>
              <Obj box={{ x: bx(i) + BW, y: BY + BH / 2 - 1.5, w: GAP / 2, h: 3 }} o={breakT} r={lerp(0, -38, breakT)} tx={lerp(0, -2, breakT)} origin="left center" className="rounded-full bg-danger" />
              <Obj box={{ x: bx(i) + BW + GAP / 2, y: BY + BH / 2 - 1.5, w: GAP / 2, h: 3 }} o={breakT} r={lerp(0, 38, breakT)} tx={lerp(0, 2, breakT)} origin="right center" className="rounded-full bg-danger" />
            </>
          ) : null}
        </div>
      ))}
      {BLOCKS.map((b, i) => {
        const Icon = b.icon;
        return (
          <Obj key={b.n} box={{ x: bx(i), y: BY, w: BW, h: BH }} o={blockO(i)} tx={blockX(i)} s={blockS(i)} className={cn("flex flex-col items-center justify-between rounded-md border bg-card py-2 shadow-card", i === 3 ? "border-2 border-primary" : "border-border")}>
            <span className="q-num text-[0.6875rem] font-semibold text-muted-foreground">#{b.n}</span>
            <Icon className={cn("size-5", i === 3 ? "text-primary-ink" : "text-foreground")} />
            <span className="q-mono text-[0.625rem] font-semibold">{b.hash}</span>
            {i === 1 ? (
              <span className="absolute inset-0 flex flex-col items-center justify-between rounded-md border-2 border-danger bg-danger-soft py-2 text-danger-strong" style={{ opacity: tamperO }}>
                <span className="q-num text-[0.6875rem] font-semibold">#2</span>
                <Icon className="size-5" />
                <span className="q-mono text-[0.625rem] font-semibold">e01a</span>
              </span>
            ) : null}
            {i >= 2 ? <span className="absolute -inset-px rounded-md border-2 border-danger/70" style={{ opacity: staleO(i) }} /> : null}
          </Obj>
        );
      })}
      <Obj box={{ x: 9, y: 134, w: 302 }} o={captionO} className="text-center">
        <span className="q-mono text-[0.625rem] text-muted-foreground">cada bloque guarda el hash del anterior</span>
      </Obj>

      {/* Beat 6: fallo detectado */}
      <Obj box={{ x: 9, y: 132, w: 302 }} o={failO} tx={failX} className="flex items-center justify-center gap-2">
        <span className="text-[0.75rem] font-semibold">Cadena del registro</span>
        <StatusPill status="fallo detectado" size="sm" />
      </Obj>
      </div>

      {/* Beat 5: hash final → ancla en Base Sepolia */}
      <Obj box={{ x: bx(3) + BW / 2 - 50, y: BY + BH + 6, w: 100, h: 24 }} o={hashO} tx={lerp(0, SEAL.x + 36 - (bx(3) + BW / 2 - 50), hashT)} ty={lerp(chainDY, SEAL.y + 26 - (BY + BH + 6), hashT)} s={lerp(1, 0.9, hashT)} className="flex items-center justify-center rounded-full border border-primary/60 bg-card shadow-primary">
        <span className="q-mono text-[0.625rem] font-semibold">final d4e1…</span>
      </Obj>
      <Obj box={SEAL} o={sealO} ty={sealY} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 shadow-elevated">
        <span className="grid size-11 shrink-0 place-items-center" style={{ opacity: markT, transform: `scale(${lerp(0.9, 1, markT).toFixed(4)})` }}>
          <LogoMark size={40} knockout="var(--color-card)" className="text-foreground" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold">Ancla on-chain</span>
          <span className="text-[0.6875rem] text-muted-foreground">Base Sepolia · QuorumRegistry</span>
          <span className="q-mono text-[0.625rem] font-semibold">0x64e7…be13</span>
        </span>
      </Obj>

      {/* Beat 6: sorteo recomputado (copia original) */}
      <Obj box={{ x: 9, y: 268, w: 302 }} o={drawO} ty={drawY} className="flex items-center justify-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-card">
        <Shuffle className="size-4 text-primary-ink" />
        <span className="text-[0.6875rem] font-semibold">Copia original · Sorteo recomputado</span>
        <Badge tone="success" className="px-2 text-[0.625rem]">
          igual
        </Badge>
      </Obj>
    </div>
  );
}
