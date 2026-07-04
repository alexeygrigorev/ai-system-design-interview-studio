import {
  ArrowRight,
  BrainCircuit,
  Circle,
  Database,
  Download,
  GitBranch,
  HardDrive,
  ListOrdered,
  MousePointer2,
  Pencil,
  Server,
  Slash,
  Square,
  StickyNote,
  Trash2,
  Undo2
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DiagramShape, Point, PrimitiveKind, Tool } from "./types";

interface DiagramBoardProps {
  shapes: DiagramShape[];
  setShapes: Dispatch<SetStateAction<DiagramShape[]>>;
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

const primitiveButtons: Array<{ kind: PrimitiveKind; label: string; icon: typeof Server; color: string }> = [
  { kind: "service", label: "Service", icon: Server, color: "#2563eb" },
  { kind: "datastore", label: "Datastore", icon: Database, color: "#16a34a" },
  { kind: "queue", label: "Queue", icon: ListOrdered, color: "#d97706" },
  { kind: "vector-index", label: "Vector index", icon: HardDrive, color: "#0891b2" },
  { kind: "model", label: "Model", icon: BrainCircuit, color: "#7c3aed" },
  { kind: "tool", label: "Tool", icon: GitBranch, color: "#4b5563" },
  { kind: "human-review", label: "Human review", icon: StickyNote, color: "#dc2626" }
];

function normalizeShape(shape: DiagramShape) {
  if (shape.type === "freehand" || shape.type === "line" || shape.type === "arrow") return shape;
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

function shapeBounds(shape: DiagramShape) {
  if (shape.type === "freehand") {
    const points = shape.points ?? [];
    const xs = [shape.x, ...points.map((point) => point.x)];
    const ys = [shape.y, ...points.map((point) => point.y)];
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys)
    };
  }

  if (shape.type === "line" || shape.type === "arrow") {
    const x2 = shape.x + shape.width;
    const y2 = shape.y + shape.height;
    return {
      x: Math.min(shape.x, x2),
      y: Math.min(shape.y, y2),
      width: Math.abs(shape.width),
      height: Math.abs(shape.height)
    };
  }

  return normalizeShape(shape);
}

function shapeContains(shape: DiagramShape, point: Point) {
  const bounds = shapeBounds(shape);
  return point.x >= bounds.x - 8
    && point.x <= bounds.x + bounds.width + 8
    && point.y >= bounds.y - 8
    && point.y <= bounds.y + bounds.height + 8;
}

function centerLabel(shape: DiagramShape) {
  return {
    x: shape.x + shape.width / 2,
    y: shape.y + shape.height / 2
  };
}

function displayLabel(label: string) {
  return label.length > 24 ? `${label.slice(0, 21)}...` : label;
}

