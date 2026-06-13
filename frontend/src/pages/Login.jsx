import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';

export default function Login({ setAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setAuth({ token: data.token, user: data.user });
      navigate('/');
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
        aria-labelledby="login-heading"
        className="w-full max-w-md rounded-3xl border border-border/70 bg-surface/70 p-8 shadow-card backdrop-blur-xl"
      >
        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 p-4 ring-1 ring-inset ring-primary/25">
            <LogIn className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h2 id="login-heading" className="text-center text-3xl font-bold tracking-tight">Bienvenido de vuelta</h2>
        <p className="mb-8 mt-2 text-center text-text-muted">Ingresa a CampusShare UCSP</p>

        {error && (
          <div role="alert" className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-text-muted">Correo Institucional</label>
            <input
              id="login-email"
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
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-text-muted">Contraseña</label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
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
            {loading ? 'Iniciando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          ¿No tienes una cuenta? <Link to="/register" className="font-medium text-accent transition-colors hover:text-primary hover:underline">Regístrate</Link>
        </p>
      </motion.section>
    </main>
  );
}
