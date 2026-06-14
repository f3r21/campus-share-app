-- Esquema de Base de Datos para CampusShare (PostgreSQL)
-- Idempotente: seguro de ejecutar en cada arranque, sin pérdida de datos.

CREATE TABLE IF NOT EXISTS careers (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    career_id INTEGER REFERENCES careers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    semester INTEGER NOT NULL,
    UNIQUE (career_id, name)
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migración idempotente para bases de datos ya existentes (p. ej. Neon en prod):
-- los usuarios de Google no tienen contraseña, así que password_hash debe ser
-- nullable. Quitar NOT NULL en una columna ya nullable es un no-op en Postgres,
-- por lo que es seguro ejecutarlo en cada arranque vía initDb.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Padrón de códigos de matrícula (whitelist). Se carga fuera de banda (out-of-band)
-- directamente en la BD; este esquema NO siembra datos. Cada código se "reclama"
-- (used_by + claimed_at) la primera vez que un alumno se registra con él.
CREATE TABLE IF NOT EXISTS student_codes (
    -- code se almacena normalizado (mayúsculas + sin espacios), igual que la
    -- comparación de la app (code.trim().toUpperCase()). El CHECK rechaza cargas
    -- no normalizadas, evitando que un padrón mal cargado nunca haga match.
    code TEXT PRIMARY KEY CHECK (code = upper(btrim(code))),
    used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ
);

-- Vincula a cada usuario con el código que usó al registrarse (nullable: los
-- usuarios previos al whitelist no lo tienen). El índice único parcial impide
-- que dos cuentas compartan el mismo código.
ALTER TABLE users ADD COLUMN IF NOT EXISTS student_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_student_code_uniq ON users(student_code) WHERE student_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS materials (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    file_url TEXT NOT NULL,
    upvotes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- "Me gusta" por usuario y material. La PK (user_id, material_id) garantiza
-- un único corazón por usuario y material.
CREATE TABLE IF NOT EXISTS likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, material_id)
);
