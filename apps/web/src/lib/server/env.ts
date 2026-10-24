/** Lectura centralizada de variables de entorno del servidor. Sin valores por defecto secretos. */

function str(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export const env = {
  get appUrl(): string {
    // En Render, RENDER_EXTERNAL_URL trae la URL pública del servicio (sirve para el joinUrl del QR).
    return (str("APP_URL") ?? str("RENDER_EXTERNAL_URL") ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get dataDir(): string {
    return str("DATA_DIR") ?? ".data";
  },
  /** `memory` fuerza el store en memoria (tests). */
  get storeKind(): "json" | "memory" {
    return str("QUORUM_STORE") === "memory" ? "memory" : "json";
  },
  get chainId(): number {
    const n = Number(str("NEXT_PUBLIC_CHAIN_ID") ?? "84532");
    return Number.isFinite(n) ? n : 84532;
  },
  get rpcUrl(): string | undefined {
    return str("BASE_SEPOLIA_RPC");
  },
  get faceThreshold(): number {
    const n = Number(str("FACE_THRESHOLD") ?? "0.6");
    return Number.isFinite(n) ? n : 0.6;
  },
  /** Umbral de similitud coseno para rechazar un rostro ya inscrito en la misma elección (dedupe 1:N). */
  get faceDedupeThreshold(): number {
    const n = Number(str("FACE_DEDUPE_THRESHOLD") ?? "0.75");
    return Number.isFinite(n) ? n : 0.75;
  },
  /** Clave del organizador para anclar en Base Sepolia. Solo servidor; sin ella el ancla queda deshabilitada. */
  get organizerPrivateKey(): `0x${string}` | undefined {
    const v = str("ORGANIZER_PRIVATE_KEY");
    return v && /^0x[0-9a-fA-F]{64}$/.test(v) ? (v as `0x${string}`) : undefined;
  },
  get registryAddress(): string | undefined {
    const v = str("NEXT_PUBLIC_REGISTRY_ADDRESS");
    return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? v : undefined;
  },
  get faceKey(): string | undefined {
    return str("FACE_KEY");
  },
  get aiGatewayKey(): string | undefined {
    return str("AI_GATEWAY_API_KEY");
  },
  get kapsoWebhookSecret(): string | undefined {
    return str("KAPSO_WEBHOOK_SECRET");
  },
  /** Variables del adaptador de notificaciones (se pasan tal cual a @quorum/notify). */
  get notify() {
    return {
      INVITE_CHANNEL: str("INVITE_CHANNEL"),
      INVITE_SEND_APPROVED: str("INVITE_SEND_APPROVED"),
      KAPSO_API_KEY: str("KAPSO_API_KEY"),
      KAPSO_PHONE_NUMBER_ID: str("KAPSO_PHONE_NUMBER_ID"),
      KAPSO_TEMPLATE: str("KAPSO_TEMPLATE"),
      META_ACCESS_TOKEN: str("META_ACCESS_TOKEN"),
      META_PHONE_NUMBER_ID: str("META_PHONE_NUMBER_ID"),
    };
  },
};

/** TTL del nonce de voto emitido por face/enroll y face/verify. */
export const VOTE_NONCE_TTL_MS = 2 * 60 * 1000;
/** Con menos de este número de votos no se desglosa por opción. */
export const MIN_VOTES_FOR_BREAKDOWN = 5;
