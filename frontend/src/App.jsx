import React, { useState, useEffect } from 'react';
import MaterialCard from './components/MaterialCard';
import UploadModal from './components/UploadModal';

function App() {
  const [materials, setMaterials] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchMaterials = () => {
    fetch('/api/materials')
      .then(res => res.json())
      .then(data => setMaterials(data))
      .catch(err => console.error("Error fetching materials:", err));
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  const handleUpvote = async (id) => {
    try {
      const res = await fetch(`/api/materials/${id}/upvote`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchMaterials();
      }
    } catch (err) {
      console.error("Error upvoting:", err);
    }
  };

  return (
    <div className="container">
      <header>
        <div>
          <h1>CampusShare</h1>
          <p>Portal Colaborativo de Material Académico UCSP</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          + Subir Apunte
        </button>
      </header>

      <main>
        {materials.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }} className="glass">
            <h2>Aún no hay material subido</h2>
            <p>Sé el primero en aportar a la comunidad.</p>
          </div>
        ) : (
          <div className="materials-grid">
            {materials.map(material => (
              <MaterialCard 
                key={material.id} 
                material={material} 
                onUpvote={handleUpvote} 
              />
            ))}
          </div>
        )}
      </main>

      <UploadModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onUploadSuccess={fetchMaterials} 
      />
    </div>
  );
}

export default App;
