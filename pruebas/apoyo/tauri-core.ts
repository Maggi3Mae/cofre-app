// Sustituto de @tauri-apps/api/core: en las pruebas no hay Rust detrás.
export async function invoke(): Promise<never> { throw new Error("invoke no está disponible en las pruebas"); }
