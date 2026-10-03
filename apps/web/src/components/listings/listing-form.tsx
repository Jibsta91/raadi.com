'use client';

import type { Listing, Media } from '@raadi/api-client';
import {
  CATEGORIES,
  CONDITIONS,
  EMPLOYMENT_TYPES,
  FUELS,
  GEARBOXES,
  PLACES,
  PROPERTY_TYPES,
  type Category,
} from '@raadi/catalog';
import { Button } from '@raadi/ui';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { useRouter } from '@/i18n/navigation';

type Field =
  | { key: string; kind: 'select'; options: readonly string[]; required: boolean }
  | { key: string; kind: 'text'; required: boolean }
  | { key: string; kind: 'number'; required: boolean; min?: number; max?: number };

/** The attribute inputs per category (mirrors attributeSchemas in @raadi/catalog). */
const FIELDS: Record<Category, Field[]> = {
  torget: [{ key: 'condition', kind: 'select', options: CONDITIONS, required: true }],
  bil: [
    { key: 'make', kind: 'text', required: true },
    { key: 'model', kind: 'text', required: true },
    { key: 'year', kind: 'number', required: true, min: 1900, max: new Date().getFullYear() + 1 },
    { key: 'mileageKm', kind: 'number', required: true, min: 0 },
    { key: 'fuel', kind: 'select', options: FUELS, required: true },
    { key: 'gearbox', kind: 'select', options: GEARBOXES, required: true },
  ],
  eiendom: [
    { key: 'propertyType', kind: 'select', options: PROPERTY_TYPES, required: true },
    { key: 'areaM2', kind: 'number', required: true, min: 1 },
    { key: 'bedrooms', kind: 'number', required: false, min: 0 },
  ],
  jobb: [
    { key: 'employer', kind: 'text', required: true },
    { key: 'employmentType', kind: 'select', options: EMPLOYMENT_TYPES, required: true },
  ],
  reise: [{ key: 'guests', kind: 'number', required: true, min: 1, max: 50 }],
};

const PLACES_BY_NAME = [...PLACES].sort((a, b) => a.name.localeCompare(b.name, 'nb'));
const POLICY_CODES = [
  'quota_exceeded',
  'price_above_ceiling',
  'prohibited_item',
  'too_many_images',
  'policy_undefined',
];
const IMAGE_CODES = ['malware', 'unsupported_type', 'invalid_image', 'too_large'];

interface UploadedImage {
  id: string;
  thumb: string;
}

interface Problem {
  status?: number;
  errors?: Array<{ path?: string; message?: string; code?: string }>;
}

