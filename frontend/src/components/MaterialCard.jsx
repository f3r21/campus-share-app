import React from 'react';

const MaterialCard = ({ material, onUpvote }) => {
  return (
    <div className="glass glass-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="badge">{material.course_name}</span>
        <button 
          className="btn" 
          onClick={() => onUpvote(material.id)}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.9rem' }}
        >
          👍 {material.upvotes}
        </button>
      </div>
      
      <h3 style={{ margin: '1rem 0 0.5rem 0' }}>{material.title}</h3>
      <p style={{ fontSize: '0.9rem', flexGrow: 1 }}>{material.description}</p>
      
      <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
        <a 
          href={material.file_url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="btn btn-primary"
          style={{ width: '100%', textDecoration: 'none' }}
        >
          ⬇️ Descargar Apunte
        </a>
      </div>
    </div>
  );
};

export default MaterialCard;
