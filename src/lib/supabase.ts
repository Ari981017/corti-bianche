import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_KEY
);

export const imageUrl = (path: string | null) =>
    path ? supabase.storage.from('products').getPublicUrl(path).data.publicUrl : '/placeholder.jpg';

export const formatPrice = (price: number, unit: string) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(price) + ` / ${unit}`;