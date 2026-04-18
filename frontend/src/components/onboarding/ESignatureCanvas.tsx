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

    // High-DPI fix
    const ratio = window.devicePixelRatio ?? 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);

    padRef.current = new SignaturePad(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "#1e1b4b",
    });

    padRef.current.addEventListener("endStroke", () => {
      setIsEmpty(padRef.current?.isEmpty() ?? true);
      setSaved(false);
    });

    return () => padRef.current?.off();
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
          style={{ height: 160 }}
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
