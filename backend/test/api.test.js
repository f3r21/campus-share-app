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

// GOOGLE_CLIENT_ID se fija ANTES de requerir la app: server.js lo captura en una
// const al cargar el módulo. Sin esto, /api/auth/google respondería 503 (no
// configurado). Con un valor presente, un credential FALSO sigue fallando con 401
// (token inválido), así que los tests existentes que esperan [401, 503] no se rompen;
// y el bloque de whitelist stubea verifyIdToken para simular un payload UCSP válido.
if (!process.env.GOOGLE_CLIENT_ID) {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
}

const { app, pool, initDb, googleClient } = require('../server');

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

// Whitelist de códigos de matrícula (registro en 2 pasos con Google).
//
// El token de Google no se puede verificar de verdad en los tests, así que se
// stubea googleClient.verifyIdToken (vi.spyOn) para devolver un payload UCSP
// falso (email_verified true, hd 'ucsp.edu.pe', email @ucsp.edu.pe). El spy se
// crea en beforeAll y se restaura en afterAll para NO afectar a los demás tests
// de autenticación (que esperan que un credential falso falle con 401/503).
//
// process.env.ENFORCE_STUDENT_CODES se fija por test y se restaura a su valor
// previo en afterAll. Las rutas leen el flag por petición, así que el toggle
// surte efecto sin reiniciar el proceso.
describe('whitelist de códigos de matrícula (registro 2 pasos)', () => {
    let verifySpy;
    let stubEmail;
    const prevEnforce = process.env.ENFORCE_STUDENT_CODES;

    // Cambia el email que devolverá el stub para el siguiente request.
    const setStubEmail = (email) => {
        stubEmail = email;
    };

    beforeAll(async () => {
        // Stub: cualquier credential => payload UCSP válido con el email actual.
        verifySpy = vi.spyOn(googleClient, 'verifyIdToken').mockImplementation(async () => ({
            getPayload: () => ({
                email: stubEmail,
                email_verified: true,
                hd: 'ucsp.edu.pe'
            })
        }));

        // Sembrar un par de códigos de prueba directamente vía el pool.
        // Idempotente entre ejecuciones contra una misma BD: primero se libera
        // cualquier student_code previo en users (el índice único parcial impediría
        // re-reclamar el código si quedara colgado de una ejecución anterior), luego
        // se reinsertan los códigos limpios (used_by = NULL).
        await pool.query("UPDATE users SET student_code = NULL WHERE student_code IN ('TEST-001', 'TEST-002')");
        await pool.query("DELETE FROM student_codes WHERE code IN ('TEST-001', 'TEST-002')");
        await pool.query("INSERT INTO student_codes (code) VALUES ('TEST-001'), ('TEST-002')");
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
        if (verifySpy) verifySpy.mockRestore();
        // Restaurar el valor previo de la env (o eliminarla si no existía).
        if (prevEnforce === undefined) {
            delete process.env.ENFORCE_STUDENT_CODES;
        } else {
            process.env.ENFORCE_STUDENT_CODES = prevEnforce;
        }
        // Limpieza de los códigos de prueba.
        await pool.query("DELETE FROM student_codes WHERE code IN ('TEST-001', 'TEST-002')");
    });

    it('ENFORCE on + email nuevo -> /google responde { needsCode:true } y NO crea usuario', async () => {
        process.env.ENFORCE_STUDENT_CODES = 'true';
        const email = `nuevo_${Date.now()}@ucsp.edu.pe`;
        setStubEmail(email);

        const res = await request(app)
            .post('/api/auth/google')
            .send({ credential: 'fake-google-credential' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ needsCode: true });
        expect(res.body.token).toBeUndefined();

        // No debe existir el usuario en la BD.
        const found = (await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
        expect(found).toBeUndefined();
    });

    it('ENFORCE on + /register con código válido sin usar -> 200 token, crea usuario y marca used_by', async () => {
        process.env.ENFORCE_STUDENT_CODES = 'true';
        const email = `claim_${Date.now()}@ucsp.edu.pe`;
        setStubEmail(email);

        const res = await request(app)
            .post('/api/auth/google/register')
            .send({ credential: 'fake-google-credential', code: 'test-001' });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.user).toBeDefined();
        expect(res.body.user.email).toBe(email);
        const newId = res.body.user.id;
        expect(newId).toBeDefined();

        // El usuario existe y el código quedó reclamado por ese usuario.
        const user = (await pool.query('SELECT id, student_code FROM users WHERE email = $1', [email])).rows[0];
        expect(user).toBeDefined();
        expect(user.student_code).toBe('TEST-001');

        const codeRow = (await pool.query('SELECT used_by, claimed_at FROM student_codes WHERE code = $1', ['TEST-001'])).rows[0];
        expect(codeRow.used_by).toBe(newId);
        expect(codeRow.claimed_at).not.toBeNull();
    });

    it('ENFORCE on + /register reutilizando ese código con OTRO email -> 403 "ya fue usado"', async () => {
        process.env.ENFORCE_STUDENT_CODES = 'true';
        const email = `otro_${Date.now()}@ucsp.edu.pe`;
        setStubEmail(email);

        const res = await request(app)
            .post('/api/auth/google/register')
            .send({ credential: 'fake-google-credential', code: 'TEST-001' });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Ese código ya fue usado en otra cuenta.');
        expect(res.body.token).toBeUndefined();

        // No se creó el usuario.
        const found = (await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
        expect(found).toBeUndefined();
    });

    it('ENFORCE on + /register con código desconocido -> 403 "no válido"', async () => {
        process.env.ENFORCE_STUDENT_CODES = 'true';
        const email = `desconocido_${Date.now()}@ucsp.edu.pe`;
        setStubEmail(email);

        const res = await request(app)
            .post('/api/auth/google/register')
            .send({ credential: 'fake-google-credential', code: 'NO-EXISTE-999' });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Código de matrícula no válido.');
        expect(res.body.token).toBeUndefined();

        const found = (await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
        expect(found).toBeUndefined();
    });

    it('ENFORCE on + usuario existente -> /google devuelve token SIN pedir código', async () => {
        process.env.ENFORCE_STUDENT_CODES = 'true';
        const email = `existente_${Date.now()}@ucsp.edu.pe`;
        // Crear el usuario previamente (como un alumno ya registrado).
        await pool.query('INSERT INTO users (email) VALUES ($1)', [email]);
        setStubEmail(email);

        const res = await request(app)
            .post('/api/auth/google')
            .send({ credential: 'fake-google-credential' });

        expect(res.status).toBe(200);
        expect(res.body.needsCode).toBeUndefined();
        expect(res.body.token).toBeDefined();
        expect(res.body.user.email).toBe(email);
    });

    it('ENFORCE off + email nuevo -> /google crea el usuario directamente y devuelve token', async () => {
        process.env.ENFORCE_STUDENT_CODES = 'false';
        const email = `libre_${Date.now()}@ucsp.edu.pe`;
        setStubEmail(email);

        const res = await request(app)
            .post('/api/auth/google')
            .send({ credential: 'fake-google-credential' });

        expect(res.status).toBe(200);
        expect(res.body.needsCode).toBeUndefined();
        expect(res.body.token).toBeDefined();
        expect(res.body.user.email).toBe(email);

        const found = (await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
        expect(found).toBeDefined();
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
