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

describe('editar / eliminar material propio + ?mine=true', () => {
    let tokenA;
    let tokenB;
    let userIdA;
    let materialId;

    beforeAll(async () => {
        // Usuario A (dueño) y usuario B (no dueño): emails únicos por ejecución.
        const emailA = `ownerA_${Date.now()}@ucsp.edu.pe`;
        const emailB = `otherB_${Date.now()}@ucsp.edu.pe`;
        const userA = (await pool.query(
            'INSERT INTO users (email) VALUES ($1) RETURNING id, email',
            [emailA]
        )).rows[0];
        const userB = (await pool.query(
            'INSERT INTO users (email) VALUES ($1) RETURNING id, email',
            [emailB]
        )).rows[0];
        userIdA = userA.id;
        tokenA = jwt.sign({ id: userA.id, email: userA.email }, process.env.JWT_SECRET);
        tokenB = jwt.sign({ id: userB.id, email: userB.email }, process.env.JWT_SECRET);

        // A sube un material que se usará en todo el flujo.
        const res = await request(app)
            .post('/api/materials')
            .set('Authorization', `Bearer ${tokenA}`)
            .field('course_id', '1')
            .field('title', 'Material de A')
            .field('description', 'Original')
            .attach('file', Buffer.from('%PDF-1.4 contenido de prueba'), {
                filename: 'material-a.pdf',
                contentType: 'application/pdf'
            });
        expect(res.status).toBe(201);
        materialId = res.body.id;
    }, SETUP_TIMEOUT_MS);

    it('PATCH /api/materials/:id como dueño A -> 200 y cambia el título', async () => {
        const res = await request(app)
            .patch(`/api/materials/${materialId}`)
            .set('Authorization', `Bearer ${tokenA}`)
            .send({ title: 'Título editado por A' });

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(materialId);
        expect(res.body.title).toBe('Título editado por A');
        // El shape debe incluir las columnas del feed.
        expect(res.body).toHaveProperty('course_name');
        expect(res.body).toHaveProperty('user_email');
        expect(res.body).toHaveProperty('upvotes');
        expect(res.body).toHaveProperty('liked_by_me');
    });

    it('PATCH /api/materials/:id con título vacío -> 400', async () => {
        const res = await request(app)
            .patch(`/api/materials/${materialId}`)
            .set('Authorization', `Bearer ${tokenA}`)
            .send({ title: '   ' });

        expect(res.status).toBe(400);
    });

    it('PATCH /api/materials/:id como NO dueño B -> 403', async () => {
        const res = await request(app)
            .patch(`/api/materials/${materialId}`)
            .set('Authorization', `Bearer ${tokenB}`)
            .send({ title: 'Intento de B' });

        expect(res.status).toBe(403);
    });

    it('PATCH /api/materials/:id inexistente -> 404', async () => {
        const res = await request(app)
            .patch('/api/materials/999999999')
            .set('Authorization', `Bearer ${tokenA}`)
            .send({ title: 'No existe' });

        expect(res.status).toBe(404);
    });

    it('GET /api/materials?mine=true como A devuelve solo materiales de A', async () => {
        const res = await request(app)
            .get('/api/materials')
            .query({ mine: 'true' })
            .set('Authorization', `Bearer ${tokenA}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        for (const item of res.body) {
            expect(item.user_id).toBe(userIdA);
        }
        expect(res.body.some((m) => m.id === materialId)).toBe(true);
    });

    it('GET /api/materials?mine=true sin token devuelve el feed normal (no error)', async () => {
        const res = await request(app)
            .get('/api/materials')
            .query({ mine: 'true' });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('DELETE /api/materials/:id como NO dueño B -> 403', async () => {
        const res = await request(app)
            .delete(`/api/materials/${materialId}`)
            .set('Authorization', `Bearer ${tokenB}`);

        expect(res.status).toBe(403);
    });

    it('DELETE /api/materials/:id inexistente -> 404', async () => {
        const res = await request(app)
            .delete('/api/materials/999999999')
            .set('Authorization', `Bearer ${tokenA}`);

        expect(res.status).toBe(404);
    });

    it('DELETE /api/materials/:id como dueño A -> 200 { success:true }', async () => {
        const res = await request(app)
            .delete(`/api/materials/${materialId}`)
            .set('Authorization', `Bearer ${tokenA}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true });
    });

    it('GET /api/materials ya no incluye el material eliminado', async () => {
        const res = await request(app)
            .get('/api/materials')
            .set('Authorization', `Bearer ${tokenA}`);

        expect(res.status).toBe(200);
        expect(res.body.some((m) => m.id === materialId)).toBe(false);
    });
});
