import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MaterialCard from './components/MaterialCard';
import UploadModal from './components/UploadModal';
import Login from './pages/Login';
import { Search, LogOut, ArrowUpDown, Plus } from 'lucide-react';

function Dashboard({ auth, setAuth }) {
  const [materials, setMaterials] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('upvotes');

  const fetchMaterials = () => {
    const headers = auth?.token ? { 'Authorization': `Bearer ${auth.token}` } : {};
    fetch('/api/materials', { headers })
      .then(res => res.json())
      .then(data => setMaterials(Array.isArray(data) ? data : []))
      .catch(err => console.error('Error fetching materials:', err));
  };

  useEffect(() => {
    fetchMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuth(null);
  };

  const filteredMaterials = materials
    .filter(m =>
      (m.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.course_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'upvotes') return (b.upvotes ?? 0) - (a.upvotes ?? 0);
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      return 0;
    });

  return (
    <div className="min-h-screen">
      {/* Editorial masthead */}
      <header className="border-b border-ink bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <a href="/" className="font-display text-2xl font-semibold tracking-tight text-ink">
              CampusShare
            </a>
            <p className="mt-0.5 text-[0.65rem] uppercase tracking-[0.2em] text-muted">
              Repositorio de apuntes · UCSP
            </p>
          </div>

          <nav aria-label="Acciones" className="flex flex-wrap items-center gap-4">
            <span className="hidden text-xs uppercase tracking-[0.12em] text-muted sm:inline-block">
              {auth.user.email}
            </span>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[0.375rem] bg-accent px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Plus className="h-4 w-4" />
              Subir Apunte
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-[0.375rem] border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-ink hover:text-ink"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="mb-12 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <h1 className="text-5xl font-medium leading-[0.95] tracking-tight text-ink sm:text-6xl">
              Apuntes destacados
            </h1>
            <span aria-hidden="true" className="mt-5 block h-px w-16 bg-accent" />
            <p className="mt-4 text-base text-muted">
              Material de estudio compartido por la comunidad de la UCSP.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <label htmlFor="search-materials" className="sr-only">Buscar curso o tema</label>
              <input
                id="search-materials"
                type="search"
                placeholder="Buscar curso o tema..."
                className="w-full rounded-[0.375rem] border border-line bg-surface py-2.5 pl-9 pr-4 text-sm text-ink transition-colors placeholder:text-muted/70 hover:border-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <label htmlFor="sort-materials" className="sr-only">Ordenar apuntes</label>
              <select
                id="sort-materials"
                className="w-full cursor-pointer rounded-[0.375rem] border border-line bg-surface py-2.5 pl-9 pr-8 text-sm text-ink transition-colors hover:border-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="upvotes">Más votados</option>
                <option value="newest">Más recientes</option>
                <option value="oldest">Más antiguos</option>
              </select>
            </div>
          </div>
        </div>

        {filteredMaterials.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredMaterials.map((material, index) => {
              const isFeatured = index === 0 && filteredMaterials.length > 2;
              return (
                <div key={material.id} className={isFeatured ? 'lg:col-span-2' : ''}>
                  <MaterialCard material={material} auth={auth} featured={isFeatured} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-line py-20 text-center">
            <p className="font-display text-2xl font-medium text-ink">Aún no hay apuntes aquí.</p>
            <p className="mt-2 text-sm text-muted">Sé el primero en compartir material con la comunidad.</p>
          </div>
        )}
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
      try { return { token, user: JSON.parse(userStr) }; } catch { return null; }
    }
    return null;
  });

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={auth ? <Navigate to="/" /> : <Login setAuth={setAuth} />} />
        <Route path="/" element={auth ? <Dashboard auth={auth} setAuth={setAuth} /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}
