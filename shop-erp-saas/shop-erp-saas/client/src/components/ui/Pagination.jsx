import { ChevronLeft, ChevronRight } from 'lucide-react';

// Shared "showing X–Y of N" footer with prev/next, for any server-paginated
// list. Renders nothing at all when everything already fits on one page, so
// adding it to a screen never changes how that screen looks for a small shop —
// it only appears once the data has actually grown.
export default function Pagination({ page, pageSize, total, onPage, loading = false }) {
  if (!total || total <= pageSize) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-3 text-sm text-slate-500">
      <span>{from}–{to} of {total}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost p-1.5"
          disabled={page <= 1 || loading}
          onClick={() => onPage(page - 1)}
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span>{page} / {pages}</span>
        <button
          type="button"
          className="btn-ghost p-1.5"
          disabled={page >= pages || loading}
          onClick={() => onPage(page + 1)}
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
