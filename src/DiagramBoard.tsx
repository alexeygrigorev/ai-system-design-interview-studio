import {
  Box,
  Cpu,
  Database,
  Layers3,
  MousePointer2,
  Redo2,
  Search,
  Server,
  StickyNote,
  Trash2,
  Undo2,
  UserCheck,
  UserRound,
  Wrench
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { DiagramShape, Point, PrimitiveKind, Tool } from "./types";

interface DiagramBoardProps {
  shapes: DiagramShape[];
  setShapes: Dispatch<SetStateAction<DiagramShape[]>>;
  sessionControls?: ReactNode;
}

const componentColor = "#2563eb";
const noteColor = "#d97706";
const connectorColor = "#4b5563";
const handleColor = "#0f766e";

const componentKinds: Array<{ kind: PrimitiveKind; label: string; icon: typeof Server }> = [
  { kind: "generic", label: "Component", icon: Box },
  { kind: "user", label: "User", icon: UserRound },
  { kind: "service", label: "Service", icon: Server },
  { kind: "datastore", label: "Datastore", icon: Database },
  { kind: "queue", label: "Queue", icon: Layers3 },
  { kind: "vector-index", label: "Vector index", icon: Search },
  { kind: "model", label: "Model", icon: Cpu },
  { kind: "tool", label: "Tool", icon: Wrench },
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
  if (kind === "user" || kind === "human-review") return { width: 170, height: 104, type: "ellipse" as const };
  if (kind === "datastore") return { width: 178, height: 112, type: "rect" as const };
  if (kind === "queue") return { width: 190, height: 104, type: "rect" as const };
  if (kind === "model") return { width: 184, height: 96, type: "rect" as const };
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

function connectionHandles(shape: DiagramShape) {
  const bounds = shapeBounds(shape);
  return [
    { id: "top", x: bounds.x + bounds.width / 2, y: bounds.y },
    { id: "right", x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    { id: "bottom", x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
    { id: "left", x: bounds.x, y: bounds.y + bounds.height / 2 }
  ];
}

export function DiagramBoard({ shapes, setShapes, sessionControls }: DiagramBoardProps) {
  const [tool, setTool] = useState<Tool>("select");
  const [componentKind, setComponentKind] = useState<PrimitiveKind>("service");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [connectorDrag, setConnectorDrag] = useState<{ sourceId: string; start: Point; current: Point } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; point: Point; shapeId?: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [undoStack, setUndoStack] = useState<DiagramShape[][]>([]);
  const [redoStack, setRedoStack] = useState<DiagramShape[][]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const editorRef = useRef<HTMLInputElement | null>(null);
  const dragSnapshotRef = useRef<DiagramShape[] | null>(null);
  const didDragRef = useRef(false);
  const skipNextEditCommitRef = useRef(false);
  const lastClickRef = useRef<{ shapeId: string; point: Point; time: number } | null>(null);

  const selectedShape = shapes.find((shape) => shape.id === selectedId) ?? null;
  const editingShape = shapes.find((shape) => shape.id === editingId) ?? null;
  const activeKind = componentKinds.find((kind) => kind.kind === componentKind) ?? componentKinds[0];

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

  function toViewportPoint(point: Point) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = point.x;
    svgPoint.y = point.y;
    const transformed = svgPoint.matrixTransform(matrix);
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
    if (connectorDrag && !nextShapes.some((shape) => shape.id === connectorDrag.sourceId)) setConnectorDrag(null);
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

  function addConnector(sourceId: string, target: DiagramShape) {
    if (sourceId === target.id) return;
    const source = shapes.find((shape) => shape.id === sourceId);
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
    setConnectorDrag(null);
    setTool("select");
  }

  function openEditor(shape: DiagramShape) {
    if (shape.type === "arrow") return;
    setSelectedId(shape.id);
    setContextMenu(null);
    skipNextEditCommitRef.current = false;
    setEditingId(shape.id);
    setEditingLabel(shape.label ?? "");
  }

  function isDoubleClick(hit: DiagramShape | undefined, point: Point) {
    if (!hit) {
      lastClickRef.current = null;
      return false;
    }

    const now = window.performance.now();
    const previous = lastClickRef.current;
    lastClickRef.current = { shapeId: hit.id, point, time: now };
    if (!previous || previous.shapeId !== hit.id || now - previous.time > 450) return false;

    const dx = point.x - previous.point.x;
    const dy = point.y - previous.point.y;
    return Math.hypot(dx, dy) <= 12;
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const point = toCanvasPoint(event);
    const hit = findShapeAt(shapes, point);

    if (tool === "component") {
      addComponent(point);
      return;
    }

    if (isDoubleClick(hit, point) && hit) {
      event.preventDefault();
      openEditor(hit);
      setDragStart(null);
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
    if (connectorDrag) {
      setConnectorDrag({ ...connectorDrag, current: toCanvasPoint(event) });
      return;
    }
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

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (connectorDrag) {
      const point = toCanvasPoint(event);
      const target = findShapeAt(shapes, point);
      if (target) addConnector(connectorDrag.sourceId, target);
      setConnectorDrag(null);
      return;
    }
    if (didDragRef.current && dragSnapshotRef.current) {
      rememberHistory(dragSnapshotRef.current);
    }
    dragSnapshotRef.current = null;
    didDragRef.current = false;
    setDragStart(null);
  }

  function selectTool(nextTool: Tool) {
    setTool(nextTool);
    setConnectorDrag(null);
    setContextMenu(null);
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
    setConnectorDrag(null);
    setContextMenu(null);
    setTool("select");
  }

  function startEditing(event: React.MouseEvent<SVGGElement>, shape: DiagramShape) {
    if (shape.type === "arrow") return;
    event.stopPropagation();
    openEditor(shape);
  }

  function commitEditing() {
    if (skipNextEditCommitRef.current) {
      skipNextEditCommitRef.current = false;
      return;
    }
    if (!editingId) return;
    const nextLabel = editingLabel.trim();
    if (nextLabel) {
      commitShapes((currentShapes) => currentShapes.map((shape) => (
        shape.id === editingId ? { ...shape, label: nextLabel } : shape
      )));
    }
    skipNextEditCommitRef.current = true;
    setEditingId(null);
    setEditingLabel("");
  }

  function cancelEditing() {
    skipNextEditCommitRef.current = true;
    setEditingId(null);
    setEditingLabel("");
  }

  function onContextMenu(event: React.MouseEvent<SVGSVGElement>) {
    event.preventDefault();
    const point = toCanvasPoint(event);
    const hit = findShapeAt(shapes, point);
    if (!hit) {
      setSelectedId(null);
      setContextMenu({ x: event.clientX, y: event.clientY, point });
      return;
    }
    setSelectedId(hit.id);
    setContextMenu({ x: event.clientX, y: event.clientY, point, shapeId: hit.id });
  }

  function startConnectorDrag(event: React.PointerEvent<SVGCircleElement>, sourceId: string, start: Point) {
    event.stopPropagation();
    setSelectedId(sourceId);
    setConnectorDrag({ sourceId, start, current: start });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function addContextNote() {
    if (!contextMenu) return;
    addNote(contextMenu.point);
    setContextMenu(null);
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
      if (event.key === "Escape") cancelEditing();
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

  useEffect(() => {
    if (!editingId) return;
    editorRef.current?.focus();
    editorRef.current?.select();
  }, [editingId]);

  const editorPosition = editingShape ? toViewportPoint(centerOf(editingShape)) : null;

  return (
    <section className="board-panel simple-board" aria-label="Architecture diagram board">
      <div className="board-toolbar simple-toolbar">
        <div className="tool-strip" aria-label="Diagram actions">
          <button className={tool === "select" ? "icon-button active" : "icon-button"} onClick={() => selectTool("select")} title="Pointer" type="button">
            <MousePointer2 size={18} />
          </button>
        </div>
        <div className="component-toolbar" aria-label="Component types">
          {componentKinds.map(({ kind, label, icon: Icon }) => (
            <button key={kind} className={tool === "component" && componentKind === kind ? "component-chip active" : "component-chip"} onClick={() => { setComponentKind(kind); selectTool("component"); }} title={label} type="button">
              <Icon size={15} />
            </button>
          ))}
        </div>
        {sessionControls && <div className="canvas-session-controls">{sessionControls}</div>}
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

      <svg
        ref={svgRef}
        className={canvasClass}
        viewBox="0 0 1200 760"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#d7dde7" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1200" height="760" fill="url(#grid)" />
        {connectorDrag && (
          <line
            x1={connectorDrag.start.x}
            y1={connectorDrag.start.y}
            x2={connectorDrag.current.x}
            y2={connectorDrag.current.y}
            stroke={handleColor}
            strokeDasharray="10 8"
            strokeWidth="5"
          />
        )}
        {shapes.map((shape) => {
          const selected = shape.id === selectedId;
          const label = centerOf(shape);
          const strokeWidth = selected ? "5" : "3";
          if (shape.type === "rect") {
            const labelText = shape.label ? displayLabel(shape.label) : "";
            if (shape.primitive === "datastore") {
              const topY = shape.y + 22;
              const bottomY = shape.y + shape.height - 20;
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <path
                    d={`M ${shape.x} ${topY} C ${shape.x} ${shape.y + 6}, ${shape.x + shape.width} ${shape.y + 6}, ${shape.x + shape.width} ${topY} L ${shape.x + shape.width} ${bottomY} C ${shape.x + shape.width} ${shape.y + shape.height - 6}, ${shape.x} ${shape.y + shape.height - 6}, ${shape.x} ${bottomY} Z`}
                    fill="#ffffff"
                    stroke={componentColor}
                    strokeWidth={strokeWidth}
                  />
                  <ellipse cx={label.x} cy={topY} rx={shape.width / 2} ry="18" fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                  <path d={`M ${shape.x} ${bottomY} C ${shape.x} ${shape.y + shape.height - 6}, ${shape.x + shape.width} ${shape.y + shape.height - 6}, ${shape.x + shape.width} ${bottomY}`} fill="none" stroke={componentColor} strokeWidth="2" />
                  {shape.label && <text x={label.x} y={label.y + 14} textAnchor="middle" fill="#1f2937" fontSize="21" fontWeight="650"><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }

            if (shape.primitive === "queue") {
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                  {[0, 1, 2].map((index) => (
                    <rect key={index} x={shape.x + 22 + index * 48} y={shape.y + 18} width="38" height="30" rx="5" fill="#eef4ff" stroke={componentColor} strokeWidth="2" />
                  ))}
                  <path d={`M ${shape.x + 156} ${shape.y + 33} L ${shape.x + 170} ${shape.y + 33}`} stroke={componentColor} strokeLinecap="round" strokeWidth="4" />
                  <path d={`M ${shape.x + 164} ${shape.y + 25} L ${shape.x + 172} ${shape.y + 33} L ${shape.x + 164} ${shape.y + 41}`} fill="none" stroke={componentColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
                  {shape.label && <text x={label.x} y={shape.y + shape.height - 22} textAnchor="middle" fill="#1f2937" fontSize="21" fontWeight="650"><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }

            if (shape.primitive === "vector-index") {
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                  <circle cx={shape.x + 42} cy={shape.y + 30} r="13" fill="#eef4ff" stroke={componentColor} strokeWidth="3" />
                  <path d={`M ${shape.x + 52} ${shape.y + 40} L ${shape.x + 66} ${shape.y + 54}`} stroke={componentColor} strokeLinecap="round" strokeWidth="4" />
                  {[0, 1, 2].map((index) => (
                    <line key={index} x1={shape.x + 86} y1={shape.y + 23 + index * 14} x2={shape.x + 158} y2={shape.y + 23 + index * 14} stroke={componentColor} strokeLinecap="round" strokeWidth="4" />
                  ))}
                  {shape.label && <text x={label.x} y={shape.y + shape.height - 18} textAnchor="middle" fill="#1f2937" fontSize="21" fontWeight="650"><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }

            if (shape.primitive === "model") {
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                  <rect x={shape.x + 14} y={shape.y + 12} width="64" height="24" rx="4" fill="#eef4ff" stroke={componentColor} strokeWidth="2" />
                  <text x={shape.x + 46} y={shape.y + 30} textAnchor="middle" fill="#1d4ed8" fontSize="12" fontWeight="700">MODEL</text>
                  <path d={`M ${shape.x + shape.width - 48} ${shape.y + 20} h 24 m -12 -12 v 24`} stroke={componentColor} strokeLinecap="round" strokeWidth="3" />
                  {shape.label && <text x={label.x} y={label.y + 16} textAnchor="middle" fill="#1f2937" fontSize="22" fontWeight="650"><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }

            if (shape.primitive === "service") {
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                  <rect x={shape.x + 16} y={shape.y + 17} width="36" height="30" rx="4" fill="#eef4ff" stroke={componentColor} strokeWidth="2" />
                  <line x1={shape.x + 62} y1={shape.y + 25} x2={shape.x + shape.width - 22} y2={shape.y + 25} stroke={componentColor} strokeLinecap="round" strokeWidth="4" />
                  <line x1={shape.x + 62} y1={shape.y + 41} x2={shape.x + shape.width - 54} y2={shape.y + 41} stroke={componentColor} strokeLinecap="round" strokeWidth="4" />
                  {shape.label && <text x={label.x} y={shape.y + shape.height - 16} textAnchor="middle" fill="#1f2937" fontSize="21" fontWeight="650"><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }

            return (
              <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                {shape.primitive === "tool" && (
                  <path d={`M ${shape.x + 24} ${shape.y + 26} L ${shape.x + 44} ${shape.y + 46} M ${shape.x + 42} ${shape.y + 22} L ${shape.x + 50} ${shape.y + 30} L ${shape.x + 34} ${shape.y + 46}`} fill="none" stroke={componentColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
                )}
                {shape.label && <text x={label.x} y={label.y + 7} textAnchor="middle" fill="#1f2937" fontSize="22" fontWeight="650"><title>{shape.label}</title>{labelText}</text>}
              </g>
            );
          }
          if (shape.type === "ellipse") {
            const labelText = shape.label ? displayLabel(shape.label) : "";
            return (
              <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                <ellipse cx={label.x} cy={label.y} rx={Math.abs(shape.width / 2)} ry={Math.abs(shape.height / 2)} fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                {(shape.primitive === "user" || shape.primitive === "human-review") && (
                  <>
                    <circle cx={label.x} cy={shape.y + 31} r="12" fill="#eef4ff" stroke={componentColor} strokeWidth="3" />
                    <path d={`M ${label.x - 25} ${shape.y + 66} C ${label.x - 16} ${shape.y + 48}, ${label.x + 16} ${shape.y + 48}, ${label.x + 25} ${shape.y + 66}`} fill="none" stroke={componentColor} strokeLinecap="round" strokeWidth="4" />
                    {shape.primitive === "human-review" && <path d={`M ${shape.x + shape.width - 47} ${shape.y + 32} L ${shape.x + shape.width - 38} ${shape.y + 41} L ${shape.x + shape.width - 22} ${shape.y + 23}`} fill="none" stroke={componentColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />}
                  </>
                )}
                {shape.label && <text x={label.x} y={shape.y + shape.height - 18} textAnchor="middle" fill="#1f2937" fontSize="21" fontWeight="650"><title>{shape.label}</title>{labelText}</text>}
              </g>
            );
          }
          if (shape.type === "note") {
            return (
              <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#fff7d6" stroke={noteColor} strokeWidth={strokeWidth} />
                <text x={shape.x + 14} y={shape.y + 32} fill="#1f2937" fontSize="22" fontWeight="600">
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
        {selectedShape && selectedShape.type !== "arrow" && connectionHandles(selectedShape).map((handle) => (
          <circle
            key={`${selectedShape.id}-${handle.id}`}
            className="connection-handle"
            cx={handle.x}
            cy={handle.y}
            r="8"
            fill={handleColor}
            stroke="#ffffff"
            strokeWidth="3"
            onPointerDown={(event) => startConnectorDrag(event, selectedShape.id, handle)}
          />
        ))}
      </svg>
      {editingShape && editorPosition && (
        <input
          ref={editorRef}
          className="label-editor"
          value={editingLabel}
          onChange={(event) => setEditingLabel(event.target.value)}
          onBlur={commitEditing}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitEditing();
            if (event.key === "Escape") cancelEditing();
          }}
          style={{ left: editorPosition.x, top: editorPosition.y }}
          aria-label="Edit component title"
        />
      )}
      {contextMenu && (
        <div className="canvas-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <button onClick={addContextNote} type="button">
            <StickyNote size={16} />
            Add note
          </button>
          {contextMenu.shapeId && (
            <button className="danger" onClick={deleteSelected} disabled={selectedId !== contextMenu.shapeId} type="button">
              <Trash2 size={16} />
              Delete
            </button>
          )}
        </div>
      )}
    </section>
  );
}
