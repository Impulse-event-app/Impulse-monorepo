"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, X } from "lucide-react";

interface QrScannerProps {
  onScan: (code: string) => void;
}

export function QrScanner({ onScan }: QrScannerProps) {
  const [open, setOpen] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-scanner-container";

  const stop = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore — already stopped
      }
      scannerRef.current = null;
    }
  }, []);

  async function startScanner() {
    setOpen(true);
  }

  // Start scanning once the container is mounted
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function init() {
      // Small delay to let the DOM render the container
      await new Promise((r) => setTimeout(r, 100));
      if (cancelled) return;

      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            // Extract just the code segment if a full URL was encoded
            const match = decodedText.match(/IMP-[A-Z0-9]{6}/);
            const code = match ? match[0] : decodedText;
            onScan(code);
            handleClose();
          },
          () => {
            // scan errors are noise, ignore
          }
        );
      } catch (err) {
        console.error("QR scanner failed to start", err);
        handleClose();
      }
    }

    init();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    stop();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={startScanner}
        className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{background:'var(--chip-bg)', color:'var(--muted)', border:'1px solid var(--line2)'}}
      >
        <Camera size={16} />
        Scan QR
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(0,0,0,0.80)'}}>
          <div className="relative w-full max-w-sm rounded-2xl p-6" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 transition-opacity hover:opacity-70"
              style={{color:'var(--faint)'}}
            >
              <X size={20} />
            </button>
            <h2 className="mb-4 text-center text-lg font-semibold" style={{color:'var(--text)'}}>
              Scan customer QR
            </h2>
            <div id={containerId} className="overflow-hidden rounded-xl" />
            <p className="mt-3 text-center text-xs" style={{color:'var(--faint)'}}>
              Point the camera at the customer&apos;s QR code
            </p>
          </div>
        </div>
      )}
    </>
  );
}
