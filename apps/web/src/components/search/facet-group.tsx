import type { FacetValue } from '@raadi/api-client';
import { Check } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { href, type Params, selected, toggleValue } from '@/lib/search-params';

/** One facet as a list of toggle links (works without JavaScript). */
export function FacetGroup({
  name,
  title,
  values,
  params,
  label,
}: {
  name: string;
  title: string;
  values: FacetValue[];
  params: Params;
  label: (value: string) => string;
}) {
  const active = selected(params, name);
  const shown = values.filter((v) => v.count > 0 || active.includes(v.value));
  if (shown.length === 0) return null;
  return (
    <fieldset className="space-y-1" data-testid={`facet-${name}`}>
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      <ul className="space-y-1">
        {shown.map((v) => {
          const on = active.includes(v.value);
          return (
            <li key={v.value}>
              <Link
                href={href(toggleValue(params, name, v.value))}
                role="checkbox"
                aria-checked={on}
                className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent"
                data-testid={`facet-${name}-${v.value}`}
                scroll={false}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}
                >
                  {on ? <Check aria-hidden className="size-3" /> : null}
                </span>
                <span className="flex-1">{label(v.value)}</span>
                <span className="text-xs text-muted-foreground">{v.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
