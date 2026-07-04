import {
  ArrowRight,
  Circle,
  Download,
  MousePointer2,
  Pencil,
  Slash,
  Square,
  StickyNote,
  Trash2,
  Undo2
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { DiagramShape, Point, Tool } from "./types";

interface DiagramBoardProps {
  shapes: DiagramShape[];
  setShapes: (shapes: DiagramShape[]) => void;
}

const palette = ["#2563eb", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#4b5563"];

const tools: Array<{ id: Tool; label: string; icon: typeof Square }> = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "note", label: "Note", icon: StickyNote },
  { id: "arrow", label: "Arrow", icon: ArrowRight },
  { id: "line", label: "Line", icon: Slash },
  { id: "freehand", label: "Freehand", icon: Pencil }
];

function normalizeShape(shape: DiagramShape) {
  if (shape.type === "freehand") return shape;
  const x = shape.width < 0 ? shape.x + shape.width : shape.x;
  const y = shape.height < 0 ? shape.y + shape.height : shape.y;
  return {
    ...shape,
    x,
    y,
    width: Math.abs(shape.width),
    height: Math.abs(shape.height)
  };
}

function pointsToPath(points: Point[] = []) {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")}`;
}

function downloadDiagram(shapes: DiagramShape[]) {
  const blob = new Blob([JSON.stringify(shapes, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ai-system-design-diagram.json";
  link.click();
  URL.revokeObjectURL(url);
}

export function DiagramBoard({ shapes, setShapes }: DiagramBoardProps) {
  const [tool, setTool] = useState<Tool>("rect");
  const [color, setColor] = useState(palette[0]);
  const [draft, setDraft] = useState<DiagramShape | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const visibleShapes = useMemo(() => (draft ? [...shapes, draft] : shapes), [draft, shapes]);

  function toCanvasPoint(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1200,
      y: ((event.clientY - rect.top) / rect.height) * 760
    };
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (tool === "select") return;
    const point = toCanvasPoint(event);
    const next: DiagramShape = {
      id: crypto.randomUUID(),
      type: tool,
      x: point.x,
      y: point.y,
      width: tool === "note" ? 170 : 0,
      height: tool === "note" ? 88 : 0,
      color,
      label: tool === "note" ? "Note" : undefined,
      points: tool === "freehand" ? [point] : undefined
    };
    setDraft(next);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!draft) return;
    const point = toCanvasPoint(event);
    if (draft.type === "freehand") {
      setDraft({ ...draft, points: [...(draft.points ?? []), point] });
      return;
    }
    setDraft({
      ...draft,
      width: point.x - draft.x,
      height: point.y - draft.y
    });
  }

  function onPointerUp() {
    if (!draft) return;
    const normalized = normalizeShape(draft);
    const hasSize = normalized.type === "freehand"
      ? (normalized.points?.length ?? 0) > 2
      : normalized.width > 8 || normalized.height > 8 || normalized.type === "note";
    if (hasSize) {
      setShapes([...shapes, normalized]);
    }
    setDraft(null);
  }

  return (
    <section className="board-panel" aria-label="Architecture diagram board">
      <div className="board-toolbar">
        <div className="tool-strip" aria-label="Diagram tools">
          {tools.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tool === id ? "icon-button active" : "icon-button"}
              onClick={() => setTool(id)}
              title={label}
              type="button"
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
        <div className="swatches" aria-label="Colors">
          {palette.map((swatch) => (
            <button
              key={swatch}
              className={color === swatch ? "swatch active" : "swatch"}
              onClick={() => setColor(swatch)}
              style={{ background: swatch }}
              title={swatch}
              type="button"
            />
          ))}
        </div>
        <div className="tool-actions">
          <button className="icon-button" onClick={() => setShapes(shapes.slice(0, -1))} title="Undo" type="button">
            <Undo2 size={18} />
          </button>
          <button className="icon-button" onClick={() => downloadDiagram(shapes)} title="Download JSON" type="button">
            <Download size={18} />
          </button>
          <button className="icon-button danger" onClick={() => setShapes([])} title="Clear" type="button">
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      <svg
        ref={svgRef}
        className="drawing-surface"
        viewBox="0 0 1200 760"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
            <path d="M 0 0 L 8 3 L 0 6 z" fill="currentColor" />
          </marker>
        </defs>
        <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#d7dde7" strokeWidth="1" />
        </pattern>
        <rect width="1200" height="760" fill="url(#grid)" />
        {visibleShapes.map((shape) => {
          const stroke = shape.color;
          if (shape.type === "rect") {
            return <rect key={shape.id} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#ffffff" stroke={stroke} strokeWidth="3" />;
          }
          if (shape.type === "ellipse") {
            return <ellipse key={shape.id} cx={shape.x + shape.width / 2} cy={shape.y + shape.height / 2} rx={Math.abs(shape.width / 2)} ry={Math.abs(shape.height / 2)} fill="#ffffff" stroke={stroke} strokeWidth="3" />;
          }
          if (shape.type === "note") {
            return (
              <g key={shape.id}>
                <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#fff7d6" stroke={stroke} strokeWidth="3" />
                <text x={shape.x + 14} y={shape.y + 32} fill="#1f2937" fontSize="22" fontWeight="700">
                  {shape.label}
                </text>
              </g>
            );
          }
          if (shape.type === "arrow") {
            return <line key={shape.id} x1={shape.x} y1={shape.y} x2={shape.x + shape.width} y2={shape.y + shape.height} stroke={stroke} strokeWidth="4" markerEnd="url(#arrowhead)" />;
          }
          if (shape.type === "line") {
            return <line key={shape.id} x1={shape.x} y1={shape.y} x2={shape.x + shape.width} y2={shape.y + shape.height} stroke={stroke} strokeWidth="4" strokeLinecap="round" />;
          }
          return <path key={shape.id} d={pointsToPath(shape.points)} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />;
        })}
      </svg>
    </section>
  );
}
