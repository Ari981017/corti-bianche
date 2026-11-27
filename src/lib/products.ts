import { supabase, imageUrl, formatPrice, pricePerKg, type Category, type Product } from './supabase';

/**
 * Legge prodotti e categorie da Supabase.
 * Le regole RLS restituiscono ai visitatori solo i prodotti disponibili.
 */
export async function loadCatalog(limit?: number) {
  let q = supabase
    .from('products')
    .select('id, name, slug, description, price, unit, category_id, image_path, is_available, position')
    .order('position')
    .order('name');
  if (limit) q = q.limit(limit);

  const [prod, cat] = await Promise.all([
    q,
    supabase.from('categories').select('id, name, slug, position').order('position').order('name'),
  ]);
  if (prod.error) throw prod.error;
  if (cat.error) throw cat.error;
  return { products: (prod.data ?? []) as Product[], categories: (cat.data ?? []) as Category[] };
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** Crea la scheda di un prodotto (testi inseriti con textContent, mai come HTML) */
export function productCard(p: Product, categoryName?: string) {
  const card = el('article', 'pcard reveal');

  const media = el('div', 'pcard-img');
  const src = imageUrl(p.image_path);
  if (src) {
    const img = el('img');
    img.src = src;
    img.alt = p.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    media.append(img);
  } else {
    media.classList.add('ph');
    media.append(el('span', 'ph-label', 'Foto in arrivo'));
  }

  const body = el('div', 'pcard-body');
  if (categoryName) body.append(el('span', 'pcard-cat', categoryName));
  body.append(el('h3', undefined, p.name));
  if (p.description) body.append(el('p', 'pcard-desc', p.description));

  const price = el('p', 'pcard-price', formatPrice(p.price, p.unit));
  const perKg = pricePerKg(p.price, p.unit);
  if (perKg) price.append(el('small', undefined, perKg));
  body.append(price);

  card.append(media, body);
  return card;
}
