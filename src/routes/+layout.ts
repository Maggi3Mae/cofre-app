// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
export const ssr = false;

import { esDemo } from "$lib/demo/modo";

// Demostración: la primera vez se llena la base aparte con datos inventados, antes de mostrar nada.
export async function load() {
  if (esDemo) await (await import("$lib/demo/sembrar")).sembrarSiVacia();
}
