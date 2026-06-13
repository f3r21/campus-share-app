import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';

/**
 * Editorial edit modal for an existing material.
 * Editing the file is NOT supported — only title, description, and (optionally) curso.
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   material: object | null,
 *   auth: { token: string, user: { id: number } } | null,
 *   onSaved: (updated: object) => void
 * }} props
 */
export default function EditModal({ isOpen, onClose, material, auth, onSaved }) {
  const KEEP_CURRENT = '__keep__';

  const [careers, setCareers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [careerId, setCareerId] = useState('');
  const [courseId, setCourseId] = useState(KEEP_CURRENT);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Prefill from the current material whenever the modal opens.
  useEffect(() => {
    if (isOpen && material) {
      setTitle(material.title ?? '');
      setDescription(material.description ?? '');
      setCareerId('');
      setCourseId(KEEP_CURRENT);
      setError(null);
    }
  }, [isOpen, material]);

  // Load careers (for the optional curso cascade) when the modal opens.
  useEffect(() => {
    if (isOpen) {
      fetch('/api/careers')
        .then(res => res.json())
        .then(data => setCareers(Array.isArray(data) ? data : []))
        .catch(err => console.error('Error fetching careers:', err));
    }
  }, [isOpen]);

  // Cascade: when a career is picked, load its courses. The selection reset and
  // the empty-courses reset are handled in handleCareerChange (event handler),
  // keeping this effect a pure fetch with no synchronous setState in its body.
  useEffect(() => {
    if (!careerId) return;
    let active = true;
    fetch(`/api/courses?career_id=${careerId}`)
      .then(res => res.json())
      .then(data => { if (active) setCourses(Array.isArray(data) ? data : []); })
      .catch(err => console.error('Error fetching courses:', err));
    return () => { active = false; };
  }, [careerId]);

  const handleCareerChange = (value) => {
    setCareerId(value);
    setCourseId(KEEP_CURRENT);
    if (!value) setCourses([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!material || !auth?.token) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('El título no puede quedar vacío.');
      return;
    }

    setLoading(true);
    setError(null);

    // Only send fields that change. course_id only when re-selected.
    const payload = {
      title: trimmedTitle,
      description: description.trim(),
    };
    if (courseId !== KEEP_CURRENT && courseId !== '') {
      payload.course_id = Number(courseId);
    }

    try {
      const response = await fetch(`/api/materials/${material.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const updated = await response.json().catch(() => null);
        onSaved(updated);
        onClose();
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || 'No se pudo guardar los cambios.');
      }
    } catch {
      setError('Error de conexión al servidor.');
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    'rounded-[0.375rem] border border-line bg-paper px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-muted/60 hover:border-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

  return (
    <AnimatePresence>
      {isOpen && material && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-modal-heading"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-ink bg-surface"
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-5">
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-accent">
                  Editar aporte
                </p>
                <h2 id="edit-modal-heading" className="mt-1 font-display text-2xl font-medium tracking-tight text-ink">
                  Editar Apunte
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="rounded-[0.375rem] border border-line p-1.5 text-muted transition-colors hover:border-ink hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              {error && (
                <div role="alert" className="border-l-2 border-accent bg-paper p-3 text-sm text-accent">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-title" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Título del Apunte</label>
                <input
                  id="edit-title"
                  type="text"
                  required
                  placeholder="Ej. Resumen Primer Parcial"
                  className={fieldClass}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-description" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Descripción (Opcional)</label>
                <textarea
                  id="edit-description"
                  rows="3"
                  placeholder="Detalles sobre el contenido..."
                  className={`${fieldClass} resize-none`}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <fieldset className="border-t border-line pt-4">
                <legend className="px-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Curso <span className="font-normal normal-case tracking-normal text-muted/70">· opcional</span>
                </legend>
                <p className="mb-3 mt-1 text-xs text-muted">
                  Curso actual: <span className="font-medium text-ink">{material.course_name || '—'}</span>
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="edit-career" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Carrera</label>
                    <select
                      id="edit-career"
                      className={fieldClass}
                      value={careerId}
                      onChange={e => handleCareerChange(e.target.value)}
                    >
                      <option value="">(mantener curso actual)</option>
                      {careers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="edit-course" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Curso</label>
                    <select
                      id="edit-course"
                      disabled={!careerId}
                      className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-50`}
                      value={courseId}
                      onChange={e => setCourseId(e.target.value)}
                    >
                      <option value={KEEP_CURRENT}>(mantener curso actual)</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.name} (Semestre {c.semester})</option>)}
                    </select>
                  </div>
                </div>
              </fieldset>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-[0.375rem] border border-line px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || !title.trim()}
                  className="inline-flex items-center gap-2 rounded-[0.375rem] bg-accent px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
