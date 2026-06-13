import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus } from 'lucide-react';

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
    <main className="flex min-h-screen items-center justify-center p-4">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        aria-labelledby="register-heading"
        className="w-full max-w-md rounded-3xl border border-border/70 bg-surface/70 p-8 shadow-card backdrop-blur-xl"
      >
        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 p-4 ring-1 ring-inset ring-primary/25">
            <UserPlus className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h2 id="register-heading" className="text-center text-3xl font-bold tracking-tight">Crear Cuenta</h2>
        <p className="mb-8 mt-2 text-center text-text-muted">Únete a la comunidad de apuntes UCSP</p>

        {error && (
          <div role="alert" className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label htmlFor="register-email" className="mb-1.5 block text-sm font-medium text-text-muted">Correo Institucional</label>
            <input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              placeholder="usuario@ucsp.edu.pe"
              className="w-full rounded-lg border border-border bg-background/60 px-4 py-3 text-text-main transition-colors placeholder:text-text-muted/60 hover:border-border focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="register-password" className="mb-1.5 block text-sm font-medium text-text-muted">Contraseña</label>
            <input
              id="register-password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="Crea una contraseña segura"
              className="w-full rounded-lg border border-border bg-background/60 px-4 py-3 text-text-main transition-colors placeholder:text-text-muted/60 hover:border-border focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-medium text-white shadow-card transition-all hover:bg-primary-dark hover:shadow-glow active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Creando cuenta...' : 'Registrarse'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          ¿Ya tienes una cuenta? <Link to="/login" className="font-medium text-accent transition-colors hover:text-primary hover:underline">Inicia Sesión</Link>
        </p>
      </motion.section>
    </main>
  );
}
