// Pruebas de integración de la API con supertest contra la app importada.
//
// Requisitos del entorno (los provee CI o el desarrollador):
//   - DATABASE_URL apuntando a un Postgres desechable.
//   - JWT_SECRET definido (para firmar/verificar tokens).
//
// La app se importa SIN arrancar el listener (require.main !== module). Aquí
// llamamos a initDb() en beforeAll y cerramos el pool en afterAll.

// describe/it/expect/beforeAll/afterAll se exponen como globales vía
// vitest.config.js (test.globals = true), de modo que este archivo pueda seguir
// siendo CommonJS y cargar la app con require('../server').
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { app, pool, initDb } = require('../server');

// initDb puede crear el esquema y sembrar datos en una BD nueva: dale margen.
const SETUP_TIMEOUT_MS = 60000;

beforeAll(async () => {
    await initDb();
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
    await pool.end();
});

describe('healthcheck', () => {
    it('GET /api responde 200', async () => {
        const res = await request(app).get('/api');
        expect(res.status).toBe(200);
    });
});

describe('catálogo (careers / courses)', () => {
    it('GET /api/careers devuelve un array de 6 carreras', async () => {
        const res = await request(app).get('/api/careers');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(6);
    });

    it('GET /api/courses?career_id=1 devuelve un array', async () => {
        const res = await request(app).get('/api/courses').query({ career_id: 1 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        for (const course of res.body) {
            expect(course.career_id).toBe(1);
        }
    });
});

describe('POST /api/auth/google', () => {
    it('responde 400 cuando falta el credential', async () => {
        const res = await request(app).post('/api/auth/google').send({});
        expect(res.status).toBe(400);
    });

    it('rechaza un credential falso (no devuelve 200/token)', async () => {
        const res = await request(app)
            .post('/api/auth/google')
            .send({ credential: 'bogus.token.value' });
        // Sin GOOGLE_CLIENT_ID => 503 (no configurado). Con GOOGLE_CLIENT_ID
        // definido => 401 (token inválido). Nunca debe iniciar sesión.
        expect([401, 503]).toContain(res.status);
        expect(res.status).not.toBe(200);
        expect(res.body.token).toBeUndefined();
    });
});

describe('materiales (rutas protegidas)', () => {
    let token;
    let materialId;

    beforeAll(async () => {
        // Simula un login creando un usuario y firmando un JWT como lo hace
        // /api/auth/google. Email único para no chocar entre ejecuciones.
        const email = `tester_${Date.now()}@ucsp.edu.pe`;
        const user = (await pool.query(
            'INSERT INTO users (email) VALUES ($1) RETURNING id, email',
            [email]
        )).rows[0];
        token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET);
    }, SETUP_TIMEOUT_MS);

    it('POST /api/materials sube un material (multipart) -> 201', async () => {
        const res = await request(app)
            .post('/api/materials')
            .set('Authorization', `Bearer ${token}`)
            .field('course_id', '1')
            .field('title', 'Apuntes de prueba')
            .field('description', 'Material generado por el test')
            .attach('file', Buffer.from('%PDF-1.4 test pdf content'), {
                filename: 'apuntes.pdf',
                contentType: 'application/pdf'
            });

        expect(res.status).toBe(201);
        expect(res.body.id).toBeDefined();
        expect(res.body.title).toBe('Apuntes de prueba');
        materialId = res.body.id;
    });

    it('GET /api/materials incluye el material con upvotes:0 y liked_by_me:false', async () => {
        const res = await request(app)
            .get('/api/materials')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const item = res.body.find((m) => m.id === materialId);
        expect(item).toBeDefined();
        expect(item.upvotes).toBe(0);
        expect(item.liked_by_me).toBe(false);
    });

    it('POST /api/materials/:id/like da like -> { liked:true, upvotes:1 }', async () => {
        const res = await request(app)
            .post(`/api/materials/${materialId}/like`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ liked: true, upvotes: 1 });
    });

    it('POST /api/materials/:id/like de nuevo quita el like -> { liked:false, upvotes:0 }', async () => {
        const res = await request(app)
            .post(`/api/materials/${materialId}/like`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ liked: false, upvotes: 0 });
    });

    it('POST /api/materials/:id/like sobre un material inexistente -> 404', async () => {
        const res = await request(app)
            .post('/api/materials/999999999/like')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
    });
});
