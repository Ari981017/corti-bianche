/**
 * Pannello admin: accesso, prodotti (crea / modifica / elimina / disponibilità)
 * e categorie. La sicurezza vera la fanno le policy RLS su Supabase:
 * qui controlliamo solo `is_admin()` per mostrare un messaggio chiaro.
 */
import {
  supabase,
  BUCKET,
  imageUrl,
  formatPrice,
  pricePerKg,
  slugify,
  type Category,
  type Product,
  type Unit,
} from '../lib/supabase';
import { resizeImage } from '../lib/image';

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

let products: Product[] = [];
let categories: Category[] = [];

// stato della scheda aperta
let editing: Product | null = null;
let newFile: File | null = null;
let removePhoto = false;
let slugTouched = false;
let previewUrl: string | null = null;

// ---------- messaggi ----------
let toastTimer = 0;
function toast(msg: string, error = false) {
  const t = $('[data-toast]');
  t.textContent = msg;
  t.classList.toggle('err', error);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), error ? 6000 : 3000);
}

function friendlyError(e: unknown) {
  const err = e as { code?: string; message?: string };
  if (err?.code === '23505') return 'Esiste già un prodotto o una categoria con questo indirizzo (slug): cambialo.';
  if (err?.code === '42501' || /row-level security/i.test(err?.message ?? ''))
    return 'Permesso negato: questo account non può modificare i dati.';
  if (/fetch|network/i.test(err?.message ?? '')) return 'Connessione assente: riprova tra poco.';
  return err?.message || 'Qualcosa non ha funzionato. Riprova.';
}

// ---------- viste ----------
function show(view: 'login' | 'app') {
  $('[data-view="login"]').hidden = view !== 'login';
  $('[data-view="app"]').hidden = view !== 'app';
}

async function enter(email: string) {
  const { data: ok, error } = await supabase.rpc('is_admin');
  if (error || !ok) {
    await supabase.auth.signOut();
    show('login');
    $('[data-login-error]').textContent = 'Questo account non è abilitato al pannello.';
    return;
  }
  $('[data-user]').textContent = email;
  show('app');
  await refresh();
}

// ---------- dati ----------
async function refresh() {
  const [c, p] = await Promise.all([
    supabase.from('categories').select('id, name, slug, position').order('position').order('name'),
    supabase
      .from('products')
      .select('id, name, slug, description, price, unit, category_id, image_path, is_available, position')
      .order('position')
      .order('name'),
  ]);
  if (c.error || p.error) {
    toast(friendlyError(c.error ?? p.error), true);
    return;
  }
  categories = c.data as Category[];
  products = p.data as Product[];
  renderProducts();
  renderCategories();
}

const catName = (id: number | null) => categories.find((c) => c.id === id)?.name ?? 'Senza categoria';

// ---------- lista prodotti ----------
function renderProducts() {
  const list = $('[data-plist]');
  list.replaceChildren();
  $('[data-pcount]').textContent = `(${products.length})`;

  if (!products.length) {
    list.append(el('li', 'empty', 'Nessun prodotto. Tocca "Nuovo prodotto" per aggiungere il primo.'));
    return;
  }

  for (const p of products) {
    const li = el('li', p.is_available ? '' : 'off');

    const src = imageUrl(p.image_path);
    if (src) {
      const img = el('img', 'thumb');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      li.append(img);
    } else {
      li.append(el('div', 'thumb'));
    }

    const info = el('div', 'pinfo');
    info.append(el('span', 'pname', p.name));
    const perKg = pricePerKg(p.price, p.unit);
    info.append(el('span', 'pmeta', `${catName(p.category_id)} · ${formatPrice(p.price, p.unit)}${perKg ? ` (${perKg})` : ''}`));
    li.append(info);

    const actions = el('div', 'pactions');

    const sw = el('label', 'switch-label');
    const cb = el('input', 'switch');
    cb.type = 'checkbox';
    cb.checked = p.is_available;
    cb.setAttribute('aria-label', `Disponibile: ${p.name}`);
    cb.addEventListener('change', () => toggleAvailable(p, cb));
    sw.append(cb, document.createTextNode('Disponibile'));

    const edit = el('button', 'btn btn-small btn-outline', 'Modifica');
    edit.type = 'button';
    edit.addEventListener('click', () => openForm(p));

    const del = el('button', 'btn btn-small btn-danger', 'Elimina');
    del.type = 'button';
    del.addEventListener('click', () => removeProduct(p));

    actions.append(sw, edit, del);
    li.append(actions);
    list.append(li);
  }
}

async function toggleAvailable(p: Product, cb: HTMLInputElement) {
  cb.disabled = true;
  const { error } = await supabase.from('products').update({ is_available: cb.checked }).eq('id', p.id);
  cb.disabled = false;
  if (error) {
    cb.checked = !cb.checked;
    toast(friendlyError(error), true);
    return;
  }
  p.is_available = cb.checked;
  cb.closest('li')?.classList.toggle('off', !p.is_available);
  toast(p.is_available ? `"${p.name}" ora è visibile sul sito` : `"${p.name}" nascosto dal sito`);
}

