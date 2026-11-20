import { FileUp } from 'lucide-react';

interface ImportDropOverlayProps {
  visible: boolean;
  fileCount: number;
}

export function ImportDropOverlay({
  visible,
  fileCount,
}: ImportDropOverlayProps) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-8 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-lg flex-col items-center justify-center rounded-2xl border-2 border-dashed border-accent-brand/60 bg-card/95 px-8 py-14 text-center shadow-2xl">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-brand/15 text-accent-brand ring-1 ring-accent-brand/30">
          <FileUp className="size-6" />
        </div>
        <h2 className="font-sans text-lg font-semibold tracking-tight text-foreground">
          {fileCount > 1
            ? `Suelta ${fileCount} archivos para importarlos`
            : 'Suelta archivos PDF o EPUB para importar'}
        </h2>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Se copiarán a tu biblioteca local, extraerán sus metadatos y miniatura, y quedarán listos en Inbox.
        </p>
      </div>
    </div>
  );
}
