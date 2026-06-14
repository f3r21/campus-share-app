import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GoogleLogin } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const UCSP_DOMAIN = 'ucsp.edu.pe';
const CODE_PLACEHOLDER = '251-10-XXXXX';

export default function Login({ setAuth }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // STEP 2 state: we hold the verified Google credential and the typed code
  // while the matriculation form is shown.
  const [pendingCredential, setPendingCredential] = useState(null);
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  // Shared success path: persist session and route into the app.
  const completeLogin = (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setAuth({ token: data.token, user: data.user });
    navigate('/');
  };

  // STEP 1 — Google sign-in. On success, ask the backend whether this account
  // already exists (-> token) or is a new registration that needs a code.
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

      // New user that must verify enrollment: switch to STEP 2 and keep the
      // verified Google credential so we can register with the code.
      if (res.ok && data.needsCode === true) {
        setPendingCredential(credential);
        setCode('');
        setError('');
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo iniciar sesión con Google.');
      }

      if (data.token) {
        completeLogin(data);
        return;
      }

      throw new Error('No se pudo iniciar sesión con Google.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // STEP 2 — submit the matriculation code together with the Google credential
  // so the backend re-verifies the token and claims the code atomically.
  const handleRegister = async (event) => {
    event.preventDefault();
    if (!pendingCredential) return;

    const trimmedCode = code.trim();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/google/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: pendingCredential, code: trimmedCode }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.token) {
        completeLogin(data);
        return;
      }

      throw new Error(data.error || 'No se pudo completar el registro. Inténtalo de nuevo.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Return to STEP 1 ("Usar otra cuenta / Volver").
  const handleBack = () => {
    setPendingCredential(null);
    setCode('');
    setError('');
    setLoading(false);
  };

  const handleError = () => {
    setError('No se pudo completar el inicio de sesión con Google. Inténtalo de nuevo.');
  };

  const isStepTwo = pendingCredential !== null;
  const canSubmitCode = code.trim().length > 0 && !loading;

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

        {error && (
          <div role="alert" className="mb-6 border-l-2 border-accent bg-paper p-3 text-sm text-accent">
            {error}
          </div>
        )}

        {!isStepTwo ? (
          <>
            <p className="mb-8 text-base leading-relaxed text-muted">
              Inicia sesión con tu cuenta institucional de Google para verificar que eres parte de la UCSP.
            </p>

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
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
              Verifica tu matrícula
            </h2>
            <p className="mt-3 mb-7 text-base leading-relaxed text-muted">
              Para verificar que eres alumno, ingresa tu código de matrícula.
            </p>

            <form onSubmit={handleRegister} className="flex flex-col gap-5" noValidate>
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="matriculation-code"
                  className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted"
                >
                  Código de matrícula
                </label>
                <input
                  id="matriculation-code"
                  name="matriculation-code"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={CODE_PLACEHOLDER}
                  aria-label="Código de matrícula"
                  disabled={loading}
                  className="border border-line bg-paper px-3 py-2.5 font-sans text-base tracking-wide text-ink placeholder:text-muted/60 transition-colors focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
                />
              </div>

              <button
                type="submit"
                disabled={!canSubmitCode}
                aria-label="Verificar y entrar"
                className="inline-flex items-center justify-center rounded-[0.375rem] bg-accent px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Verificando…' : 'Verificar y entrar'}
              </button>
            </form>

            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              className="mt-6 text-xs font-medium uppercase tracking-[0.12em] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            >
              Usar otra cuenta · Volver
            </button>
          </>
        )}
      </motion.section>
    </main>
  );
}
