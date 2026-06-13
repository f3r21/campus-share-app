import { defineConfig } from 'vitest/config';

// Configuración de Vitest para el backend.
// - globals: true => expone describe/it/expect/beforeAll/afterAll sin importar
//   desde 'vitest', de modo que los tests puedan seguir siendo CommonJS y usar
//   require('../server') para cargar la app Express.
// - environment node: API HTTP, sin DOM.
// - timeouts amplios: initDb() puede crear el esquema y sembrar datos.
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 30000,
        hookTimeout: 60000
    }
});
