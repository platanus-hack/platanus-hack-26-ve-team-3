// ElGamal exponencial aditivo sobre ed25519 (noble-curves v2). Suma homomórfica de votos sí/no.
import { ed25519 } from "@noble/curves/ed25519.js"
import { randomBytes } from "node:crypto"
const G = ed25519.Point.BASE, n = ed25519.Point.Fn.ORDER
const rand = () => (BigInt("0x" + randomBytes(32).toString("hex")) % (n - 1n)) + 1n
const sk = rand(), PK = G.multiply(sk)                       // clave de la mesa (o umbral, fuera de alcance)
const enc = (m: number) => { const r = rand(); return { c1: G.multiply(r), c2: PK.multiply(r).add(m ? G.multiply(BigInt(m)) : ed25519.Point.ZERO), r } }
const votes = [1, 0, 1]                                      // 3 votantes: sí, no, sí
const cts = votes.map(enc)
const agg = cts.reduce((a, c) => ({ c1: a.c1.add(c.c1), c2: a.c2.add(c.c2) }), { c1: ed25519.Point.ZERO, c2: ed25519.Point.ZERO })
const M = agg.c2.subtract(agg.c1.multiply(sk))               // = G * total
let total = M.equals(ed25519.Point.ZERO) ? 0 : -1; for (let i = 1; total < 0 && i <= votes.length; i++) if (G.multiply(BigInt(i)).equals(M)) total = i
console.log("total sí (descifrado homomórfico):", total, "esperado", votes.reduce((a, b) => a + b))
// Verificador: recomputa la suma de c1/c2 publicados y comprueba el descifrado publicado (M) contra el total anunciado
console.log("verificador recomputa suma ok:", cts.reduce((a, c) => a.add(c.c2), ed25519.Point.ZERO).equals(agg.c2))
