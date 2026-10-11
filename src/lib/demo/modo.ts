// Modo demostración (`npm run demo`): base aparte con datos inventados, sin sincronización,
// revisión diaria, copias ni correos. `npm run demo -- --celular` además fuerza la vista de celular.
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
export const esDemo = env.VITE_COFRE_DEMO === "1";
export const demoCelular = esDemo && env.VITE_COFRE_CELULAR === "1";
