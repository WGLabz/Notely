import { useEffect, useMemo, useRef, useState } from "react";
import { rotateImage } from "../utils/imageProcessingUtils";
import "./ImageCropModal.css";

const ASPECT_PRESETS = [
  { value: "free", label: "Free" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "16:9", label: "16:9" },
];

const ASPECT_RATIO_MAP = {
  free: null,
  "1:1": 1,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
};

const ANNOTATION_POSITIONS = [
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
];

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function normalizeRect(start, end) {
  const x1 = clamp01(Math.min(start.x, end.x));
  const y1 = clamp01(Math.min(start.y, end.y));
  const x2 = clamp01(Math.max(start.x, end.x));
  const y2 = clamp01(Math.max(start.y, end.y));
  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

function clampRect(rect) {
  const x = clamp01(rect.x);
  const y = clamp01(rect.y);
  const maxWidth = Math.max(0, 1 - x);
  const maxHeight = Math.max(0, 1 - y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(Number(rect.width) || 0, maxWidth)),
    height: Math.max(0, Math.min(Number(rect.height) || 0, maxHeight)),
  };
}

function moveRect(initialRect, dx, dy) {
  const width = initialRect.width;
  const height = initialRect.height;
  const x = Math.min(Math.max(initialRect.x + dx, 0), Math.max(0, 1 - width));
  const y = Math.min(Math.max(initialRect.y + dy, 0), Math.max(0, 1 - height));
  return { x, y, width, height };
}

function resizeRect(initialRect, handle, point) {
  const minSize = 0.005;
  let left = initialRect.x;
  let top = initialRect.y;
  let right = initialRect.x + initialRect.width;
  let bottom = initialRect.y + initialRect.height;

  if (handle.includes("w")) left = clamp01(Math.min(point.x, right - minSize));
  if (handle.includes("e")) right = clamp01(Math.max(point.x, left + minSize));
  if (handle.includes("n")) top = clamp01(Math.min(point.y, bottom - minSize));
  if (handle.includes("s")) bottom = clamp01(Math.max(point.y, top + minSize));

  return clampRect({
    x: left,
    y: top,
    width: Math.max(minSize, right - left),
    height: Math.max(minSize, bottom - top),
  });
}

function selectionToPercent(selection) {
  if (!selection) return { left: 0, top: 0, width: 0, height: 0 };
  return {
    left: `${selection.x * 100}%`,
    top: `${selection.y * 100}%`,
    width: `${selection.width * 100}%`,
    height: `${selection.height * 100}%`,
  };
}

