// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CameraBarcodeScanner from "./CameraBarcodeScanner";

const scannerMocks = vi.hoisted(() => ({
  decodeFromConstraints: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromConstraints(...args: unknown[]) {
      return scannerMocks.decodeFromConstraints(...args);
    }
  },
}));

describe("CameraBarcodeScanner", () => {
  const controls = { stop: vi.fn() };
  let onDecoded: ((result?: { getText: () => string }) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    scannerMocks.decodeFromConstraints.mockImplementation(
      async (_constraints: unknown, _video: unknown, callback: (result?: { getText: () => string }) => void) => {
        onDecoded = callback;
        return controls;
      }
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("starts a webcam preview, reports readiness, and returns a detected barcode", async () => {
    const onDetected = vi.fn();
    render(<CameraBarcodeScanner onDetected={onDetected} />);

    fireEvent.click(screen.getByRole("button", { name: "Test webcam / scan barcode" }));
    await waitFor(() => expect(scannerMocks.decodeFromConstraints).toHaveBeenCalledOnce());
    expect(screen.getByRole("status").textContent).toContain("Camera is ready");

    await act(async () => {
      onDecoded?.({ getText: () => "0123456789012" });
    });

    expect(onDetected).toHaveBeenCalledWith("0123456789012");
    expect(screen.getByRole("status").textContent).toContain("0123456789012");
    await waitFor(() => expect(controls.stop).toHaveBeenCalled());
  });

  it("shows a clear error when webcam permission is denied", async () => {
    scannerMocks.decodeFromConstraints.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError")
    );
    render(<CameraBarcodeScanner onDetected={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Test webcam / scan barcode" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Camera permission was denied");
  });
});
