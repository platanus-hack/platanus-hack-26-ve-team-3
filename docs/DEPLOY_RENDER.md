# Despliegue en Render (todo en un solo servicio)

Quórum corre completo (páginas + API) como **un Web Service de Node** en Render con un **disco persistente** para los datos (`DATA_DIR=/var/data`). La configuración vive en `render.yaml` (Blueprint).

## Cómo se actualiza
- Cualquier push a `main` (de cualquiera de los tres) → Render construye y despliega solo.
- Las ramas se integran por PR; el merge a `main` es el deploy.
- Al usar disco persistente, Render despliega sin réplica paralela: cada deploy tiene unos segundos de corte. No hacer push a `main` durante la demo.

## Variables
- No secretas: en `render.yaml` (incluidas las `NEXT_PUBLIC_*`, que se incrustan en el build).
- `FACE_KEY`: la genera Render (`generateValue`). No cambiarla durante una inscripción abierta: invalida las plantillas faciales cifradas.
- `ORGANIZER_PRIVATE_KEY`: se pega a mano en Render → Environment (clave de testnet con ETH de faucet). Sin ella, el cierre no ancla y el verificador lo marca "no evaluado".
- `NEXT_PUBLIC_BASE_SEPOLIA_RPC`: RPC público que el verificador del navegador usa para leer el ancla. Sin él, «Verificar ahora» y «Mi voto está» marcan `anchor_matches` como «no evaluado» en el teléfono. Va al bundle: solo URLs públicas.
- `APP_URL`: opcional; si falta se usa `RENDER_EXTERNAL_URL` (la URL pública del servicio) para el QR de la sala.

## Datos
- Un solo servicio y una sola instancia: el store JSON y el bloqueo en proceso son correctos así. No escalar a más instancias sin cambiar el store.
- Backups: snapshots diarios del disco de Render.

## Logs
Render → servicio `quorum` → Logs (o `render logs` con la CLI).