async function removeProduct(p: Product) {
  if (!confirm(`Eliminare "${p.name}"?\nL'operazione non si può annullare. Se vuoi solo nasconderlo, spegni "Disponibile".`)) return;
  const { error } = await supabase.from('products').delete().eq('id', p.id);
  if (error) return toast(friendlyError(error), true);
  if (p.image_path) await supabase.storage.from(BUCKET).remove([p.image_path]);
  toast(`"${p.name}" eliminato`);
  await refresh();
}

// ---------- scheda prodotto ----------
const form = () => $<HTMLFormElement>('[data-pform]');
const field = <T extends HTMLElement = HTMLInputElement>(name: string) => form().elements.namedItem(name) as unknown as T;

function setPreview(src: string | null) {
  const box = $('[data-preview]');
  const label = box.querySelector('.ph-label') as HTMLElement;
  box.style.backgroundImage = src ? `url("${src}")` : '';
  label.hidden = !!src;
  $('[data-remove-photo]').hidden = !src;
}

function updatePerKg() {
  const price = parseFloat(field('price').value);
  const unit = field<HTMLSelectElement>('unit').value as Unit;
  const perKg = Number.isFinite(price) ? pricePerKg(price, unit) : null;
  $('[data-perkg]').textContent = perKg ? `Sul sito comparirà anche: ${perKg}` : '';
}

function openForm(p: Product | null) {
  editing = p;
  newFile = null;
  removePhoto = false;
  slugTouched = !!p;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;

  const f = form();
  f.reset();
  $('[data-ftitle]').textContent = p ? 'Modifica prodotto' : 'Nuovo prodotto';
  $('[data-ferror]').textContent = '';

  const sel = $<HTMLSelectElement>('[data-catselect]');
  sel.replaceChildren(new Option('— Senza categoria —', ''));
  for (const c of categories) sel.append(new Option(c.name, String(c.id)));

  field('name').value = p?.name ?? '';
  field('slug').value = p?.slug ?? '';
  sel.value = p?.category_id != null ? String(p.category_id) : (categories[0] ? String(categories[0].id) : '');
  field<HTMLTextAreaElement>('description').value = p?.description ?? '';
  field('price').value = p ? String(p.price) : '';
  field<HTMLSelectElement>('unit').value = p?.unit ?? 'kg';
  field('position').value = String(p?.position ?? (products.length ? Math.max(...products.map((x) => x.position)) + 1 : 0));
  field('is_available').checked = p?.is_available ?? true;
  setPreview(imageUrl(p?.image_path ?? null));
  updatePerKg();

  $<HTMLDialogElement>('[data-dialog]').showModal();
  field('name').focus();
}

function closeForm() {
  $<HTMLDialogElement>('[data-dialog]').close();
}

