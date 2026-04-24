"use client";

import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Undo2, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface ESignatureCanvasProps {
  onSave?: (dataUrl: string) => void;
  className?: string;
}

export function ESignatureCanvas({ onSave, className }: ESignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create the pad with smooth stroke settings.
    padRef.current = new SignaturePad(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "#134E4A",
      minWidth: 1,
      maxWidth: 3,
      velocityFilterWeight: 0.7,
    });

    padRef.current.addEventListener("endStroke", () => {
      setIsEmpty(padRef.current?.isEmpty() ?? true);
      setSaved(false);
    });

    // DPR handling: signature_pad 4.x computes event positions in CSS-pixel space.
    // Setting canvas.width resets the canvas transform to identity, so ctx.scale
    // must be re-applied every time we resize.
    //
    // We track the last bitmap dimensions to avoid calling padRef.current.clear()
    // on repeated ResizeObserver notifications with identical sizes — without this
    // guard, a Dialog's layout settling mid-draw would wipe the in-progress stroke.
    let lastW = 0;
    let lastH = 0;

    const resizeCanvas = () => {
      if (!padRef.current) return;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!w || !h) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const bitmapW = Math.round(w * ratio);
      const bitmapH = Math.round(h * ratio);
      if (bitmapW === lastW && bitmapH === lastH) return; // nothing changed
      lastW = bitmapW;
      lastH = bitmapH;
      canvas.width  = bitmapW;  // resets transform to identity
      canvas.height = bitmapH;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(ratio, ratio);
      padRef.current.clear();   // sync internal state to new dimensions
    };

    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas);
    resizeCanvas(); // immediate attempt (works when canvas already visible)

    return () => {
      ro.disconnect();
      padRef.current?.off();
      padRef.current = null;
    };
  }, []);

  const clear = () => {
    padRef.current?.clear();
    setIsEmpty(true);
    setSaved(false);
  };

  const undo = () => {
    const data = padRef.current?.toData();
    if (data && data.length > 0) {
      data.pop();
      padRef.current?.fromData(data);
      setIsEmpty(padRef.current?.isEmpty() ?? true);
    }
  };

  const save = () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    const dataUrl = padRef.current.toDataURL("image/png");
    onSave?.(dataUrl);
    setSaved(true);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-[6px] border-2 border-dashed border-border overflow-hidden bg-white dark:bg-gray-50">
        <canvas
          ref={canvasRef}
          className="w-full touch-none"
          style={{ height: 190 }}
          aria-label="Signature canvas — draw your signature"
        />
      </div>
      {isEmpty && (
        <p className="text-xs text-center text-muted-foreground">
          Draw your signature above using mouse or touch
        </p>
      )}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={undo} disabled={isEmpty}>
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={isEmpty}>
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={isEmpty}
          variant={saved ? "success" : "default"}
        >
          <Check className="h-3.5 w-3.5" />
          {saved ? "Signature Saved" : "Save Signature"}
        </Button>
      </div>
    </div>
  );
}
