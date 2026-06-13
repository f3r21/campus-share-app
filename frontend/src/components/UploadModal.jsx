import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UploadCloud, Loader2 } from 'lucide-react';

export default function UploadModal({ isOpen, onClose, onUploadSuccess, auth }) {
  const [careers, setCareers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [formData, setFormData] = useState({
    career_id: '',
    course_id: '',
    title: '',
    description: '',
    file: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/careers')
        .then(res => res.json())
        .then(data => setCareers(data))
        .catch(err => console.error('Error fetching careers:', err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (formData.career_id) {
      fetch(`/api/courses?career_id=${formData.career_id}`)
        .then(res => res.json())
        .then(data => setCourses(data))
        .catch(err => console.error('Error fetching courses:', err));
    } else {
      setCourses([]);
      setFormData(prev => ({ ...prev, course_id: '' }));
    }
  }, [formData.career_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const data = new FormData();
    data.append('course_id', formData.course_id);
    data.append('title', formData.title);
    data.append('description', formData.description);
    data.append('file', formData.file);

    try {
      const response = await fetch('/api/materials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth?.token}`
        },
        body: data
      });
      if (response.ok) {
        onUploadSuccess();
        onClose();
        setFormData({ career_id: '', course_id: '', title: '', description: '', file: null });
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error al subir el archivo');
      }
    } catch (err) {
      setError('Error de conexión al servidor');
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    'rounded-[0.375rem] border border-line bg-paper px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-muted/60 hover:border-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

  return (
    <AnimatePresence>
      {isOpen && (
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
            aria-labelledby="upload-modal-heading"
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
                  Nuevo aporte
                </p>
                <h2 id="upload-modal-heading" className="mt-1 font-display text-2xl font-medium tracking-tight text-ink">
                  Subir Apunte
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="upload-career" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Carrera</label>
                  <select
                    id="upload-career"
                    required
                    className={fieldClass}
                    value={formData.career_id}
                    onChange={e => setFormData({ ...formData, career_id: e.target.value })}
                  >
                    <option value="">Selecciona una carrera...</option>
                    {careers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="upload-course" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Curso</label>
                  <select
                    id="upload-course"
                    required
                    disabled={!formData.career_id}
                    className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-50`}
                    value={formData.course_id}
                    onChange={e => setFormData({ ...formData, course_id: e.target.value })}
                  >
                    <option value="">Selecciona un curso...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name} (Semestre {c.semester})</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="upload-title" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Título del Apunte</label>
                <input
                  id="upload-title"
                  type="text"
                  required
                  placeholder="Ej. Resumen Primer Parcial"
                  className={fieldClass}
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="upload-description" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Descripción (Opcional)</label>
                <textarea
                  id="upload-description"
                  rows="3"
                  placeholder="Detalles sobre el contenido..."
                  className={`${fieldClass} resize-none`}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Archivo PDF</span>
                <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-[0.375rem] border border-dashed border-line bg-paper transition-colors hover:border-accent focus-within:border-accent">
                  <div className="flex flex-col items-center justify-center px-4 text-center">
                    <UploadCloud className="mb-2.5 h-7 w-7 text-muted" />
                    <p className="text-sm text-muted">
                      <span className="font-semibold text-accent">Haz clic para subir</span> o arrastra
                    </p>
                    <p className="mt-1 max-w-xs truncate text-xs text-muted">
                      {formData.file ? formData.file.name : 'PDF (Max. 10MB)'}
                    </p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf"
                    required
                    onChange={e => setFormData({ ...formData, file: e.target.files[0] })}
                  />
                </label>
              </div>

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
                  disabled={loading || !formData.file}
                  className="inline-flex items-center gap-2 rounded-[0.375rem] bg-accent px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? 'Subiendo...' : 'Publicar Apunte'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
