import React, { useState, useEffect } from 'react';

const UploadModal = ({ isOpen, onClose, onUploadSuccess }) => {
  const [courses, setCourses] = useState([]);
  const [formData, setFormData] = useState({
    course_id: '',
    title: '',
    description: '',
    file: null
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/courses')
        .then(res => res.json())
        .then(data => {
          setCourses(data);
          if (data.length > 0) {
            setFormData(prev => ({ ...prev, course_id: data[0].id }));
          }
        })
        .catch(err => console.error(err));
    }
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setFormData(prev => ({ ...prev, file: e.target.files[0] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.file) return alert('Por favor adjunta un archivo');

    setLoading(true);
    const data = new FormData();
    data.append('course_id', formData.course_id);
    data.append('title', formData.title);
    data.append('description', formData.description);
    data.append('file', formData.file);

    try {
      const res = await fetch('/api/materials', {
        method: 'POST',
        body: data,
      });

      if (res.ok) {
        onUploadSuccess();
        onClose();
        setFormData({ course_id: courses[0]?.id || '', title: '', description: '', file: null });
      } else {
        alert('Error al subir el archivo');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>Subir Apunte</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <label>Curso:</label>
          <select name="course_id" value={formData.course_id} onChange={handleChange} required>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.name} (Semestre {c.semester})</option>
            ))}
          </select>

          <label>Título del Documento:</label>
          <input 
            type="text" 
            name="title" 
            placeholder="Ej. Resumen Final de AWS" 
            value={formData.title} 
            onChange={handleChange} 
            required 
          />

          <label>Descripción:</label>
          <textarea 
            name="description" 
            rows="3" 
            placeholder="¿De qué trata este documento?"
            value={formData.description}
            onChange={handleChange}
            required
          ></textarea>

          <div className="file-input-wrapper">
            <div className="file-drop-area">
              <span>{formData.file ? formData.file.name : '📄 Haz clic para seleccionar PDF/Docx'}</span>
            </div>
            <input type="file" onChange={handleFileChange} accept=".pdf,.doc,.docx,.zip" required />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Subiendo a la nube...' : '🚀 Compartir Apunte'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default UploadModal;