function fitRectToAspect(rect, ratio) {
  if (!ratio || !rect) return clampRect(rect);
  const safeRect = clampRect(rect);
  if (safeRect.width <= 0 || safeRect.height <= 0) return safeRect;

  const centerX = safeRect.x + safeRect.width / 2;
  const centerY = safeRect.y + safeRect.height / 2;
  let width = safeRect.width;
  let height = safeRect.height;
  const currentRatio = width / Math.max(height, 0.0001);

  if (currentRatio > ratio) {
    width = height * ratio;
  } else {
    height = width / ratio;
  }

  const next = {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
  return clampRect(next);
}

function buildDrawRectWithAspect(start, end, ratio) {
  if (!ratio) {
    return normalizeRect(start, end);
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const signX = dx >= 0 ? 1 : -1;
  const signY = dy >= 0 ? 1 : -1;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let width = absDx;
  let height = absDy;

  if (width / Math.max(ratio, 0.0001) <= height) {
    height = width / ratio;
  } else {
    width = height * ratio;
  }

  const x = signX >= 0 ? start.x : start.x - width;
  const y = signY >= 0 ? start.y : start.y - height;
  return clampRect({ x, y, width, height });
}

export function ImageCropModal({
  open,
  imageSrc,
  imageLabel,
  initialAnnotation = null,
  saving = false,
  onClose,
  onSave,
}) {
  const imageRef = useRef(null);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const interactionRef = useRef(null);
  const [selection, setSelection] = useState(null);
  const [aspectPreset, setAspectPreset] = useState("free");
  const [workingImageSrc, setWorkingImageSrc] = useState("");
  const [rotationAngle, setRotationAngle] = useState(0);
  const [rotating, setRotating] = useState(false);
  const [hasImageEdits, setHasImageEdits] = useState(false);
  const [annotationText, setAnnotationText] = useState("");
  const [annotationPosition, setAnnotationPosition] = useState("bottom-left");
  const [annotationDirty, setAnnotationDirty] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelection(null);
      setAspectPreset("free");
      setRotationAngle(0);
      setWorkingImageSrc("");
      setHasImageEdits(false);
      setAnnotationText("");
      setAnnotationPosition("bottom-left");
      setAnnotationDirty(false);
      interactionRef.current = null;
      return;
    }

    setWorkingImageSrc(imageSrc || "");
    setRotationAngle(0);
    setHasImageEdits(false);
    setAnnotationText(initialAnnotation?.text || "");
    setAnnotationPosition(initialAnnotation?.position || "bottom-left");
    setAnnotationDirty(false);

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [open, imageSrc, initialAnnotation, onClose]);

  const activeAspectRatio = ASPECT_RATIO_MAP[aspectPreset] || null;

  const hasSelection = useMemo(() => {
    return Boolean(selection && selection.width > 0.01 && selection.height > 0.01);
  }, [selection]);

  const hasAnnotation = annotationText.trim().length > 0;
  const currentAnnotation = hasAnnotation
    ? { text: annotationText.trim(), position: annotationPosition }
    : null;

  const getRelativePoint = (event) => {
    if (!imageRef.current) return null;
    const rect = imageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    const start = getRelativePoint(event);
    if (!start) return;
    event.preventDefault();

    const handle = event.target?.dataset?.cropHandle;
    if (selection && handle === "move") {
      interactionRef.current = {
        mode: "move",
        start,
        initialSelection: selection,
      };
    } else if (selection && handle) {
      interactionRef.current = {
        mode: "resize",
        start,
        handle,
        initialSelection: selection,
      };
    } else {
      interactionRef.current = {
        mode: "draw",
        start,
      };
      setSelection({ x: start.x, y: start.y, width: 0, height: 0 });
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const point = getRelativePoint(event);
    if (!point) return;

    if (interaction.mode === "draw") {
      setSelection(buildDrawRectWithAspect(interaction.start, point, activeAspectRatio));
      return;
    }

    if (interaction.mode === "move" && interaction.initialSelection) {
      const dx = point.x - interaction.start.x;
      const dy = point.y - interaction.start.y;
      setSelection(moveRect(interaction.initialSelection, dx, dy));
      return;
    }

    if (interaction.mode === "resize" && interaction.initialSelection && interaction.handle) {
      const resized = resizeRect(interaction.initialSelection, interaction.handle, point);
      setSelection(activeAspectRatio ? fitRectToAspect(resized, activeAspectRatio) : resized);
    }
  };

  const handlePointerUp = (event) => {
    const interaction = interactionRef.current;
    if (!interaction) return;

    const point = getRelativePoint(event);
    if (point && interaction.mode === "draw") {
      setSelection(buildDrawRectWithAspect(interaction.start, point, activeAspectRatio));
    }

    interactionRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleSave = async () => {
    if (!imageRef.current || saving || rotating) return;
    if (!hasSelection && !hasImageEdits && !annotationDirty) return;
    if (!hasSelection && !hasImageEdits) {
      await onSave?.(null, currentAnnotation);
      return;
    }

    const image = imageRef.current;
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) return;

    const sx = hasSelection ? Math.floor(selection.x * naturalWidth) : 0;
    const sy = hasSelection ? Math.floor(selection.y * naturalHeight) : 0;
    const sw = hasSelection ? Math.max(1, Math.floor(selection.width * naturalWidth)) : naturalWidth;
    const sh = hasSelection ? Math.max(1, Math.floor(selection.height * naturalHeight)) : naturalHeight;

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    const editedDataUrl = canvas.toDataURL("image/png");
    await onSave?.(editedDataUrl, currentAnnotation);
  };

  const handleAspectPresetChange = (event) => {
    const nextPreset = event.target.value;
    setAspectPreset(nextPreset);
    const nextRatio = ASPECT_RATIO_MAP[nextPreset] || null;
    if (nextRatio && selection) {
      setSelection((current) => fitRectToAspect(current, nextRatio));
    }
  };

  const handleRotationAngleChange = (event) => {
    const nextAngle = Math.max(0, Math.min(360, Math.round(Number(event.target.value) || 0)));
    setRotationAngle(nextAngle);
  };

  useEffect(() => {
    if (!open || !imageSrc) return undefined;

    const angle = Math.max(0, Math.min(360, Math.round(Number(rotationAngle) || 0)));
    if (angle === 0 || angle === 360) {
      setRotating(false);
      setWorkingImageSrc(imageSrc);
      setHasImageEdits(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setRotating(true);
      try {
        const rotatedDataUrl = await rotateImage(imageSrc, angle);
        if (!cancelled) {
          setWorkingImageSrc(rotatedDataUrl);
          setHasImageEdits(true);
          setSelection(null);
        }
      } finally {
        if (!cancelled) setRotating(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [imageSrc, open, rotationAngle]);

  if (!open) return null;

  const handleModalKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
      return;
    }

    if (event.key === "Tab") {
      const focusables = Array.from(
        modalRef.current?.querySelectorAll(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (!selection) return;

    if (event.key === "Enter" && (hasSelection || hasImageEdits) && !saving && !rotating) {
      event.preventDefault();
      void handleSave();
      return;
    }

    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const step = event.shiftKey ? 0.02 : 0.005;

    if (event.altKey) {
      setSelection((current) => {
        if (!current) return current;
        let next = { ...current };

        if (event.key === "ArrowLeft") next.width = Math.max(0.01, next.width - step);
        if (event.key === "ArrowRight") next.width = Math.min(1, next.width + step);
        if (event.key === "ArrowUp") next.height = Math.max(0.01, next.height - step);
        if (event.key === "ArrowDown") next.height = Math.min(1, next.height + step);

        if (activeAspectRatio) {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            next.height = Math.max(0.01, next.width / activeAspectRatio);
          } else {
            next.width = Math.max(0.01, next.height * activeAspectRatio);
          }
        }

        return clampRect(next);
      });
      return;
    }

    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    setSelection((current) => (current ? moveRect(current, dx, dy) : current));
  };

  return (
    <div className="image-crop-modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit image">
      <div className="image-crop-modal" ref={modalRef} onKeyDown={handleModalKeyDown}>
        <div className="image-crop-header">
          <div>
            <h3>Edit Image</h3>
            <p>{imageLabel || "Draw a rectangle to edit."} Use arrows to move, Alt+arrows to resize.</p>
          </div>
          <button ref={closeButtonRef} type="button" className="small-button" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>

        <div className="image-crop-canvas-wrap">
          <div
            className="image-crop-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img ref={imageRef} src={workingImageSrc || imageSrc} alt={imageLabel || "Image to edit"} draggable={false} />
            {hasAnnotation ? (
              <div className={`image-annotation-preview ${annotationPosition}`} aria-hidden="true">
                {annotationText.trim()}
              </div>
            ) : null}
            {selection ? (
              <div
                className="image-crop-selection"
                style={selectionToPercent(selection)}
                aria-hidden="true"
              >
                <div className="image-crop-move-zone" data-crop-handle="move" title="Move crop" />
                <span className="image-crop-handle nw" data-crop-handle="nw" />
                <span className="image-crop-handle n" data-crop-handle="n" />
                <span className="image-crop-handle ne" data-crop-handle="ne" />
                <span className="image-crop-handle e" data-crop-handle="e" />
                <span className="image-crop-handle se" data-crop-handle="se" />
                <span className="image-crop-handle s" data-crop-handle="s" />
                <span className="image-crop-handle sw" data-crop-handle="sw" />
                <span className="image-crop-handle w" data-crop-handle="w" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="image-crop-footer">
          <p className="image-crop-hint">
            Left click and drag to select an area.
          </p>
          <div className="image-crop-actions">
            <label className="image-crop-aspect-label" htmlFor="crop-aspect-preset">Aspect</label>
            <select
              id="crop-aspect-preset"
              className="image-crop-aspect-select"
              value={aspectPreset}
              onChange={handleAspectPresetChange}
              disabled={saving || rotating}
            >
              {ASPECT_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
            </select>
            <label className="image-crop-aspect-label" htmlFor="image-rotation-angle">Rotate</label>
            <input
              id="image-rotation-angle"
              className="image-crop-rotation-range"
              type="range"
              min="0"
              max="360"
              step="1"
              value={rotationAngle}
              onChange={handleRotationAngleChange}
              disabled={saving || rotating}
            />
            <input
              className="image-crop-rotation-number"
              type="number"
              min="0"
              max="360"
              step="1"
              value={rotationAngle}
              onChange={handleRotationAngleChange}
              disabled={saving || rotating}
              aria-label="Rotation degrees"
            />
            <input
              className="image-annotation-input"
              type="text"
              maxLength="80"
              value={annotationText}
              onChange={(event) => {
                setAnnotationText(event.target.value);
                setAnnotationDirty(true);
              }}
              placeholder="Annotation"
              disabled={saving || rotating}
              aria-label="Image annotation text"
            />
            <select
              className="image-crop-aspect-select"
              value={annotationPosition}
              onChange={(event) => {
                setAnnotationPosition(event.target.value);
                setAnnotationDirty(true);
              }}
              disabled={saving || rotating || !hasAnnotation}
              aria-label="Annotation position"
            >
              {ANNOTATION_POSITIONS.map((position) => (
                <option key={position.value} value={position.value}>{position.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="small-button"
              onClick={() => {
                setSelection(null);
                setRotationAngle(0);
                setAnnotationText("");
                setAnnotationPosition("bottom-left");
                setAnnotationDirty(true);
              }}
              disabled={saving || rotating || (!selection && rotationAngle === 0 && !hasAnnotation && !annotationDirty)}
            >
              Reset
            </button>
            <button
              type="button"
              className="small-button"
              onClick={handleSave}
              disabled={(!hasSelection && !hasImageEdits && !annotationDirty) || saving || rotating}
            >
              {saving ? "Saving..." : rotating ? "Previewing..." : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
