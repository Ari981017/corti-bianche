import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_KEY,
);

export const BUCKET = 'products';

export type Unit = 'kg' | 'etto' | 'pezzo' | 'confezione';

export type Category = {
  id: number;
  name: string;
  slug: string;
  position: number;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  unit: Unit;
  category_id: number | null;
  image_path: string | null;
  is_available: boolean;
  position: number;
};

/** URL pubblico della foto, o null se il prodotto non ha foto */
export const imageUrl = (path: string | null) =>
  path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

const unitLabel: Record<Unit, string> = {
  kg: 'kg',
  etto: 'etto',
  pezzo: 'pezzo',
  confezione: 'confezione',
};

/** "€ 2,50 / etto" */
export const formatPrice = (price: number, unit: Unit) => `${eur.format(price)} / ${unitLabel[unit] ?? unit}`;

/**
 * Prezzo al kg, da mostrare accanto al prezzo quando si vende a peso
 * (obbligo di indicare il prezzo per unità di misura). null se non serve.
 */
export const pricePerKg = (price: number, unit: Unit) =>
  unit === 'etto' ? `${eur.format(price * 10)} / kg` : null;

/** "Caciotta di Montagna" → "caciotta-di-montagna" */
export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