async function saveForm(ev: SubmitEvent) {
  ev.preventDefault();
  const errBox = $('[data-ferror]');
  errBox.textContent = '';

  const name = field('name').value.trim();
  const slug = slugify(field('slug').value || name);
  const price = parseFloat(field('price').value);
  if (!name) return void (errBox.textContent = 'Scrivi il nome del prodotto.');
  if (!slug) return void (errBox.textContent = 'Lo slug non è valido.');
  if (!Number.isFinite(price) || price < 0) return void (errBox.textContent = 'Il prezzo deve essere un numero, es. 18.50');

  const catVal = field<HTMLSelectElement>('category_id').value;
  const payload: Partial<Product> = {
    name,
    slug,
    category_id: catVal ? Number(catVal) : null,
    description: field<HTMLTextAreaElement>('description').value.trim() || null,
    price: Math.round(price * 100) / 100,
    unit: field<HTMLSelectElement>('unit').value as Unit,
    position: parseInt(field('position').value, 10) || 0,
    is_available: field('is_available').checked,
  };

  const saveBtn = $<HTMLButtonElement>('[data-save]');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvataggio…';

  let uploaded: string | null = null;
  const oldPath = editing?.image_path ?? null;
  try {
    if (newFile) {
      const { blob, ext, type } = await resizeImage(newFile);
      uploaded = `${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(uploaded, blob, { contentType: type, upsert: false });
      if (up.error) throw up.error;
      payload.image_path = uploaded;
    } else if (removePhoto) {
      payload.image_path = null;
    }

    const res = editing
      ? await supabase.from('products').update(payload).eq('id', editing.id)
      : await supabase.from('products').insert(payload);
    if (res.error) throw res.error;

    // la vecchia foto non serve più
    if (oldPath && (uploaded || removePhoto)) await supabase.storage.from(BUCKET).remove([oldPath]);

    closeForm();
    toast(editing ? 'Prodotto aggiornato' : 'Prodotto aggiunto');
    await refresh();
  } catch (e) {
    if (uploaded) await supabase.storage.from(BUCKET).remove([uploaded]);
    errBox.textContent = friendlyError(e);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Salva';
  }
}

// ---------- categorie ----------
function renderCategories() {
  const list = $('[data-clist]');
  list.replaceChildren();
  if (!categories.length) {
    list.append(el('li', 'empty', 'Nessuna categoria. Aggiungine una, per esempio "Freschi".'));
    return;
  }
  for (const c of categories) {
    const li = el('li');

    const nameL = el('label', 'cname', 'Nome');
    const name = el('input');
    name.value = c.name;
    name.required = true;
    nameL.append(name);

    const posL = el('label', 'cpos', 'Ordine');
    const pos = el('input');
    pos.type = 'number';
    pos.step = '1';
    pos.value = String(c.position);
    posL.append(pos);

    const save = el('button', 'btn btn-small btn-outline', 'Salva');
    save.type = 'button';
    save.addEventListener('click', async () => {
      const n = name.value.trim();
      if (!n) return toast('Il nome non può essere vuoto', true);
      const { error } = await supabase
        .from('categories')
        .update({ name: n, slug: slugify(n), position: parseInt(pos.value, 10) || 0 })
        .eq('id', c.id);
      if (error) return toast(friendlyError(error), true);
      toast('Categoria salvata');
      await refresh();
    });

    const used = products.filter((p) => p.category_id === c.id).length;
    const del = el('button', 'btn btn-small btn-danger', 'Elimina');
    del.type = 'button';
    del.addEventListener('click', async () => {
      const msg = used
        ? `Eliminare "${c.name}"? I suoi ${used} prodotti resteranno, ma senza categoria.`
        : `Eliminare "${c.name}"?`;
      if (!confirm(msg)) return;
      const { error } = await supabase.from('categories').delete().eq('id', c.id);
      if (error) return toast(friendlyError(error), true);
      toast('Categoria eliminata');
      await refresh();
    });

    li.append(nameL, posL, save, del);
    list.append(li);
  }
}

async function addCategory(ev: SubmitEvent) {
  ev.preventDefault();
  const f = ev.currentTarget as HTMLFormElement;
  const input = f.elements.namedItem('name') as HTMLInputElement;
  const n = input.value.trim();
  if (!n) return;
  const position = categories.length ? Math.max(...categories.map((c) => c.position)) + 1 : 0;
  const { error } = await supabase.from('categories').insert({ name: n, slug: slugify(n), position });
  if (error) return toast(friendlyError(error), true);
  input.value = '';
  toast('Categoria aggiunta');
  await refresh();
}

// ---------- avvio ----------
export async function initAdmin() {
  // accesso
  $<HTMLFormElement>('[data-login]').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget as HTMLFormElement;
    const btn = f.querySelector('button')!;
    const errBox = $('[data-login-error]');
    errBox.textContent = '';
    btn.disabled = true;
    const email = (f.elements.namedItem('email') as HTMLInputElement).value.trim();
    const password = (f.elements.namedItem('password') as HTMLInputElement).value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error || !data.user) {
      errBox.textContent = 'Email o password non corretti.';
      return;
    }
    f.reset();
    await enter(data.user.email ?? email);
  });

  $('[data-logout]').addEventListener('click', async () => {
    await supabase.auth.signOut();
    show('login');
  });

  // schede
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((tab) =>
    tab.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((t) =>
        t.setAttribute('aria-selected', String(t === tab)),
      );
      document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => {
        p.hidden = p.dataset.panel !== tab.dataset.tab;
      });
    }),
  );

  // prodotti
  $('[data-new]').addEventListener('click', () => openForm(null));
  form().addEventListener('submit', saveForm);
  document.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', closeForm));
  field('name').addEventListener('input', () => {
    if (!slugTouched) field('slug').value = slugify(field('name').value);
  });
  field('slug').addEventListener('input', () => (slugTouched = true));
  field('price').addEventListener('input', updatePerKg);
  field<HTMLSelectElement>('unit').addEventListener('change', updatePerKg);

  $<HTMLInputElement>('[data-file]').addEventListener('change', (ev) => {
    const file = (ev.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Scegli un file immagine', true);
    newFile = file;
    removePhoto = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
  });
  $('[data-remove-photo]').addEventListener('click', () => {
    newFile = null;
    removePhoto = true;
    $<HTMLInputElement>('[data-file]').value = '';
    setPreview(null);
  });

  // categorie
  $<HTMLFormElement>('[data-cat-add]').addEventListener('submit', addCategory);

  // sessione già aperta?
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) await enter(data.session.user.email ?? '');
  else show('login');

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') show('login');
  });
}
