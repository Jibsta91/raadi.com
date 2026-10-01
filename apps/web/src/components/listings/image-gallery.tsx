'use client';

import type { Listing } from '@raadi/api-client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ImageGallery({ images, title }: { images: Listing['images']; title: string }) {
  const t = useTranslations('listing');
  const [index, setIndex] = useState(0);
  const current = images[index];
  if (!current) return null;
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg bg-muted">
        <img
          src={current.urls.large}
          alt={t('imageAlt', { n: index + 1, count: images.length, title })}
          className="aspect-[4/3] w-full object-contain"
          data-testid="gallery-main"
        />
      </div>
      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto" role="list">
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={t('imageAlt', { n: i + 1, count: images.length, title })}
                aria-current={i === index}
                className={`overflow-hidden rounded-md border-2 ${i === index ? 'border-primary' : 'border-transparent'}`}
              >
                <img
                  src={img.urls.thumb}
                  alt=""
                  className="h-16 w-20 object-cover"
                  loading="lazy"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
