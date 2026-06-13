import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MaterialCard from './components/MaterialCard';
import UploadModal from './components/UploadModal';
import Login from './pages/Login';
import Register from './pages/Register';
import { BookOpen, Search, LogOut, ArrowUpDown } from 'lucide-react';

function Dashboard({ auth, setAuth }) {
  const [materials, setMaterials] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('upvotes');

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
    (m.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.course_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    if (sortBy === 'upvotes') return b.upvotes - a.upvotes;
    if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    return 0;
  });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-surface/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-gradient-to-br from-primary to-accent p-2 shadow-glow">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-text-main">
              CampusShare
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <span className="hidden text-sm text-text-muted sm:inline-block">
              {auth.user.email}
            </span>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-dark hover:shadow-glow active:scale-95"
            >
              Subir Apunte
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-border bg-background/60 p-2 text-text-muted transition-colors hover:border-red-400/50 hover:text-red-400 active:scale-95"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <h2 className="font-display text-4xl font-bold leading-tight tracking-tight text-text-main">Apuntes Destacados</h2>
            <p className="mt-2 text-text-muted">Encuentra material de estudio de la comunidad UCSP</p>
          </div>
          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
            <div className="relative w-full md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
              <label htmlFor="search-materials" className="sr-only">Buscar curso o tema</label>
              <input
                id="search-materials"
                type="search"
                placeholder="Buscar curso o tema..."
                className="w-full rounded-lg border border-border bg-surface/70 py-2.5 pl-10 pr-4 text-sm text-text-main backdrop-blur-md transition-colors placeholder:text-text-muted/70 hover:border-border focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                <ArrowUpDown className="h-4 w-4" />
              </div>
              <label htmlFor="sort-materials" className="sr-only">Ordenar apuntes</label>
              <select
                id="sort-materials"
                className="w-full cursor-pointer rounded-lg border border-border bg-surface/70 py-2.5 pl-9 pr-8 text-sm text-text-main backdrop-blur-md transition-colors hover:border-border focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="upvotes">Más Votados</option>
                <option value="newest">Más Recientes</option>
                <option value="oldest">Más Antiguos</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredMaterials.map(material => (
            <MaterialCard
              key={material.id}
              material={material}
              onUpvote={fetchMaterials}
              auth={auth}
            />
          ))}
          {filteredMaterials.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-border bg-surface/30 py-16 text-center text-text-muted">
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
