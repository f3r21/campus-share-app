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
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-surface border border-border p-8 rounded-2xl shadow-2xl"
      >
        <div className="flex justify-center mb-6">
          <div className="bg-primary/10 p-4 rounded-full">
            <LogIn className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center mb-2">Bienvenido de vuelta</h2>
        <p className="text-text-muted text-center mb-8">Ingresa a CampusShare UCSP</p>
        
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg mb-6 text-sm">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Correo Institucional</label>
            <input 
              type="email" 
              required 
              placeholder="usuario@ucsp.edu.pe"
              className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-primary transition-colors"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Contraseña</label>
            <input 
              type="password" 
              required 
              placeholder="••••••••"
              className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-primary transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-dark text-white font-medium py-3 rounded-lg transition-colors mt-4 disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {loading ? 'Iniciando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <p className="text-center text-text-muted mt-6 text-sm">
          ¿No tienes una cuenta? <Link to="/register" className="text-primary hover:underline">Regístrate</Link>
        </p>
      </motion.div>
    </div>
  );
}
