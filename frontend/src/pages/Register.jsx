import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!email.endsWith('@ucsp.edu.pe')) {
      setError('Debes usar un correo institucional de la UCSP (@ucsp.edu.pe)');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrarse');

      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        aria-labelledby="register-heading"
        className="w-full max-w-md border border-line bg-surface p-9"
      >
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-accent">
          CampusShare UCSP
        </p>
        <h1 id="register-heading" className="mt-3 text-4xl font-medium leading-tight tracking-tight text-ink">
          Crear cuenta
        </h1>
        <span aria-hidden="true" className="mt-4 mb-6 block h-px w-12 bg-accent" />

        {error && (
          <div role="alert" className="mb-6 border-l-2 border-accent bg-paper p-3 text-sm text-accent">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label htmlFor="register-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Correo institucional
            </label>
            <input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              placeholder="usuario@ucsp.edu.pe"
              className="w-full rounded-[0.375rem] border border-line bg-paper px-4 py-3 text-ink transition-colors placeholder:text-muted/60 hover:border-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="register-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Contraseña
            </label>
            <input
              id="register-password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="Crea una contraseña segura"
              className="w-full rounded-[0.375rem] border border-line bg-paper px-4 py-3 text-ink transition-colors placeholder:text-muted/60 hover:border-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-[0.375rem] bg-accent py-3 font-medium text-paper transition-colors hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {loading ? 'Creando cuenta...' : 'Registrarse'}
          </button>
        </form>

        <p className="mt-7 text-sm text-muted">
          ¿Ya tienes una cuenta?{' '}
          <Link to="/login" className="font-medium text-accent underline decoration-1 underline-offset-4 transition-colors hover:text-ink">
            Inicia Sesión
          </Link>
        </p>
      </motion.section>
    </main>
  );
}