export function DiagramBoard({ shapes, setShapes }: DiagramBoardProps) {
  const [tool, setTool] = useState<Tool>("rect");
  const [color, setColor] = useState(palette[0]);
  const [draft, setDraft] = useState<DiagramShape | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const visibleShapes = useMemo(() => (draft ? [...shapes, draft] : shapes), [draft, shapes]);
  const selectedShape = shapes.find((shape) => shape.id === selectedId) ?? null;

  function toCanvasPoint(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1200,
      y: ((event.clientY - rect.top) / rect.height) * 760
    };
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const point = toCanvasPoint(event);

    if (tool === "select") {
      const hit = [...shapes].reverse().find((shape) => shapeContains(shape, point));
      setSelectedId(hit?.id ?? null);
      if (hit) setColor(hit.color);
      setDragStart(hit ? point : null);
      if (hit) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }

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
    setSelectedId(null);
    setDraft(next);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (tool === "select" && selectedId && dragStart) {
      const point = toCanvasPoint(event);
      const dx = point.x - dragStart.x;
      const dy = point.y - dragStart.y;
      setShapes((currentShapes) => currentShapes.map((shape) => {
        if (shape.id !== selectedId) return shape;
        if (shape.type === "freehand") {
          return {
            ...shape,
            x: shape.x + dx,
            y: shape.y + dy,
            points: shape.points?.map((freehandPoint) => ({
              x: freehandPoint.x + dx,
              y: freehandPoint.y + dy
            }))
          };
        }
        return { ...shape, x: shape.x + dx, y: shape.y + dy };
      }));
      setDragStart(point);
      return;
    }

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
    if (tool === "select") {
      setDragStart(null);
      return;
    }

    if (!draft) return;
    const normalized = normalizeShape(draft);
    const hasSize = normalized.type === "freehand"
      ? (normalized.points?.length ?? 0) > 2
      : normalized.width > 8 || normalized.height > 8 || normalized.type === "note";
    if (hasSize) {
      setShapes((currentShapes) => [...currentShapes, normalized]);
    }
    setDraft(null);
  }

  function addPrimitive(kind: PrimitiveKind, label: string, primitiveColor: string) {
    const offset = shapes.length * 18;
    const next: DiagramShape = {
      id: crypto.randomUUID(),
      type: kind === "model" || kind === "human-review" ? "ellipse" : "rect",
      primitive: kind,
      x: 120 + (offset % 280),
      y: 110 + (offset % 180),
      width: 180,
      height: 84,
      color: primitiveColor,
      label
    };
    setShapes((currentShapes) => [...currentShapes, next]);
    setSelectedId(next.id);
    setTool("select");
    setColor(primitiveColor);
  }

  function updateSelectedLabel(label: string) {
    if (!selectedId) return;
    setShapes((currentShapes) => currentShapes.map((shape) => (
      shape.id === selectedId ? { ...shape, label } : shape
    )));
  }

  function recolorSelected(nextColor: string) {
    setColor(nextColor);
    if (!selectedId) return;
    setShapes((currentShapes) => currentShapes.map((shape) => (
      shape.id === selectedId ? { ...shape, color: nextColor } : shape
    )));
  }

  function deleteSelected() {
    if (!selectedId) return;
    setShapes((currentShapes) => currentShapes.filter((shape) => shape.id !== selectedId));
    setSelectedId(null);
  }

  function undoLastShape() {
    const nextShapes = shapes.slice(0, -1);
    setShapes(nextShapes);
    if (!nextShapes.some((shape) => shape.id === selectedId)) {
      setSelectedId(null);
    }
  }

  function clearShapes() {
    setShapes([]);
    setSelectedId(null);
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
              className={(selectedShape?.color ?? color) === swatch ? "swatch active" : "swatch"}
              onClick={() => recolorSelected(swatch)}
              style={{ background: swatch }}
              title={swatch}
              type="button"
            />
          ))}
        </div>
        <div className="tool-actions">
          <button className="icon-button" onClick={undoLastShape} title="Undo" type="button">
            <Undo2 size={18} />
          </button>
          <button className="icon-button" onClick={() => downloadDiagram(shapes)} title="Download JSON" type="button">
            <Download size={18} />
          </button>
          <button className="icon-button danger" onClick={clearShapes} title="Clear" type="button">
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      <div className="primitive-toolbar" aria-label="System design primitives">
        {primitiveButtons.map(({ kind, label, icon: Icon, color: primitiveColor }) => (
          <button key={kind} className="primitive-button" onClick={() => addPrimitive(kind, label, primitiveColor)} type="button">
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div className="selection-bar">
        <label>
          Selected label
          <input
            value={selectedShape?.label ?? ""}
            onChange={(event) => updateSelectedLabel(event.target.value)}
            placeholder="Select a shape to label it"
            disabled={!selectedShape || selectedShape.type === "freehand" || selectedShape.type === "line" || selectedShape.type === "arrow"}
          />
        </label>
        <button className="secondary-button" onClick={deleteSelected} disabled={!selectedShape} type="button">
          <Trash2 size={16} />
          Delete
        </button>
      </div>
      <svg
        ref={svgRef}
        className={tool === "select" ? "drawing-surface selecting" : "drawing-surface"}
        viewBox="0 0 1200 760"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#d7dde7" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1200" height="760" fill="url(#grid)" />
        {visibleShapes.map((shape) => {
          const shapeForDisplay = normalizeShape(shape);
          const stroke = shape.color;
          const selected = shape.id === selectedId;
          if (shapeForDisplay.type === "rect") {
            const label = centerLabel(shapeForDisplay);
            return (
              <g key={shape.id}>
                <rect x={shapeForDisplay.x} y={shapeForDisplay.y} width={shapeForDisplay.width} height={shapeForDisplay.height} rx="6" fill="#ffffff" stroke={stroke} strokeWidth={selected ? "5" : "3"} />
                {shape.label && <text x={label.x} y={label.y + 7} textAnchor="middle" fill="#1f2937" fontSize="22" fontWeight="800"><title>{shape.label}</title>{displayLabel(shape.label)}</text>}
              </g>
            );
          }
          if (shapeForDisplay.type === "ellipse") {
            const label = centerLabel(shapeForDisplay);
            return (
              <g key={shape.id}>
                <ellipse cx={shapeForDisplay.x + shapeForDisplay.width / 2} cy={shapeForDisplay.y + shapeForDisplay.height / 2} rx={Math.abs(shapeForDisplay.width / 2)} ry={Math.abs(shapeForDisplay.height / 2)} fill="#ffffff" stroke={stroke} strokeWidth={selected ? "5" : "3"} />
                {shape.label && <text x={label.x} y={label.y + 7} textAnchor="middle" fill="#1f2937" fontSize="22" fontWeight="800"><title>{shape.label}</title>{displayLabel(shape.label)}</text>}
              </g>
            );
          }
          if (shapeForDisplay.type === "note") {
            return (
              <g key={shape.id}>
                <rect x={shapeForDisplay.x} y={shapeForDisplay.y} width={shapeForDisplay.width} height={shapeForDisplay.height} rx="6" fill="#fff7d6" stroke={stroke} strokeWidth={selected ? "5" : "3"} />
                <text x={shapeForDisplay.x + 14} y={shapeForDisplay.y + 32} fill="#1f2937" fontSize="22" fontWeight="700">
                  {shape.label && <title>{shape.label}</title>}
                  {shape.label ? displayLabel(shape.label) : ""}
                </text>
              </g>
            );
          }
          if (shape.type === "arrow") {
            const markerId = `arrowhead-${shape.id}`;
            return (
              <g key={shape.id}>
                <defs>
                  <marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                    <path d="M 0 0 L 8 3 L 0 6 z" fill={stroke} />
                  </marker>
                </defs>
                <line x1={shape.x} y1={shape.y} x2={shape.x + shape.width} y2={shape.y + shape.height} stroke={stroke} strokeWidth={selected ? "6" : "4"} markerEnd={`url(#${markerId})`} />
              </g>
            );
          }
          if (shape.type === "line") {
            return <line key={shape.id} x1={shape.x} y1={shape.y} x2={shape.x + shape.width} y2={shape.y + shape.height} stroke={stroke} strokeWidth={selected ? "6" : "4"} strokeLinecap="round" />;
          }
          return <path key={shape.id} d={pointsToPath(shape.points)} fill="none" stroke={stroke} strokeWidth={selected ? "6" : "4"} strokeLinecap="round" strokeLinejoin="round" />;
        })}
      </svg>
    </section>
  );
}
