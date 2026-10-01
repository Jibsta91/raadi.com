import { Badge, Card, CardContent, CardHeader, CardTitle } from '@raadi/ui';
import { CircleCheck, CircleX } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { platformStatus } from '@/lib/status';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('status');
  return { title: t('title') };
}

export default async function StatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, components] = await Promise.all([getTranslations('status'), platformStatus()]);
  const allOk = components.every((c) => c.ok);
  const groups = ['app', 'platform', 'observability'] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div
        role="status"
        data-testid="overall-status"
        className={`rounded-lg p-4 font-medium ${allOk ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'}`}
      >
        {allOk ? t('allOk') : t('degraded')}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {groups.map((group) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle>{t(`groups.${group}`)}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {components
                  .filter((c) => c.group === group)
                  .map((c) => (
                    <li key={c.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        {c.ok ? (
                          <CircleCheck aria-hidden className="size-4 text-success" />
                        ) : (
                          <CircleX aria-hidden className="size-4 text-destructive" />
                        )}
                        {c.name}
                      </span>
                      <Badge variant={c.ok ? 'outline' : 'destructive'}>
                        {c.ok ? t('latency', { ms: c.latencyMs }) : t('down')}
                      </Badge>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
