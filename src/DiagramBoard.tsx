import {
  ArrowRight,
  BrainCircuit,
  Database,
  GitBranch,
  HardDrive,
  ListOrdered,
  MousePointer2,
  Redo2,
  Server,
  StickyNote,
  Trash2,
  Undo2,
  UserCheck
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DiagramShape, Point, PrimitiveKind, Tool } from "./types";

interface DiagramBoardProps {
  shapes: DiagramShape[];
  setShapes: Dispatch<SetStateAction<DiagramShape[]>>;
}

const componentColor = "#2563eb";
const noteColor = "#d97706";
const connectorColor = "#4b5563";

const componentKinds: Array<{ kind: PrimitiveKind; label: string; icon: typeof Server }> = [
  { kind: "service", label: "Service", icon: Server },
  { kind: "datastore", label: "Datastore", icon: Database },
  { kind: "queue", label: "Queue", icon: ListOrdered },
  { kind: "vector-index", label: "Vector index", icon: HardDrive },
  { kind: "model", label: "Model", icon: BrainCircuit },
  { kind: "tool", label: "Tool", icon: GitBranch },
  { kind: "human-review", label: "Human review", icon: UserCheck }
];

function shapeBounds(shape: DiagramShape) {
  if (shape.type === "arrow") {
    const x2 = shape.x + shape.width;
    const y2 = shape.y + shape.height;
    return {
      x: Math.min(shape.x, x2),
      y: Math.min(shape.y, y2),
      width: Math.abs(shape.width),
      height: Math.abs(shape.height)
    };
  }

  return {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height
  };
}

function centerOf(shape: DiagramShape): Point {
  const bounds = shapeBounds(shape);
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}

function shapeContains(shape: DiagramShape, point: Point) {
  const bounds = shapeBounds(shape);
  return point.x >= bounds.x - 10
    && point.x <= bounds.x + bounds.width + 10
    && point.y >= bounds.y - 10
    && point.y <= bounds.y + bounds.height + 10;
}

function findShapeAt(shapes: DiagramShape[], point: Point) {
  return [...shapes]
    .reverse()
    .find((shape) => shape.type !== "arrow" && shapeContains(shape, point));
}

function displayLabel(label: string) {
  return label.length > 24 ? `${label.slice(0, 21)}...` : label;
}

function defaultSize(kind: PrimitiveKind) {
  if (kind === "model" || kind === "human-review") return { width: 190, height: 92, type: "ellipse" as const };
  return { width: 190, height: 86, type: "rect" as const };
}

function connectorEndpoints(shape: DiagramShape, shapes: DiagramShape[]) {
  const source = shapes.find((candidate) => candidate.id === shape.sourceId);
  const target = shapes.find((candidate) => candidate.id === shape.targetId);

  if (source && target) {
    const start = centerOf(source);
    const end = centerOf(target);
    return { start, end };
  }

  return {
    start: { x: shape.x, y: shape.y },
    end: { x: shape.x + shape.width, y: shape.y + shape.height }
  };
}

