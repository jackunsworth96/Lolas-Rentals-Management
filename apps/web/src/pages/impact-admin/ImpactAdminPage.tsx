import { useState, useRef } from 'react';
import { Pencil, Trash2, Plus, ExternalLink, Eye, EyeOff, Globe, ImagePlus, Film } from 'lucide-react';
import {
  useAdminArticles,
  useAdminNgos,
  useCreateArticle,
  useUpdateArticle,
  useDeleteArticle,
  useAdminArticle,
  type UpsertArticlePayload,
} from '../../api/impact.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  ngo: 'NGO',
  automation: 'Automation',
  general: 'Community',
};

const CATEGORY_COLOURS: Record<string, string> = {
  ngo: 'bg-teal-100 text-teal-800',
  automation: 'bg-purple-100 text-purple-800',
  general: 'bg-amber-100 text-amber-800',
};

function insertAtCursor(
  textarea: HTMLTextAreaElement | null,
  value: string,
  snippet: string,
  setValue: (next: string) => void,
) {
  if (!textarea) {
    const needsNewline = value.length > 0 && !value.endsWith('\n');
    setValue(`${value}${needsNewline ? '\n\n' : ''}${snippet}`);
    return;
  }

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = value.slice(0, start);
  const after = value.slice(end);

  let padBefore = '';
  if (before.length > 0 && !before.endsWith('\n')) padBefore = '\n\n';
  else if (before.endsWith('\n') && !before.endsWith('\n\n')) padBefore = '\n';

  const padAfter = after.length > 0 && !after.startsWith('\n') ? '\n\n' : '';
  const next = `${before}${padBefore}${snippet}${padAfter}${after}`;
  setValue(next);

  const cursor = before.length + padBefore.length + snippet.length + padAfter.length;
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
}

// ── Article Editor Modal ──────────────────────────────────────────────────────

