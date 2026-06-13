import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MaterialCard from './components/MaterialCard';
import UploadModal from './components/UploadModal';
import Login from './pages/Login';
import Register from './pages/Register';
import { BookOpen, Search, LogOut } from 'lucide-react';

function Dashboard({ auth, setAuth }) {
  const [materials, setMaterials] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchMaterials = () => {
    fetch('/api/materials')
      .then(res => res.json())
      .then(data => setMaterials(data))
      .catch(err => console.error("Error fetching materials:", err));
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuth(null);
  };

  const filteredMaterials = materials.filter(m => 
    m.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.course_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-text-muted bg-clip-text text-transparent">
              CampusShare
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-text-muted hidden sm:inline-block">
              {auth.user.email}
            </span>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
            >
              Subir Apunte
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 text-text-muted hover:text-red-400 transition-colors bg-background rounded-lg border border-border hover:border-red-400/50"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold mb-2">Apuntes Destacados</h2>
            <p className="text-text-muted">Encuentra material de estudio de la comunidad UCSP</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input 
              type="text" 
              placeholder="Buscar curso o tema..."
              className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-primary transition-colors text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredMaterials.map(material => (
            <MaterialCard 
              key={material.id} 
              material={material} 
              onUpvote={fetchMaterials} 
              auth={auth}
            />
          ))}
          {filteredMaterials.length === 0 && (
            <div className="col-span-full py-12 text-center text-text-muted border border-border border-dashed rounded-2xl bg-surface/30">
              No se encontraron apuntes. ¡Sé el primero en compartir!
            </div>
          )}
        </div>
      </main>

      <UploadModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onUploadSuccess={fetchMaterials} 
        auth={auth}
      />
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try { return { token, user: JSON.parse(userStr) }; } catch (e) { return null; }
    }
    return null;
  });

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={auth ? <Navigate to="/" /> : <Login setAuth={setAuth} />} />
        <Route path="/register" element={auth ? <Navigate to="/" /> : <Register />} />
        <Route path="/" element={auth ? <Dashboard auth={auth} setAuth={setAuth} /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}