export function ListingForm({ listing }: { listing?: Listing }) {
  const t = useTranslations();
  const router = useRouter();
  const id = useId();
  const [category, setCategory] = useState<Category | ''>(listing?.category ?? '');
  const [subcategory, setSubcategory] = useState(listing?.subcategory ?? '');
  const [attributes, setAttributes] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(listing?.attributes ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [images, setImages] = useState<UploadedImage[]>(
    listing?.images.map((i) => ({ id: i.id, thumb: i.urls.thumb })) ?? [],
  );
  const [uploading, setUploading] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isJob = category === 'jobb';

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setImageError(null);
    for (const file of Array.from(files).slice(0, 10 - images.length)) {
      setUploading((n) => n + 1);
      try {
        const body = new FormData();
        body.append('file', file);
        const res = await fetch('/api/v1/media', { method: 'POST', body });
        if (res.ok) {
          const media = (await res.json()) as Media;
          setImages((prev) => [...prev, { id: media.id, thumb: media.urls.thumb }]);
        } else {
          const problem = (await res.json().catch(() => ({}))) as Problem;
          const code = res.status === 413 ? 'too_large' : problem.errors?.[0]?.code;
          setImageError(
            t(
              `form.errors.image.${code && IMAGE_CODES.includes(code) ? code : 'generic'}` as never,
            ),
          );
        }
      } catch {
        setImageError(t('form.errors.image.generic'));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function attributePayload(): Record<string, string | number> {
    if (!category) return {};
    const out: Record<string, string | number> = {};
    for (const f of FIELDS[category]) {
      const raw = attributes[f.key]?.trim() ?? '';
      if (raw === '') continue;
      out[f.key] = f.kind === 'number' ? Number(raw) : raw;
    }
    return out;
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const price = String(form.get('priceNok') ?? '').trim();
    const payload = {
      category,
      subcategory,
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      priceNok: isJob || price === '' ? null : Number(price),
      attributes: attributePayload(),
      placeId: String(form.get('placeId') ?? ''),
      imageIds: images.map((i) => i.id),
    };
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await fetch(listing ? `/api/v1/listings/${listing.id}` : '/api/v1/listings', {
        method: listing ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(listing ? { 'if-match': `"${listing.version}"` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const saved = (await res.json()) as Listing;
        router.push(`/listings/${saved.id}`);
        router.refresh();
        return;
      }
      const problem = (await res.json().catch(() => ({}))) as Problem;
      if (res.status === 401) return setFormError(t('form.loginRequired'));
      if (res.status === 412) return setFormError(t('form.errors.conflict'));
      if (res.status === 503) return setFormError(t('form.errors.unavailable'));
      const policy = problem.errors?.find((x) => x.code && POLICY_CODES.includes(x.code));
      if (policy) return setFormError(t(`form.errors.policy.${policy.code}` as never));
      const fieldErrors: Record<string, string> = {};
      for (const err of problem.errors ?? []) {
        if (err.path) fieldErrors[err.path] = err.message ?? '';
      }
      setErrors(fieldErrors);
      setFormError(t('form.errors.validation'));
    } catch {
      setFormError(t('form.errors.generic'));
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = (path: string) =>
    `field h-11 w-full px-4 ${errors[path] ? 'border-destructive' : 'border-input'}`;
  const hint = (path: string) =>
    errors[path] ? (
      <p className="text-sm text-destructive" id={`${id}-${path}-error`}>
        {errors[path]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate data-testid="listing-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">{t('form.category')}</span>
          <select
            name="category"
            required
            value={category}
            data-testid="field-category"
            className={fieldClass('category')}
            onChange={(e) => {
              setCategory(e.target.value as Category);
              setSubcategory('');
              setAttributes({});
            }}
          >
            <option value="">{t('form.chooseCategory')}</option>
            {(Object.keys(CATEGORIES) as Category[]).map((c) => (
              <option key={c} value={c}>
                {t(`taxonomy.categories.${c}`)}
              </option>
            ))}
          </select>
          {hint('category')}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">{t('form.subcategory')}</span>
          <select
            name="subcategory"
            required
            disabled={!category}
            value={subcategory}
            data-testid="field-subcategory"
            className={fieldClass('subcategory')}
            onChange={(e) => setSubcategory(e.target.value)}
          >
            <option value="">{t('form.chooseSubcategory')}</option>
            {category
              ? CATEGORIES[category].map((s) => (
                  <option key={s} value={s}>
                    {t(`taxonomy.subcategories.${s}` as never)}
                  </option>
                ))
              : null}
          </select>
          {hint('subcategory')}
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('form.title')}</span>
        <input
          name="title"
          required
          minLength={3}
          maxLength={120}
          defaultValue={listing?.title}
          data-testid="field-title"
          aria-describedby={`${id}-title-hint`}
          className={fieldClass('title')}
        />
        <span id={`${id}-title-hint`} className="text-xs text-muted-foreground">
          {t('form.titleHint')}
        </span>
        {hint('title')}
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('form.description')}</span>
        <textarea
          name="description"
          required
          maxLength={5000}
          rows={6}
          defaultValue={listing?.description}
          data-testid="field-description"
          className={`field w-full p-4 ${errors.description ? 'border-destructive' : 'border-input'}`}
        />
        {hint('description')}
      </label>

      {category ? (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">{t('listing.details')}</legend>
          {FIELDS[category].map((f) => (
            <label key={f.key} className="space-y-1">
              <span className="text-sm font-medium">
                {t(`taxonomy.attributes.${f.key}` as never)}
              </span>
              {f.kind === 'select' ? (
                <select
                  required={f.required}
                  value={attributes[f.key] ?? ''}
                  data-testid={`field-attr-${f.key}`}
                  className={fieldClass(`attributes.${f.key}`)}
                  onChange={(e) => setAttributes((a) => ({ ...a, [f.key]: e.target.value }))}
                >
                  <option value="" />
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {t(`taxonomy.values.${f.key}.${o}` as never)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.kind}
                  required={f.required}
                  inputMode={f.kind === 'number' ? 'numeric' : undefined}
                  min={f.kind === 'number' ? f.min : undefined}
                  max={f.kind === 'number' ? f.max : undefined}
                  value={attributes[f.key] ?? ''}
                  data-testid={`field-attr-${f.key}`}
                  className={fieldClass(`attributes.${f.key}`)}
                  onChange={(e) => setAttributes((a) => ({ ...a, [f.key]: e.target.value }))}
                />
              )}
              {hint(`attributes.${f.key}`)}
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {!isJob ? (
          <label className="space-y-1">
            <span className="text-sm font-medium">{t('form.price')}</span>
            <input
              name="priceNok"
              type="number"
              min={0}
              inputMode="numeric"
              required
              defaultValue={listing?.priceNok ?? undefined}
              data-testid="field-price"
              className={fieldClass('priceNok')}
            />
            {hint('priceNok')}
          </label>
        ) : null}
        <label className="space-y-1">
          <span className="text-sm font-medium">{t('form.place')}</span>
          <select
            name="placeId"
            required
            defaultValue={listing?.location.placeId ?? ''}
            data-testid="field-place"
            className={fieldClass('placeId')}
          >
            <option value="">{t('form.choosePlace')}</option>
            {PLACES_BY_NAME.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {hint('placeId')}
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('form.images')}</legend>
        <p className="text-xs text-muted-foreground">{t('form.imagesHint')}</p>
        <ul className="flex flex-wrap gap-3" role="list" data-testid="uploaded-images">
          {images.map((img) => (
            <li key={img.id} className="relative">
              <img src={img.thumb} alt="" className="h-24 w-32 rounded-md object-cover" />
              <button
                type="button"
                aria-label={t('form.removeImage')}
                onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
                className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow ring-1 ring-border"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
          {images.length < 10 ? (
            <li>
              <label className="flex h-24 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-accent">
                {uploading > 0 ? (
                  <Loader2 aria-hidden className="size-5 animate-spin" />
                ) : (
                  <ImagePlus aria-hidden className="size-5" />
                )}
                {uploading > 0 ? t('form.uploading') : t('form.addImages')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  data-testid="field-images"
                  onChange={(e) => {
                    void upload(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </li>
          ) : null}
        </ul>
        {imageError ? (
          <p role="alert" className="text-sm text-destructive" data-testid="image-error">
            {imageError}
          </p>
        ) : null}
      </fieldset>

      {formError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
          data-testid="form-error"
        >
          {formError}
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={saving || uploading > 0}
        data-testid="submit-listing"
      >
        {saving ? t('form.saving') : listing ? t('form.submitSave') : t('form.submitCreate')}
      </Button>
    </form>
  );
}
