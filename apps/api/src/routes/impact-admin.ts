import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const UpsertArticleSchema = z.object({
  slug: z.string().min(1).optional(),
  title: z.string().min(1),
  excerpt: z.string().optional().nullable(),
  body_markdown: z.string().optional().nullable(),
  category: z.enum(['ngo', 'automation', 'general']).default('general'),
  ngo_id: z.string().uuid().optional().nullable(),
  featured_image_url: z.string().url().optional().nullable(),
  meta_description: z.string().max(160).optional().nullable(),
  tags: z.array(z.string()).default([]),
  published: z.boolean().default(false),
});

// ── GET /articles — list all articles (draft + published) ────────────────────
router.get('/articles', async (_req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('ngo_articles')
      .select('id, slug, title, excerpt, category, ngo_id, featured_image_url, tags, published_at, created_at, updated_at, ngos(id, slug, name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data: data ?? [] });
  } catch (err) {
    next(err);
  }
});

// ── GET /articles/:id — single article by UUID (staff can see drafts) ─────────
router.get('/articles/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('ngo_articles')
      .select('*, ngos(id, slug, name)')
      .eq('id', id)
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Article not found.' } });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ── POST /articles — create new article ──────────────────────────────────────
router.post('/articles', async (req, res, next) => {
  try {
    const parsed = UpsertArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }

    const d = parsed.data;
    const slug = d.slug || slugify(d.title) || `article-${Date.now()}`;

    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('ngo_articles')
      .insert({
        slug,
        title: d.title,
        excerpt: d.excerpt ?? null,
        body_markdown: d.body_markdown ?? null,
        category: d.category,
        ngo_id: d.ngo_id ?? null,
        featured_image_url: d.featured_image_url ?? null,
        meta_description: d.meta_description ?? null,
        tags: d.tags,
        published_at: d.published ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /articles/:id — update article ────────────────────────────────────
router.patch('/articles/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const parsed = UpsertArticleSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION', message: parsed.error.message } });
      return;
    }

    const d = parsed.data;
    const sb = getSupabaseClient();

    // If toggling published state, handle published_at carefully
    const updates: Record<string, unknown> = {};
    if (d.title !== undefined) updates.title = d.title;
    if (d.slug !== undefined) updates.slug = d.slug;
    if (d.excerpt !== undefined) updates.excerpt = d.excerpt;
    if (d.body_markdown !== undefined) updates.body_markdown = d.body_markdown;
    if (d.category !== undefined) updates.category = d.category;
    if (d.ngo_id !== undefined) updates.ngo_id = d.ngo_id;
    if (d.featured_image_url !== undefined) updates.featured_image_url = d.featured_image_url;
    if (d.meta_description !== undefined) updates.meta_description = d.meta_description;
    if (d.tags !== undefined) updates.tags = d.tags;
    if (d.published !== undefined) {
      if (d.published) {
        // Fetch current published_at — only stamp if not already published
        const { data: existing } = await sb
          .from('ngo_articles')
          .select('published_at')
          .eq('id', id)
          .single();
        updates.published_at = (existing as { published_at?: string | null })?.published_at ?? new Date().toISOString();
      } else {
        updates.published_at = null;
      }
    }

    const { data, error } = await sb
      .from('ngo_articles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /articles/:id — hard delete ───────────────────────────────────────
router.delete('/articles/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const sb = getSupabaseClient();
    const { error } = await sb.from('ngo_articles').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /ngos — list all active NGOs (for dropdowns) ─────────────────────────
router.get('/ngos', async (_req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('ngos')
      .select('id, slug, name, logo_url, website_url, is_active')
      .order('name');

    if (error) throw error;
    res.json({ success: true, data: data ?? [] });
  } catch (err) {
    next(err);
  }
});

export { router as impactAdminRoutes };
