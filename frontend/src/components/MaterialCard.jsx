import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, ChevronUp, Download } from 'lucide-react';

export default function MaterialCard({ material, onUpvote, auth }) {
  const [upvoting, setUpvoting] = useState(false);

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
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-between shadow-lg hover:shadow-primary/5 transition-all"
    >
      <div>
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg line-clamp-1">{material.title}</h3>
              <p className="text-xs text-primary font-medium">{material.course_name}</p>
            </div>
          </div>
        </div>
        
        {material.description && (
          <p className="text-sm text-text-muted line-clamp-3 mb-4 leading-relaxed">
            {material.description}
          </p>
        )}
        
        <div className="flex items-center gap-2 mb-4 text-xs text-text-muted">
          <div className="w-6 h-6 rounded-full bg-border flex items-center justify-center">
            {material.user_name.charAt(0).toUpperCase()}
          </div>
          <span>Subido por <span className="text-text-main font-medium">{material.user_name}</span></span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50">
        <button 
          onClick={handleUpvote} 
          disabled={upvoting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-border transition-colors text-sm font-medium text-text-muted hover:text-primary"
        >
          <ChevronUp className={`w-4 h-4 ${upvoting ? 'animate-bounce text-primary' : ''}`} />
          {material.upvotes} Votos
        </button>

        <a 
          href={material.file_url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          Descargar
        </a>
      </div>
    </motion.div>
  );
}
