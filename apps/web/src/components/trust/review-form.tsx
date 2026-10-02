'use client';

import { Button, cn } from '@raadi/ui';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useRouter } from '@/i18n/navigation';

/** Rate the other party of a sold listing (shown in the conversation). */
export function ReviewForm({
  listingId,
  subjectId,
  subjectName,
  subjectRole,
}: {
  listingId: string;
  subjectId: string;
  subjectName: string;
  subjectRole: 'buyer' | 'seller';
}) {
  const t = useTranslations('trust');
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (rating === 0) return setError(t('form.pickRating'));
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/trust/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ listingId, subjectId, rating, comment }),
      });
      if (res.ok || res.status === 409) {
        router.refresh();
        return;
      }
      setError(t(res.status === 429 ? 'form.rateLimited' : 'form.error'));
    } catch {
      setError(t('form.error'));
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4" data-testid="review-form">
      <h2 className="font-semibold">
        {t(subjectRole === 'seller' ? 'form.titleSeller' : 'form.titleBuyer', {
          name: subjectName,
        })}
      </h2>
      <fieldset>
        <legend className="sr-only">{t('form.rating')}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={rating === n}
              aria-label={t('stars', { count: n })}
              data-testid={`review-star-${n}`}
              onClick={() => setRating(n)}
              className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star
                aria-hidden
                className={cn(
                  'size-7',
                  n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50',
                )}
              />
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('form.comment')}</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={3}
          data-testid="review-comment"
          className="w-full rounded-md border border-input bg-background p-2 text-sm"
        />
      </label>
      <p className="text-xs text-muted-foreground">{t('form.public')}</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive" data-testid="review-error">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={sending} data-testid="review-submit">
        {t('form.submit')}
      </Button>
    </form>
  );
}
