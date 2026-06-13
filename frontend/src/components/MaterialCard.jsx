import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, ChevronUp, Download } from 'lucide-react';

export default function MaterialCard({ material, onUpvote, auth }) {
  const [upvoting, setUpvoting] = useState(false);

  const uploader = material.user_email ? material.user_email.split('@')[0] : 'Anónimo';
  const uploaderInitial = uploader.charAt(0).toUpperCase();

  const handleUpvote = async () => {
    if (!auth?.token) {
      alert("Debes iniciar sesión para votar");
      return;
    }
    
    setUpvoting(true);
    try {
      const res = await fetch(`/api/materials/${material.id}/upvote`, { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.token}`
        }
      });
      if (res.ok) {
        onUpvote();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpvoting(false);
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/70 p-5 shadow-card backdrop-blur-md transition-[border-color,box-shadow] duration-300 hover:border-primary/50 hover:shadow-glow"
    >
      <div>
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-xl bg-primary/12 p-2.5 ring-1 ring-inset ring-primary/20 transition-transform duration-300 group-hover:scale-105">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-lg font-semibold tracking-tight text-text-main">{material.title}</h3>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-accent">{material.course_name}</p>
          </div>
        </div>

        {material.description && (
          <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-text-muted">
            {material.description}
          </p>
        )}

        <div className="mb-4 flex items-center gap-2 text-xs text-text-muted">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-accent/30 text-[0.7rem] font-semibold text-text-main ring-1 ring-inset ring-border"
          >
            {uploaderInitial}
          </span>
          <span>Subido por <span className="font-medium text-text-main">{uploader}</span></span>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-4">
        <button
          type="button"
          onClick={handleUpvote}
          disabled={upvoting}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-border/60 hover:text-accent active:scale-95 disabled:opacity-60"
        >
          <ChevronUp className={`h-4 w-4 transition-transform ${upvoting ? 'animate-bounce text-accent' : 'group-hover:-translate-y-0.5'}`} />
          {material.upvotes} Votos
        </button>

        <a
          href={material.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-primary/12 px-4 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-white active:scale-95"
        >
          <Download className="h-4 w-4" />
          Descargar
        </a>
      </div>
    </motion.article>
  );
}
