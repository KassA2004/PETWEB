import { Skeleton } from '../../components/ui/skeleton';

/**
 * The shape of the editor, before the editor.
 *
 * Deliberately the *Body* tab's layout — the tab the panel opens on — because
 * a skeleton that resolves into a differently shaped panel is a layout shift
 * announced in advance.
 */
export function CustomizerSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading the editor">
      <section className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="mx-auto h-2 w-10" />
            </div>
          ))}
        </div>
        <Skeleton className="h-6 w-full rounded-full" />
        <Skeleton className="h-6 w-full rounded-full" />
      </section>
    </div>
  );
}
