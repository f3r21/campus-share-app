import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Download, Pencil, Trash2, Loader2 } from 'lucide-react';
import EditModal from './EditModal';

export default function MaterialCard({ material, auth, featured = false, onChanged }) {
  const [liked, setLiked] = useState(Boolean(material.liked_by_me));
  const [count, setCount] = useState(material.upvotes ?? 0);
  const [pending, setPending] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const isOwner = auth?.user?.id != null && material.user_id === auth.user.id;
  const uploader = material.user_email ? material.user_email.split('@')[0] : 'Anónimo';

  const handleLike = async () => {
    if (!auth?.token || pending) return;

    const prevLiked = liked;
    const prevCount = count;

    // Optimistic flip
    const nextLiked = !prevLiked;
    setLiked(nextLiked);
    setCount(prevCount + (nextLiked ? 1 : -1));
    setPending(true);

    try {
      const res = await fetch(`/api/materials/${material.id}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.token}` },
      });
      if (!res.ok) throw new Error(`Like falló: ${res.status}`);
      const data = await res.json();
      setLiked(Boolean(data.liked));
      setCount(data.upvotes ?? 0);
    } catch (err) {
      console.error('Error al registrar me gusta:', err);
      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (!auth?.token || deleting) return;

    setDeleting(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/materials/${material.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${auth.token}` },
      });
      if (!res.ok) throw new Error(`Borrado falló: ${res.status}`);
      setConfirmingDelete(false);
      onChanged?.();
    } catch (err) {
      console.error('Error al borrar el apunte:', err);
      setActionError('No se pudo borrar el apunte. Inténtalo de nuevo.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaved = () => {
    onChanged?.();
  };

  return (
    <>
    <EditModal
      isOpen={isEditOpen}
      onClose={() => setIsEditOpen(false)}
      material={material}
      auth={auth}
      onSaved={handleSaved}
    />
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={`group flex h-full flex-col justify-between border border-line bg-surface transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-ink ${
        featured ? 'p-7 sm:p-9' : 'p-6'
      }`}
    >
      <div className={featured ? 'lg:grid lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-10' : ''}>
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-accent">
            {material.course_name}
          </p>

          <h3
            className={`mt-2.5 font-display font-medium leading-tight text-ink ${
              featured ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-2xl'
            }`}
          >
            {material.title}
          </h3>
        </div>

        <div className={featured ? 'mt-5 lg:mt-0' : ''}>
          {material.description && (
            <p
              className={`leading-relaxed text-muted ${
                featured ? 'text-base' : 'mt-3 line-clamp-3 text-sm'
              }`}
            >
              {material.description}
            </p>
          )}

          <div className="mt-5 flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-muted">
            <span aria-hidden="true" className="h-px w-6 bg-accent" />
            Por <span className="font-medium text-ink">{uploader}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        <button
          type="button"
          onClick={handleLike}
          disabled={pending}
          aria-pressed={liked}
          aria-label={liked ? 'Quitar me gusta' : 'Me gusta'}
          className="group/like flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-accent disabled:opacity-60"
        >
          <Heart
            className={`h-[1.05rem] w-[1.05rem] transition-colors ${
              liked ? 'fill-current text-accent' : 'text-muted group-hover/like:text-accent'
            }`}
          />
          <span className="tabular-nums">{count}</span>
        </button>

        <a
          href={material.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink underline decoration-line decoration-1 underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
        >
          <Download className="h-4 w-4" />
          Descargar
        </a>
      </div>

      {isOwner && (
        <div className="mt-3 border-t border-line pt-3">
          <AnimatePresence mode="wait" initial={false}>
            {confirmingDelete ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                role="alertdialog"
                aria-label="Confirmar borrado del apunte"
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm"
              >
                <span className="text-muted">¿Seguro que quieres borrarlo?</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    aria-label="Confirmar borrado"
                    className="inline-flex items-center gap-1.5 font-medium text-accent underline decoration-line decoration-1 underline-offset-4 transition-colors hover:decoration-accent disabled:opacity-60"
                  >
                    {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {deleting ? 'Borrando…' : 'Sí, borrar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConfirmingDelete(false); setActionError(null); }}
                    disabled={deleting}
                    aria-label="Cancelar borrado"
                    className="font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
                  >
                    No
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-4 text-xs uppercase tracking-[0.1em]"
              >
                <button
                  type="button"
                  onClick={() => setIsEditOpen(true)}
                  aria-label={`Editar el apunte ${material.title}`}
                  className="inline-flex items-center gap-1.5 font-medium text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label={`Borrar el apunte ${material.title}`}
                  className="inline-flex items-center gap-1.5 font-medium text-muted transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Borrar
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {actionError && (
            <p role="alert" className="mt-2 text-xs text-accent">
              {actionError}
            </p>
          )}
        </div>
      )}
    </motion.article>
    </>
  );
}