function ArticleEditorModal({
  editId,
  onClose,
}: {
  editId: string | null;
  onClose: () => void;
}) {
  const { data: ngos = [] } = useAdminNgos();
  const { data: existing } = useAdminArticle(editId ?? '');
  const createMut = useCreateArticle();
  const updateMut = useUpdateArticle(editId ?? '');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const isEdit = !!editId;
  const isBusy = createMut.isPending || updateMut.isPending;

  const [form, setForm] = useState<{
    title: string;
    slug: string;
    excerpt: string;
    body_markdown: string;
    category: 'ngo' | 'automation' | 'general';
    ngo_id: string;
    featured_image_url: string;
    meta_description: string;
    tags: string;
    published: boolean;
  }>({
    title: existing?.title ?? '',
    slug: existing?.slug ?? '',
    excerpt: existing?.excerpt ?? '',
    body_markdown: existing?.body_markdown ?? '',
    category: (existing?.category as 'ngo' | 'automation' | 'general') ?? 'general',
    ngo_id: existing?.ngo_id ?? '',
    featured_image_url: existing?.featured_image_url ?? '',
    meta_description: existing?.meta_description ?? '',
    tags: (existing?.tags ?? []).join(', '),
    published: !!existing?.published_at,
  });

  // Sync form once existing data loads (for edit mode)
  const [synced, setSynced] = useState(false);
  if (existing && !synced) {
    setForm({
      title: existing.title,
      slug: existing.slug,
      excerpt: existing.excerpt ?? '',
      body_markdown: existing.body_markdown ?? '',
      category: existing.category,
      ngo_id: existing.ngo_id ?? '',
      featured_image_url: existing.featured_image_url ?? '',
      meta_description: existing.meta_description ?? '',
      tags: (existing.tags ?? []).join(', '),
      published: !!existing.published_at,
    });
    setSynced(true);
  }

  function set(k: keyof typeof form, v: string | boolean) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleInsertMedia(kind: 'image' | 'video') {
    const url = window.prompt(
      kind === 'image'
        ? 'Paste the Cloudinary image URL:'
        : 'Paste the Cloudinary video URL:',
    )?.trim();
    if (!url) return;

    const alt =
      window.prompt(
        kind === 'image' ? 'Alt text (optional):' : 'Video label / caption (optional):',
        '',
      )?.trim() ?? '';

    const snippet = `![${alt}](${url})`;
    insertAtCursor(bodyRef.current, form.body_markdown, snippet, (next) => set('body_markdown', next));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: UpsertArticlePayload = {
      title: form.title,
      slug: form.slug || undefined,
      excerpt: form.excerpt || null,
      body_markdown: form.body_markdown || null,
      category: form.category,
      ngo_id: form.ngo_id || null,
      featured_image_url: form.featured_image_url || null,
      meta_description: form.meta_description || null,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      published: form.published,
    };

    if (isEdit) {
      await updateMut.mutateAsync(payload);
    } else {
      await createMut.mutateAsync(payload);
    }
    onClose();
  }

  const labelClass = 'block text-[12px] font-semibold text-charcoal-brand/60 mb-1';
  const inputClass = 'w-full rounded-lg border border-charcoal-brand/15 bg-white px-3 py-2 text-[13px] text-charcoal-brand focus:border-teal-brand focus:outline-none';
  const mediaBtnClass =
    'inline-flex items-center gap-1.5 rounded-lg border border-charcoal-brand/15 bg-white px-3 py-1.5 text-[12px] font-medium text-charcoal-brand/70 hover:border-teal-brand/40 hover:text-teal-brand';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white my-8 shadow-2xl">
        <div className="flex items-center justify-between border-b border-charcoal-brand/10 px-6 py-4">
          <h2 className="text-[16px] font-bold text-charcoal-brand">
            {isEdit ? 'Edit Article' : 'New Article'}
          </h2>
          <button type="button" onClick={onClose} className="text-charcoal-brand/40 hover:text-charcoal-brand text-xl leading-none">✕</button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4 p-6">
          <div>
            <label className={labelClass}>Title *</label>
            <input required className={inputClass} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Article title" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Slug (auto-generated if blank)</label>
              <input className={inputClass} value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="my-article-slug" />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value as 'ngo' | 'automation' | 'general')}>
                <option value="general">Community / General</option>
                <option value="ngo">NGO</option>
                <option value="automation">Automation</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>NGO (optional — link to a specific NGO)</label>
            <select className={inputClass} value={form.ngo_id} onChange={(e) => set('ngo_id', e.target.value)}>
              <option value="">None</option>
              {ngos.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Excerpt (shown on the article card)</label>
            <textarea
              className={`${inputClass} resize-y`}
              rows={2}
              value={form.excerpt}
              onChange={(e) => set('excerpt', e.target.value)}
              placeholder="A one or two sentence summary…"
            />
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label className={labelClass + ' mb-0'}>Body (Markdown)</label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={mediaBtnClass} onClick={() => handleInsertMedia('image')}>
                  <ImagePlus className="h-3.5 w-3.5" />
                  Insert image
                </button>
                <button type="button" className={mediaBtnClass} onClick={() => handleInsertMedia('video')}>
                  <Film className="h-3.5 w-3.5" />
                  Insert video
                </button>
              </div>
            </div>
            <p className="mb-2 text-[11px] text-charcoal-brand/45">
              Upload in Cloudinary → copy the delivery URL → Insert image/video (or paste markdown yourself).
            </p>
            <textarea
              ref={bodyRef}
              className={`${inputClass} resize-y font-mono text-[12px]`}
              rows={12}
              value={form.body_markdown}
              onChange={(e) => set('body_markdown', e.target.value)}
              placeholder={"Write your article in Markdown…\n\n# Heading\n\n## Sub-heading\n\nParagraph text here.\n\n![Photo caption](https://res.cloudinary.com/…/image/upload/…)"}
            />
          </div>

          <div>
            <label className={labelClass}>Featured Image URL</label>
            <input className={inputClass} type="url" value={form.featured_image_url} onChange={(e) => set('featured_image_url', e.target.value)} placeholder="https://res.cloudinary.com/…/image/upload/…" />
            <p className="mt-1 text-[11px] text-charcoal-brand/45">
              Paste a Cloudinary delivery URL for the card and article hero image.
            </p>
          </div>

          <div>
            <label className={labelClass}>Meta Description (max 160 chars — for SEO)</label>
            <input
              className={inputClass}
              maxLength={160}
              value={form.meta_description}
              onChange={(e) => set('meta_description', e.target.value)}
              placeholder="Short description for search engines…"
            />
            <p className="mt-0.5 text-right text-[10px] text-charcoal-brand/30">{form.meta_description.length}/160</p>
          </div>

          <div>
            <label className={labelClass}>Tags (comma-separated)</label>
            <input className={inputClass} value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="siargao, animals, welfare" />
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-charcoal-brand/10 bg-sand-brand/30 px-4 py-3">
            <input
              id="published"
              type="checkbox"
              checked={form.published}
              onChange={(e) => set('published', e.target.checked)}
              className="h-4 w-4 accent-teal-brand"
            />
            <label htmlFor="published" className="text-[13px] font-semibold text-charcoal-brand cursor-pointer">
              {form.published ? '🟢 Published — visible on /impact' : '⚫ Draft — not visible publicly'}
            </label>
          </div>

          {(createMut.isError || updateMut.isError) && (
            <p className="rounded-lg bg-red-50 p-3 text-[12px] text-red-700">
              {(createMut.error as Error)?.message ?? (updateMut.error as Error)?.message ?? 'Something went wrong.'}
            </p>
          )}

          <div className="flex justify-end gap-3 border-t border-charcoal-brand/10 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-charcoal-brand/15 px-4 py-2 text-[13px] text-charcoal-brand/60 hover:bg-sand-brand/40">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-lg bg-teal-brand px-5 py-2 text-[13px] font-bold text-white hover:bg-[#00496a] disabled:opacity-50"
            >
              {isBusy ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Article'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ImpactAdminPage() {
  const { data: articles = [], isLoading } = useAdminArticles();
  const deleteMut = useDeleteArticle();

  const [editId, setEditId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  function openCreate() {
    setEditId(null);
    setShowModal(true);
  }

  function openEdit(id: string) {
    setEditId(id);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditId(null);
  }

  async function handleDelete(id: string) {
    await deleteMut.mutateAsync(id);
    setDeleteConfirmId(null);
  }

  const published = articles.filter((a) => !!a.published_at);
  const drafts = articles.filter((a) => !a.published_at);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-charcoal-brand">Impact Articles</h1>
            <p className="mt-0.5 text-[13px] text-charcoal-brand/50">
              {published.length} published · {drafts.length} draft{drafts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/book/impact"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-charcoal-brand/15 bg-white px-3 py-2 text-[12px] font-medium text-charcoal-brand/60 hover:bg-sand-brand/40"
            >
              <Globe className="h-3.5 w-3.5" />
              View public page
            </a>
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-1.5 rounded-lg bg-teal-brand px-4 py-2 text-[13px] font-bold text-white hover:bg-[#00496a]"
            >
              <Plus className="h-4 w-4" />
              New Article
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
          </div>
        )}

        {!isLoading && articles.length === 0 && (
          <div className="rounded-2xl border border-charcoal-brand/10 bg-white py-20 text-center">
            <p className="mb-2 text-[15px] font-semibold text-charcoal-brand">No articles yet</p>
            <p className="mb-6 text-[13px] text-charcoal-brand/50">Create your first article to get started.</p>
            <button type="button" onClick={openCreate} className="rounded-lg bg-teal-brand px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#00496a]">
              + New Article
            </button>
          </div>
        )}

        {/* Article list */}
        {!isLoading && articles.length > 0 && (
          <div className="space-y-3">
            {articles.map((article) => {
              const isPublished = !!article.published_at;
              const date = article.published_at
                ? new Date(article.published_at).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })
                : null;

              return (
                <div
                  key={article.id}
                  className="flex items-start gap-4 rounded-xl border border-charcoal-brand/10 bg-white p-4"
                >
                  {article.featured_image_url && (
                    <img
                      src={article.featured_image_url}
                      alt=""
                      className="hidden h-16 w-24 shrink-0 rounded-lg object-cover sm:block"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_COLOURS[article.category] ?? CATEGORY_COLOURS.general}`}>
                        {CATEGORY_LABELS[article.category] ?? article.category}
                      </span>
                      {isPublished ? (
                        <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                          <Eye className="h-2.5 w-2.5" /> Published {date}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                          <EyeOff className="h-2.5 w-2.5" /> Draft
                        </span>
                      )}
                      {article.ngos && (
                        <span className="text-[11px] text-charcoal-brand/40">{article.ngos.name}</span>
                      )}
                    </div>
                    <p className="truncate text-[14px] font-semibold text-charcoal-brand">{article.title}</p>
                    {article.excerpt && (
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-charcoal-brand/50">{article.excerpt}</p>
                    )}
                    <p className="mt-1 text-[11px] text-charcoal-brand/30 font-mono">/book/impact/{article.slug}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isPublished && (
                      <a
                        href={`/book/impact/${article.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-charcoal-brand/40 hover:bg-sand-brand hover:text-teal-brand"
                        title="View live"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(article.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-charcoal-brand/40 hover:bg-sand-brand hover:text-teal-brand"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {deleteConfirmId === article.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => { void handleDelete(article.id); }}
                          disabled={deleteMut.isPending}
                          className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="rounded-lg border border-charcoal-brand/15 px-2.5 py-1 text-[11px] text-charcoal-brand/60 hover:bg-sand-brand/40"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(article.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-charcoal-brand/40 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <ArticleEditorModal editId={editId} onClose={closeModal} />
      )}
    </div>
  );
}
