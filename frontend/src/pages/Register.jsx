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
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-surface border border-border p-8 rounded-2xl shadow-2xl"
      >
        <div className="flex justify-center mb-6">
          <div className="bg-primary/10 p-4 rounded-full">
            <UserPlus className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center mb-2">Crear Cuenta</h2>
        <p className="text-text-muted text-center mb-8">Únete a la comunidad de apuntes UCSP</p>
        
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg mb-6 text-sm">{error}</div>}

        <form onSubmit={handleRegister} className="space-y-4">
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
              placeholder="Crea una contraseña segura"
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
            {loading ? 'Creando cuenta...' : 'Registrarse'}
          </button>
        </form>

        <p className="text-center text-text-muted mt-6 text-sm">
          ¿Ya tienes una cuenta? <Link to="/login" className="text-primary hover:underline">Inicia Sesión</Link>
        </p>
      </motion.div>
    </div>
  );
}
