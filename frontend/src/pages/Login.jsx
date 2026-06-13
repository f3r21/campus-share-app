import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GoogleLogin } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const UCSP_DOMAIN = 'ucsp.edu.pe';

export default function Login({ setAuth }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCredential = async (credentialResponse) => {
    const credential = credentialResponse?.credential;
    if (!credential) {
      setError('No se recibió la credencial de Google. Inténtalo de nuevo.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo iniciar sesión con Google.');
      }

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

  const handleError = () => {
    setError('No se pudo completar el inicio de sesión con Google. Inténtalo de nuevo.');
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        aria-labelledby="login-heading"
        className="w-full max-w-md border border-line bg-surface p-9"
      >
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-accent">
          CampusShare · UCSP
        </p>
        <h1 id="login-heading" className="mt-3 text-4xl font-medium leading-tight tracking-tight text-ink">
          Acceso a la comunidad UCSP
        </h1>
        <span aria-hidden="true" className="mt-4 mb-6 block h-px w-12 bg-accent" />

        <p className="mb-8 text-base leading-relaxed text-muted">
          Inicia sesión con tu cuenta institucional de Google para verificar que eres parte de la UCSP.
        </p>

        {error && (
          <div role="alert" className="mb-6 border-l-2 border-accent bg-paper p-3 text-sm text-accent">
            {error}
          </div>
        )}

        {GOOGLE_CLIENT_ID ? (
          <div className="flex flex-col gap-4">
            <div
              aria-busy={loading}
              className={loading ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'}
            >
              <GoogleLogin
                onSuccess={handleCredential}
                onError={handleError}
                hosted_domain={UCSP_DOMAIN}
                locale="es"
                shape="rectangular"
                size="large"
                text="signin_with"
                width="332"
              />
            </div>
            {loading && (
              <p className="text-xs uppercase tracking-[0.12em] text-muted">
                Verificando tu cuenta…
              </p>
            )}
          </div>
        ) : (
          <p className="border-l-2 border-line bg-paper p-3 text-sm text-muted">
            El inicio de sesión con Google aún no está configurado.
          </p>
        )}

        <p className="mt-8 text-xs leading-relaxed text-muted">
          Solo se admiten cuentas institucionales{' '}
          <span className="font-medium text-ink">@ucsp.edu.pe</span>.
        </p>
      </motion.section>
    </main>
  );
}
