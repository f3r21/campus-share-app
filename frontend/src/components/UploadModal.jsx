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
        .catch(err => console.error("Error fetching careers:", err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (formData.career_id) {
      fetch(`/api/courses?career_id=${formData.career_id}`)
        .then(res => res.json())
        .then(data => setCourses(data))
        .catch(err => console.error("Error fetching courses:", err));
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-surface border border-border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex justify-between items-center p-6 border-b border-border bg-surface/50">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <UploadCloud className="text-primary w-6 h-6" />
                Subir Apunte
              </h2>
              <button 
                onClick={onClose}
                className="text-text-muted hover:text-text-main transition-colors p-1 rounded-full hover:bg-border"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-muted">Carrera</label>
                  <select 
                    required 
                    className="bg-background border border-border rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary transition-colors text-sm"
                    value={formData.career_id} 
                    onChange={e => setFormData({ ...formData, career_id: e.target.value })}
                  >
                    <option value="">Selecciona una carrera...</option>
                    {careers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-muted">Curso</label>
                  <select 
                    required 
                    disabled={!formData.career_id}
                    className="bg-background border border-border rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary transition-colors text-sm disabled:opacity-50"
                    value={formData.course_id} 
                    onChange={e => setFormData({ ...formData, course_id: e.target.value })}
                  >
                    <option value="">Selecciona un curso...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name} (Semestre {c.semester})</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-muted">Título del Apunte</label>
                <input 
                  type="text" 
                  required 
                  placeholder="Ej. Resumen Primer Parcial"
                  className="bg-background border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary transition-colors"
                  value={formData.title} 
                  onChange={e => setFormData({ ...formData, title: e.target.value })} 
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-muted">Descripción (Opcional)</label>
                <textarea 
                  rows="3"
                  placeholder="Detalles sobre el contenido..."
                  className="bg-background border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary transition-colors resize-none"
                  value={formData.description} 
                  onChange={e => setFormData({ ...formData, description: e.target.value })} 
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-muted">Archivo PDF</label>
                <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-xl cursor-pointer bg-background hover:border-primary hover:bg-background/80 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <UploadCloud className="w-8 h-8 mb-3 text-text-muted" />
                            <p className="mb-2 text-sm text-text-muted">
                              <span className="font-semibold text-primary">Haz clic para subir</span> o arrastra
                            </p>
                            <p className="text-xs text-text-muted truncate max-w-xs">
                              {formData.file ? formData.file.name : "PDF (Max. 10MB)"}
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
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={onClose} 
                  className="px-5 py-2.5 text-sm font-medium rounded-lg border border-border hover:bg-border transition-colors text-text-main"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={loading || !formData.file} 
                  className="px-5 py-2.5 text-sm font-medium rounded-lg bg-primary hover:bg-primary-dark transition-colors text-white flex items-center gap-2 disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Subiendo...' : 'Publicar Apunte'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
