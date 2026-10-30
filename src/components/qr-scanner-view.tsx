import { useEffect, useRef, useState } from "react";
import { ImageUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  onResult: (text: string) => void;
  onClose: () => void;
};

/** Camera QR code reader. The library is loaded only in the browser. */
export function QrScannerView({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    let scanner: { stop: () => void; destroy: () => void } | null = null;

    (async () => {
      const QrScanner = (await import("qr-scanner")).default;
      if (cancelled || !videoRef.current) return;
      const instance = new QrScanner(
        videoRef.current,
        (result) => {
          if (doneRef.current) return;
          doneRef.current = true;
          instance.stop();
          onResult(result.data);
        },
        { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8 },
      );
      scanner = instance;
      try {
        await instance.start();
      } catch {
        if (!cancelled) setError("Não consegui abrir a câmera. Libere o acesso ou escolha uma foto da nota.");
      }
    })();

    return () => {
      cancelled = true;
      scanner?.stop();
      scanner?.destroy();
    };
  }, [onResult]);

  async function fromFile(file: File) {
    const QrScanner = (await import("qr-scanner")).default;
    try {
      const res = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      if (!doneRef.current) {
        doneRef.current = true;
        onResult(res.data);
      }
    } catch {
      setError("Não achei um QR Code nessa foto. Tente uma foto mais de perto.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-ink-foreground">
      <div className="flex items-center justify-between px-5 pb-3 pt-6">
        <p className="font-semibold">Aponte para o QR Code da nota</p>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar" className="text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground">
          <X className="size-5" />
        </Button>
      </div>
      <div className="relative mx-5 flex-1 overflow-hidden rounded-3xl bg-foreground">
        <video ref={videoRef} className="size-full object-cover" muted playsInline />
      </div>
      {error && <p className="mx-5 mt-3 rounded-xl bg-negative-soft p-3 text-sm text-foreground">{error}</p>}
      <div className="safe-bottom px-5 pt-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) fromFile(f);
            e.target.value = "";
          }}
        />
        <Button variant="yolk" size="lg" className="mb-3 w-full" onClick={() => fileRef.current?.click()}>
          <ImageUp /> Escolher foto da nota
        </Button>
      </div>
    </div>
  );
}