export function DiagramBoard({ shapes, setShapes }: DiagramBoardProps) {
  const [tool, setTool] = useState<Tool>("select");
  const [componentKind, setComponentKind] = useState<PrimitiveKind>("service");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [connectorSourceId, setConnectorSourceId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; shapeId: string } | null>(null);
  const [undoStack, setUndoStack] = useState<DiagramShape[][]>([]);
  const [redoStack, setRedoStack] = useState<DiagramShape[][]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragSnapshotRef = useRef<DiagramShape[] | null>(null);
  const didDragRef = useRef(false);

  const selectedShape = shapes.find((shape) => shape.id === selectedId) ?? null;
  const connectorSource = shapes.find((shape) => shape.id === connectorSourceId) ?? null;
  const activeKind = componentKinds.find((kind) => kind.kind === componentKind) ?? componentKinds[0];
  const ActiveKindIcon = activeKind.icon;

  const canvasClass = useMemo(() => (
    tool === "select" ? "drawing-surface selecting" : "drawing-surface"
  ), [tool]);

  function toCanvasPoint(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function rememberHistory(previousShapes: DiagramShape[]) {
    setUndoStack((currentStack) => [...currentStack.slice(-49), previousShapes]);
    setRedoStack([]);
  }

  function commitShapes(updater: (currentShapes: DiagramShape[]) => DiagramShape[]) {
    const nextShapes = updater(shapes);
    if (nextShapes === shapes) return;
    rememberHistory(shapes);
    setShapes(nextShapes);
  }

  function applyHistoricalShapes(nextShapes: DiagramShape[]) {
    setShapes(nextShapes);
    if (selectedId && !nextShapes.some((shape) => shape.id === selectedId)) setSelectedId(null);
    if (connectorSourceId && !nextShapes.some((shape) => shape.id === connectorSourceId)) setConnectorSourceId(null);
    setContextMenu(null);
  }

  function addComponent(point: Point) {
    const size = defaultSize(componentKind);
    const next: DiagramShape = {
      id: crypto.randomUUID(),
      type: size.type,
      primitive: componentKind,
      x: point.x - size.width / 2,
      y: point.y - size.height / 2,
      width: size.width,
      height: size.height,
      color: componentColor,
      label: activeKind.label
    };
    commitShapes((currentShapes) => [...currentShapes, next]);
    setSelectedId(next.id);
    setTool("select");
  }

  function addNote(point: Point) {
    const next: DiagramShape = {
      id: crypto.randomUUID(),
      type: "note",
      x: point.x - 100,
      y: point.y - 44,
      width: 200,
      height: 88,
      color: noteColor,
      label: "Note"
    };
    commitShapes((currentShapes) => [...currentShapes, next]);
    setSelectedId(next.id);
    setTool("select");
  }

  function addConnector(target: DiagramShape) {
    if (!connectorSourceId || connectorSourceId === target.id) return;
    const source = shapes.find((shape) => shape.id === connectorSourceId);
    if (!source) return;
    const start = centerOf(source);
    const end = centerOf(target);
    const next: DiagramShape = {
      id: crypto.randomUUID(),
      type: "arrow",
      x: start.x,
      y: start.y,
      width: end.x - start.x,
      height: end.y - start.y,
      color: connectorColor,
      sourceId: source.id,
      targetId: target.id
    };
    commitShapes((currentShapes) => [...currentShapes, next]);
    setSelectedId(next.id);
    setConnectorSourceId(null);
    setTool("select");
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const point = toCanvasPoint(event);
    const hit = findShapeAt(shapes, point);

    if (tool === "component") {
      addComponent(point);
      return;
    }

    if (tool === "note") {
      addNote(point);
      return;
    }

    if (tool === "connector") {
      if (!hit) return;
      if (!connectorSourceId) {
        setConnectorSourceId(hit.id);
        setSelectedId(hit.id);
        return;
      }
      addConnector(hit);
      return;
    }

    setSelectedId(hit?.id ?? null);
    setDragStart(hit ? point : null);
    if (hit) {
      dragSnapshotRef.current = shapes;
      didDragRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (tool !== "select" || !selectedId || !dragStart) return;
    const point = toCanvasPoint(event);
    const dx = point.x - dragStart.x;
    const dy = point.y - dragStart.y;
    if (dx !== 0 || dy !== 0) didDragRef.current = true;
    setShapes((currentShapes) => currentShapes.map((shape) => {
      if (shape.id !== selectedId) return shape;
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    }));
    setDragStart(point);
  }

  function onPointerUp() {
    if (didDragRef.current && dragSnapshotRef.current) {
      rememberHistory(dragSnapshotRef.current);
    }
    dragSnapshotRef.current = null;
    didDragRef.current = false;
    setDragStart(null);
  }

  function selectTool(nextTool: Tool) {
    setTool(nextTool);
    if (nextTool !== "connector") setConnectorSourceId(null);
    setContextMenu(null);
  }

  function updateSelectedLabel(label: string) {
    if (!selectedId) return;
    commitShapes((currentShapes) => currentShapes.map((shape) => (
      shape.id === selectedId ? { ...shape, label } : shape
    )));
  }

  function deleteSelected() {
    if (!selectedId) return;
    commitShapes((currentShapes) => currentShapes.filter((shape) => (
      shape.id !== selectedId && shape.sourceId !== selectedId && shape.targetId !== selectedId
    )));
    setSelectedId(null);
    setContextMenu(null);
  }

  function undo() {
    const previousShapes = undoStack.at(-1);
    if (!previousShapes) return;
    setUndoStack((currentStack) => currentStack.slice(0, -1));
    setRedoStack((currentStack) => [...currentStack.slice(-49), shapes]);
    applyHistoricalShapes(previousShapes);
  }

  function redo() {
    const nextShapes = redoStack.at(-1);
    if (!nextShapes) return;
    setRedoStack((currentStack) => currentStack.slice(0, -1));
    setUndoStack((currentStack) => [...currentStack.slice(-49), shapes]);
    applyHistoricalShapes(nextShapes);
  }

  function clearShapes() {
    if (shapes.length && !window.confirm("Clear the canvas? This removes all components, notes, and connectors.")) {
      return;
    }
    commitShapes(() => []);
    setSelectedId(null);
    setConnectorSourceId(null);
    setContextMenu(null);
    setTool("select");
  }

  function onContextMenu(event: React.MouseEvent<SVGSVGElement>) {
    event.preventDefault();
    const point = toCanvasPoint(event);
    const hit = findShapeAt(shapes, point);
    if (!hit) {
      setContextMenu(null);
      return;
    }
    setSelectedId(hit.id);
    setContextMenu({ x: event.clientX, y: event.clientY, shapeId: hit.id });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        deleteSelected();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
        event.preventDefault();
        redo();
      }
      if (event.key === "Escape") setContextMenu(null);
    }

    function onPointerDown() {
      setContextMenu(null);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [redoStack, selectedId, shapes, undoStack]);

  return (
    <section className="board-panel simple-board" aria-label="Architecture diagram board">
      <div className="board-toolbar simple-toolbar">
        <div className="tool-strip" aria-label="Diagram actions">
          <button className={tool === "select" ? "icon-button active" : "icon-button"} onClick={() => selectTool("select")} title="Pointer" type="button">
            <MousePointer2 size={18} />
          </button>
          <button className={tool === "component" ? "tool-button active" : "tool-button"} onClick={() => selectTool("component")} type="button">
            <ActiveKindIcon size={16} />
            Add component
          </button>
          <button className={tool === "connector" ? "tool-button active" : "tool-button"} onClick={() => selectTool("connector")} type="button">
            <ArrowRight size={16} />
            Connect
          </button>
          <button className={tool === "note" ? "tool-button active" : "tool-button"} onClick={() => selectTool("note")} type="button">
            <StickyNote size={16} />
            Note
          </button>
        </div>
        <div className="tool-actions">
          <button className="icon-button" onClick={undo} disabled={!undoStack.length} title="Undo" type="button">
            <Undo2 size={18} />
          </button>
          <button className="icon-button" onClick={redo} disabled={!redoStack.length} title="Redo" type="button">
            <Redo2 size={18} />
          </button>
          <button className="icon-button danger" onClick={clearShapes} title="Clear" type="button">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="component-toolbar" aria-label="Component types">
        {componentKinds.map(({ kind, label, icon: Icon }) => (
          <button key={kind} className={componentKind === kind ? "component-chip active" : "component-chip"} onClick={() => { setComponentKind(kind); selectTool("component"); }} type="button">
            <Icon size={15} />
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
            placeholder={connectorSource ? `Connecting from ${connectorSource.label ?? "selected component"}` : "Select a component or note"}
            disabled={!selectedShape || selectedShape.type === "arrow"}
          />
        </label>
        <button className="secondary-button" onClick={deleteSelected} disabled={!selectedShape} type="button">
          <Trash2 size={16} />
          Delete
        </button>
      </div>

      <svg
        ref={svgRef}
        className={canvasClass}
        viewBox="0 0 1200 760"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
      >
        <defs>
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#d7dde7" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1200" height="760" fill="url(#grid)" />
        {connectorSource && (
          <circle cx={centerOf(connectorSource).x} cy={centerOf(connectorSource).y} r="9" fill="#0f766e" />
        )}
        {shapes.map((shape) => {
          const selected = shape.id === selectedId;
          if (shape.type === "rect") {
            const label = centerOf(shape);
            return (
              <g key={shape.id}>
                <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#ffffff" stroke={componentColor} strokeWidth={selected ? "5" : "3"} />
                {shape.label && <text x={label.x} y={label.y + 7} textAnchor="middle" fill="#1f2937" fontSize="22" fontWeight="800"><title>{shape.label}</title>{displayLabel(shape.label)}</text>}
              </g>
            );
          }
          if (shape.type === "ellipse") {
            const label = centerOf(shape);
            return (
              <g key={shape.id}>
                <ellipse cx={label.x} cy={label.y} rx={Math.abs(shape.width / 2)} ry={Math.abs(shape.height / 2)} fill="#ffffff" stroke={componentColor} strokeWidth={selected ? "5" : "3"} />
                {shape.label && <text x={label.x} y={label.y + 7} textAnchor="middle" fill="#1f2937" fontSize="22" fontWeight="800"><title>{shape.label}</title>{displayLabel(shape.label)}</text>}
              </g>
            );
          }
          if (shape.type === "note") {
            return (
              <g key={shape.id}>
                <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#fff7d6" stroke={noteColor} strokeWidth={selected ? "5" : "3"} />
                <text x={shape.x + 14} y={shape.y + 32} fill="#1f2937" fontSize="22" fontWeight="700">
                  {shape.label && <title>{shape.label}</title>}
                  {shape.label ? displayLabel(shape.label) : ""}
                </text>
              </g>
            );
          }
          if (shape.type === "arrow") {
            const markerId = `arrowhead-${shape.id}`;
            const endpoints = connectorEndpoints(shape, shapes);
            return (
              <g key={shape.id}>
                <defs>
                  <marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                    <path d="M 0 0 L 8 3 L 0 6 z" fill={connectorColor} />
                  </marker>
                </defs>
                <line x1={endpoints.start.x} y1={endpoints.start.y} x2={endpoints.end.x} y2={endpoints.end.y} stroke={connectorColor} strokeWidth={selected ? "6" : "4"} markerEnd={`url(#${markerId})`} />
              </g>
            );
          }
          return null;
        })}
      </svg>
      {contextMenu && (
        <div className="canvas-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <button onClick={deleteSelected} disabled={selectedId !== contextMenu.shapeId} type="button">
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      )}
    </section>
  );
}
