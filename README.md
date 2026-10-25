# Quórum — team-3 · Platanus Hack 26: Caracas ft. Yummy

<img src="./project-logo.png" alt="Quórum" width="200" />

**Nadie tiene que creerle a quien cuenta.**

Track: 🛡️ Trust

team-3

- Jose Gregorio Galvis Rivas ([@josegalvis27](https://github.com/josegalvis27))
- Jesus Galvis ([@jgalvis414](https://github.com/jgalvis414))
- César Augusto Gorge Gonzalez ([@cesargorge](https://github.com/cesargorge))

**Demo en vivo:** https://quorum-sefw.onrender.com · **Descripción:** [`project-description.md`](./project-description.md)

## Qué es

Infraestructura de confianza para decisiones colectivas. Cada voto trae una prueba matemática (Semaphore v4) de que lo emitió alguien del padrón, sin revelar quién; el registro de boletas va encadenado con hashes y el cierre se ancla en Base Sepolia. Un **verificador independiente**, que no toca la base de datos del organizador, recalcula padrón, pruebas, unicidad, cadena, recuento y ancla, y falla con causa concreta si alguien tocó algo. Lo que no garantizamos está escrito en [`docs/KNOWN_LIMITATIONS.md`](./docs/KNOWN_LIMITATIONS.md).

## La demo

Una **elección presidencial ficticia** (candidatos inventados, sin partidos ni nombres reales, sin premios) en la que todo el público vota desde su teléfono y el jurado hace de auditor:

abrir la elección y proyectar el QR → entrar con alias y prueba de vida → votar en dos toques → escrutinio en vivo → cerrar y anclar → el jurado verifica el paquete sin confiar en nosotros → alteramos una copia (quitar una boleta, inflar un candidato) y el verificador detecta el fraude.

## Correr en local

Requiere Node 22 y pnpm 10.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # sin claves funciona en modo demo (invitaciones dry-run, sin ancla)
pnpm dev                                        # http://localhost:3000
pnpm verify                                     # typecheck + lint + tests + build
```

## Verificar un paquete de auditoría sin confiar en el servidor

```bash
pnpm --filter @quorum/verifier verify packages/demo-fixtures/protocol/valid.json --pretty
pnpm --filter @quorum/verifier verify packages/demo-fixtures/protocol/tampered_total.json --pretty   # fallo detectado
```

El verificador (`apps/verifier`) no importa la app ni lee la base de datos: recomputa raíz del padrón, pruebas, nullifiers, cadena, recuento y ancla, y falla con causa concreta.

## Estructura

| Ruta | Qué hay |
|---|---|
| `apps/web` | Next.js: landing, organizador, sala por QR, boleta, escrutinio en vivo, transparencia, laboratorio de auditoría |
| `apps/verifier` | Verificador independiente (CLI y librería) |
| `packages/protocol-adapter` | Adaptador Semaphore v4 + ledger encadenado + paquete de auditoría |
| `packages/contracts` | Tipos y esquemas Zod del contrato de API |
| `packages/demo-fixtures` | Paquetes legítimos y adulterados (etiquetados como fixture) |
| `packages/wallet`, `packages/notify`, `packages/ui` | Smart wallet embebida, invitaciones, componentes |
| `contracts/QuorumRegistry.sol` | Contrato del ancla en Base Sepolia |
| `docs/` | Spec, ADR del motor, modelo de amenazas, limitaciones, resultados de pruebas, guion de demo |

Spec maestra: [`QUORUM_HACKATHON_TRUST_ECC_MASTER.md`](./QUORUM_HACKATHON_TRUST_ECC_MASTER.md).

## Repositorios y despliegue

El código se desarrolla en `josegalvis27/quorum-hackathon` (desde donde despliega Render) y se refleja en este repositorio de la organización con cada `git push`.
