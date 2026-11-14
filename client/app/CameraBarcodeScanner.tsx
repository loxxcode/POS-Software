"use client";

import { useEffect, useRef, useState } from "react";

export default function CameraBarcodeScanner({ onDetected }: { onDetected: (barcode: string) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    let stopScanner: (() => void) | undefined;

    async function startScanner() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("Camera access requires HTTPS. Use a secure address or localhost.");
        setOpen(false);
        return;
      }

      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const video = videoRef.current;
        if (!active || !video) return;

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          video,
          result => {
            if (!active || !result) return;
            const barcode = result.getText().trim();
            if (!barcode) return;
            onDetectedRef.current(barcode);
            setStatus(`Barcode detected: ${barcode}`);
            setOpen(false);
          }
        );
        stopScanner = controls.stop;
        if (active) setStatus("Camera is ready. Point it at a barcode.");
        else stopScanner();
      } catch (scanError) {
        if (!active) return;
        const name = scanError instanceof DOMException ? scanError.name : "";
        const message = name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access and try again."
          : name === "NotFoundError"
            ? "No usable camera was found on this device."
            : name === "NotReadableError"
              ? "The camera is already in use by another app."
              : scanError instanceof Error
                ? scanError.message
                : "Unable to start the camera scanner.";
        setError(message);
        setOpen(false);
      }
    }

    setError("");
    setStatus("Starting camera…");
    startScanner();
    return () => {
      active = false;
      stopScanner?.();
    };
  }, [open]);

  return <div className="barcode-camera-test">
    <button
      type="button"
      className="button button-muted barcode-scan-button"
      onClick={() => {
        setError("");
        setStatus("");
        setOpen(current => !current);
      }}
    >
      {open ? "Stop camera test" : "Test webcam / scan barcode"}
    </button>
    {status && <small className="barcode-camera-status" role="status">{status}</small>}
    {open && <div className="barcode-scanner">
      <video ref={videoRef} autoPlay muted playsInline aria-label="Webcam barcode preview" />
      <small>Point the camera at a barcode. Scanning works on HTTPS or localhost.</small>
    </div>}
    {error && <p className="inventory-error" role="alert">{error}</p>}
  </div>;
}
