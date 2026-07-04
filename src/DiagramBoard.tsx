import {
  Box,
  Cpu,
  Database,
  Layers3,
  ListRestart,
  Minus,
  MousePointer2,
  Plus,
  Search,
  Server,
  StickyNote,
  Trash2,
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
  sessionControls?: (actions: {
    canRedo: boolean;
    canUndo: boolean;
    clearCanvas: () => void;
    redo: () => void;
    undo: () => void;
  }) => ReactNode;
}

type ConnectionHandle = { id: string; x: number; y: number };

const componentColor = "#2563eb";
const noteColor = "#d97706";
const connectorColor = componentColor;
const handleColor = "#0f766e";
const shapeLabelSize = 16;
const shapeLabelWeight = 500;
const minZoom = 0.5;
const maxZoom = 2;

const componentKinds: Array<{ kind: PrimitiveKind; label: string; icon: typeof Server }> = [
  { kind: "generic", label: "Component", icon: Box },
  { kind: "user", label: "User", icon: UserRound },
  { kind: "service", label: "Service", icon: Server },
  { kind: "datastore", label: "Datastore", icon: Database },
  { kind: "queue", label: "Queue", icon: Layers3 },
  { kind: "vector-index", label: "Index", icon: Search },
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

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy
  };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function displayLabel(label: string) {
  return label.length > 24 ? `${label.slice(0, 21)}...` : label;
}

function labelBounds(shape: DiagramShape, shapes: DiagramShape[]) {
  if (!shape.label) return null;
  const position = labelPosition(shape, shapes);
  const textWidth = Math.max(36, displayLabel(shape.label).length * shapeLabelSize * 0.58);
  const height = shapeLabelSize + 10;

  if (shape.type === "note") {
    return {
      x: position.x - 6,
      y: position.y - shapeLabelSize - 4,
      width: textWidth + 12,
      height
    };
  }

  if (shape.type === "arrow") {
    return {
      x: position.x - textWidth / 2 - 8,
      y: position.y - height / 2,
      width: textWidth + 16,
      height
    };
  }

  return {
    x: position.x - textWidth / 2 - 8,
    y: position.y - shapeLabelSize - 4,
    width: textWidth + 16,
    height
  };
}

function labelContains(shape: DiagramShape, shapes: DiagramShape[], point: Point) {
  const bounds = labelBounds(shape, shapes);
  if (!bounds) return false;
  return point.x >= bounds.x
    && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y
    && point.y <= bounds.y + bounds.height;
}

function findLabelAt(shapes: DiagramShape[], point: Point) {
  return [...shapes]
    .reverse()
    .find((shape) => labelContains(shape, shapes, point));
}

function defaultSize(kind: PrimitiveKind) {
  if (kind === "user") return { width: 124, height: 90, type: "ellipse" as const };
  if (kind === "human-review") return { width: 150, height: 90, type: "ellipse" as const };
  if (kind === "datastore" || kind === "vector-index") return { width: 106, height: 122, type: "rect" as const };
  if (kind === "queue") return { width: 184, height: 64, type: "rect" as const };
  if (kind === "model") return { width: 176, height: 68, type: "rect" as const };
  return { width: 176, height: 64, type: "rect" as const };
}

function visualShapeBounds(shape: DiagramShape) {
  const bounds = shapeBounds(shape);
  const label = centerOf(shape);

  if (shape.primitive === "datastore" || shape.primitive === "vector-index") {
    const visualWidth = 67;
    const visualHeight = 101;
    const visualX = label.x - visualWidth / 2;
    const visualY = label.y - 56.5;
    return {
      x: visualX,
      y: visualY,
      width: visualWidth,
      height: visualHeight
    };
  }

  if (shape.primitive === "queue") {
    const tubeHeight = Math.max(18, Math.min(34, shape.height - 22));
    const tubeWidth = Math.min(shape.width - 16, 150);
    return {
      x: label.x - tubeWidth / 2,
      y: shape.y + 10,
      width: tubeWidth,
      height: tubeHeight
    };
  }

  if (shape.primitive === "user") {
    return {
      x: label.x - 28,
      y: shape.y + 10,
      width: 56,
      height: 58
    };
  }

  return bounds;
}

function connectionHandles(shape: DiagramShape): ConnectionHandle[] {
  const bounds = visualShapeBounds(shape);
  return [
    { id: "top", x: bounds.x + bounds.width / 2, y: bounds.y },
    { id: "right", x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    { id: "bottom", x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
    { id: "left", x: bounds.x, y: bounds.y + bounds.height / 2 }
  ];
}

function nearestConnectionHandle(shape: DiagramShape, point: Point) {
  return connectionHandles(shape).reduce((nearest, handle) => (
    Math.hypot(point.x - handle.x, point.y - handle.y) < Math.hypot(point.x - nearest.x, point.y - nearest.y)
      ? handle
      : nearest
  ));
}

function connectionHandleById(shape: DiagramShape, handleId: string | undefined) {
  return connectionHandles(shape).find((handle) => handle.id === handleId);
}

function inferConnectionHandles(source: DiagramShape, target: DiagramShape) {
  const sourceHandles = connectionHandles(source);
  const targetHandles = connectionHandles(target);
  let best = { source: sourceHandles[0], target: targetHandles[0], distance: Number.POSITIVE_INFINITY };

  for (const sourceHandle of sourceHandles) {
    for (const targetHandle of targetHandles) {
      const distance = Math.hypot(sourceHandle.x - targetHandle.x, sourceHandle.y - targetHandle.y);
      if (distance < best.distance) best = { source: sourceHandle, target: targetHandle, distance };
    }
  }

  return best;
}

function connectorEndpoints(shape: DiagramShape, shapes: DiagramShape[]) {
  const source = shapes.find((candidate) => candidate.id === shape.sourceId);
  const target = shapes.find((candidate) => candidate.id === shape.targetId);

  if (source && target) {
    const inferred = inferConnectionHandles(source, target);
    const sourceHandle = connectionHandleById(source, shape.sourceHandleId) ?? inferred.source;
    const targetHandle = connectionHandleById(target, shape.targetHandleId) ?? inferred.target;
    return { start: sourceHandle, end: targetHandle };
  }

  return {
    start: { x: shape.x, y: shape.y },
    end: { x: shape.x + shape.width, y: shape.y + shape.height }
  };
}

function refreshConnectedArrow(shape: DiagramShape, shapes: DiagramShape[]) {
  if (shape.type !== "arrow") return shape;
  const source = shapes.find((candidate) => candidate.id === shape.sourceId);
  const target = shapes.find((candidate) => candidate.id === shape.targetId);
  if (!source || !target) return shape;

  const handles = inferConnectionHandles(source, target);
  return {
    ...shape,
    sourceHandleId: handles.source.id,
    targetHandleId: handles.target.id,
    x: handles.source.x,
    y: handles.source.y,
    width: handles.target.x - handles.source.x,
    height: handles.target.y - handles.source.y
  };
}

function refreshArrowsForMovedShape(shapes: DiagramShape[], movedShapeId: string) {
  return shapes.map((shape) => (
    shape.sourceId === movedShapeId || shape.targetId === movedShapeId
      ? refreshConnectedArrow(shape, shapes)
      : shape
  ));
}

function labelPosition(shape: DiagramShape, shapes: DiagramShape[]): Point {
  const label = centerOf(shape);

  if (shape.type === "arrow") {
    const endpoints = connectorEndpoints(shape, shapes);
    return {
      x: (endpoints.start.x + endpoints.end.x) / 2,
      y: (endpoints.start.y + endpoints.end.y) / 2 + 4
    };
  }

  if (shape.primitive === "datastore" || shape.primitive === "vector-index") {
    return { x: label.x, y: label.y - 56.5 + 101 + 18 };
  }

  if (shape.primitive === "queue") {
    const bounds = visualShapeBounds(shape);
    return { x: label.x, y: bounds.y + bounds.height + 18 };
  }

  if (shape.primitive === "model") {
    return { x: label.x, y: label.y + 11 };
  }

  if (shape.primitive === "service") {
    return { x: label.x, y: shape.y + shape.height - 14 };
  }

  if (shape.primitive === "tool") {
    return { x: label.x, y: shape.y + shape.height - 9 };
  }

  if (shape.primitive === "user") {
    return { x: label.x, y: shape.y + shape.height - 8 };
  }

  if (shape.type === "ellipse") {
    return { x: label.x, y: shape.y + shape.height - 15 };
  }

  if (shape.type === "note") {
    return { x: shape.x + 14, y: shape.y + 30 };
  }

  return { x: label.x, y: label.y + 6 };
}

function editorAnchorPosition(shape: DiagramShape, shapes: DiagramShape[]): Point {
  const position = labelPosition(shape, shapes);
  if (shape.type === "arrow") return position;
  return { x: position.x, y: position.y - shapeLabelSize * 0.35 };
}

function findConnectorAt(shapes: DiagramShape[], point: Point) {
  return [...shapes]
    .reverse()
    .find((shape) => {
      if (shape.type !== "arrow") return false;
      const endpoints = connectorEndpoints(shape, shapes);
      return distanceToSegment(point, endpoints.start, endpoints.end) <= 12;
    });
}

export function DiagramBoard({ shapes, setShapes, sessionControls }: DiagramBoardProps) {
  const [tool, setTool] = useState<Tool>("select");
  const [componentKind, setComponentKind] = useState<PrimitiveKind>("service");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [panStart, setPanStart] = useState<{ clientX: number; clientY: number; origin: Point } | null>(null);
  const [connectorDrag, setConnectorDrag] = useState<{ sourceId: string; sourceHandleId: string; start: Point; current: Point } | null>(null);
  const [reattachDrag, setReattachDrag] = useState<{ arrowId: string; endpoint: "source" | "target"; fixed: Point; current: Point } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; point: Point; shapeId?: string } | null>(null);
  const [indexChooser, setIndexChooser] = useState<{ x: number; y: number; shapeId: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [canvasViewBox, setCanvasViewBox] = useState({ width: 1200, height: 760 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
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
  const canvasClass = useMemo(() => (
    [
      "drawing-surface",
      tool === "select" ? "selecting" : "",
      panStart ? "panning" : ""
    ].filter(Boolean).join(" ")
  ), [panStart, tool]);
  const zoomedViewBox = useMemo(() => {
    const width = canvasViewBox.width / zoom;
    const height = canvasViewBox.height / zoom;
    return {
      x: (canvasViewBox.width - width) / 2 + pan.x,
      y: (canvasViewBox.height - height) / 2 + pan.y,
      width,
      height
    };
  }, [canvasViewBox, pan, zoom]);

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

  function toViewportFontSize() {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return shapeLabelSize;
    return Math.max(11, Math.round(shapeLabelSize * Math.abs(matrix.d) * 10) / 10);
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
    if (reattachDrag && !nextShapes.some((shape) => shape.id === reattachDrag.arrowId)) setReattachDrag(null);
    setContextMenu(null);
  }

  function addComponent(point: Point, screenPoint?: Point, kind: PrimitiveKind = componentKind) {
    const size = defaultSize(kind);
    const activeKind = componentKinds.find((component) => component.kind === kind) ?? componentKinds[0];
    const next: DiagramShape = {
      id: crypto.randomUUID(),
      type: size.type,
      primitive: kind,
      x: point.x - size.width / 2,
      y: point.y - size.height / 2,
      width: size.width,
      height: size.height,
      color: componentColor,
      label: activeKind.label,
      indexKind: kind === "vector-index" ? "vector" : undefined
    };
    commitShapes((currentShapes) => [...currentShapes, next]);
    setSelectedId(next.id);
    setTool("select");
    if (kind === "vector-index" && screenPoint) {
      setIndexChooser({ x: screenPoint.x, y: screenPoint.y, shapeId: next.id });
    } else {
      setIndexChooser(null);
    }
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

  function addConnector(sourceId: string, sourceHandleId: string, target: DiagramShape, targetPoint: Point) {
    if (sourceId === target.id) return;
    const source = shapes.find((shape) => shape.id === sourceId);
    if (!source) return;
    const sourceHandle = connectionHandleById(source, sourceHandleId) ?? nearestConnectionHandle(source, centerOf(target));
    const targetHandle = nearestConnectionHandle(target, targetPoint);
    const next: DiagramShape = {
      id: crypto.randomUUID(),
      type: "arrow",
      x: sourceHandle.x,
      y: sourceHandle.y,
      width: targetHandle.x - sourceHandle.x,
      height: targetHandle.y - sourceHandle.y,
      color: connectorColor,
      sourceId: source.id,
      targetId: target.id,
      sourceHandleId: sourceHandle.id,
      targetHandleId: targetHandle.id,
      label: "Connection"
    };
    commitShapes((currentShapes) => [...currentShapes, next]);
    setSelectedId(next.id);
    skipNextEditCommitRef.current = false;
    setEditingId(next.id);
    setEditingLabel("Connection");
    setConnectorDrag(null);
    setTool("select");
  }

  function openEditor(shape: DiagramShape) {
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
    const hit = findShapeAt(shapes, point) ?? findLabelAt(shapes, point);
    const connectorHit = hit ? undefined : findConnectorAt(shapes, point);

    if (tool === "component") {
      event.stopPropagation();
      addComponent(point, { x: event.clientX, y: event.clientY });
      return;
    }

    if (isDoubleClick(hit, point) && hit) {
      event.preventDefault();
      openEditor(hit);
      setDragStart(null);
      return;
    }

    const draggableHit = hit && hit.type !== "arrow";
    setSelectedId(hit?.id ?? connectorHit?.id ?? null);
    setDragStart(draggableHit ? point : null);
    if (draggableHit) {
      dragSnapshotRef.current = shapes;
      didDragRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    } else if (!connectorHit && tool === "select") {
      setPanStart({ clientX: event.clientX, clientY: event.clientY, origin: pan });
      didDragRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (panStart) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = ((event.clientX - panStart.clientX) * zoomedViewBox.width) / rect.width;
      const dy = ((event.clientY - panStart.clientY) * zoomedViewBox.height) / rect.height;
      if (dx !== 0 || dy !== 0) didDragRef.current = true;
      setPan({ x: panStart.origin.x - dx, y: panStart.origin.y - dy });
      return;
    }
    if (reattachDrag) {
      setReattachDrag({ ...reattachDrag, current: toCanvasPoint(event) });
      return;
    }
    if (connectorDrag) {
      setConnectorDrag({ ...connectorDrag, current: toCanvasPoint(event) });
      return;
    }
    if (tool !== "select" || !selectedId || !dragStart) return;
    const point = toCanvasPoint(event);
    const dx = point.x - dragStart.x;
    const dy = point.y - dragStart.y;
    if (dx !== 0 || dy !== 0) didDragRef.current = true;
    setShapes((currentShapes) => {
      const movedShapes = currentShapes.map((shape) => {
        if (shape.id !== selectedId) return shape;
        return { ...shape, x: shape.x + dx, y: shape.y + dy };
      });
      return refreshArrowsForMovedShape(movedShapes, selectedId);
    });
    setDragStart(point);
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (reattachDrag) {
      const point = toCanvasPoint(event);
      const target = findShapeAt(shapes, point);
      if (target) {
        commitShapes((currentShapes) => currentShapes.map((shape) => {
          if (shape.id !== reattachDrag.arrowId || shape.type !== "arrow") return shape;
          if (reattachDrag.endpoint === "source" && target.id === shape.targetId) return shape;
          if (reattachDrag.endpoint === "target" && target.id === shape.sourceId) return shape;
          const targetHandle = nearestConnectionHandle(target, point);
          const nextShape = reattachDrag.endpoint === "source"
            ? { ...shape, sourceId: target.id, sourceHandleId: targetHandle.id }
            : { ...shape, targetId: target.id, targetHandleId: targetHandle.id };
          const endpoints = connectorEndpoints(nextShape, currentShapes);
          return {
            ...nextShape,
            x: endpoints.start.x,
            y: endpoints.start.y,
            width: endpoints.end.x - endpoints.start.x,
            height: endpoints.end.y - endpoints.start.y
          };
        }));
      }
      setReattachDrag(null);
      return;
    }
    if (connectorDrag) {
      const point = toCanvasPoint(event);
      const target = findShapeAt(shapes, point);
      if (target) addConnector(connectorDrag.sourceId, connectorDrag.sourceHandleId, target, point);
      setConnectorDrag(null);
      return;
    }
    if (didDragRef.current && dragSnapshotRef.current) {
      rememberHistory(dragSnapshotRef.current);
    }
    setPanStart(null);
    dragSnapshotRef.current = null;
    didDragRef.current = false;
    setDragStart(null);
  }

  function selectTool(nextTool: Tool) {
    setTool(nextTool);
    setConnectorDrag(null);
    setPanStart(null);
    setContextMenu(null);
  }

  function changeZoom(delta: number) {
    setZoom((current) => Math.min(maxZoom, Math.max(minZoom, Math.round((current + delta) * 10) / 10)));
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
    setReattachDrag(null);
    setContextMenu(null);
    setIndexChooser(null);
    setTool("select");
  }

  function startEditing(event: React.MouseEvent<SVGGElement>, shape: DiagramShape) {
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
    commitShapes((currentShapes) => currentShapes.map((shape) => (
      shape.id === editingId ? { ...shape, label: nextLabel || undefined } : shape
    )));
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
    const hit = findShapeAt(shapes, point) ?? findLabelAt(shapes, point);
    const connectorHit = hit ? undefined : findConnectorAt(shapes, point);
    if (!hit) {
      setSelectedId(connectorHit?.id ?? null);
      setContextMenu({ x: event.clientX, y: event.clientY, point, shapeId: connectorHit?.id });
      return;
    }
    setSelectedId(hit.id);
    setContextMenu({ x: event.clientX, y: event.clientY, point, shapeId: hit.id });
    setIndexChooser(null);
  }

  function onCanvasDoubleClick(event: React.MouseEvent<SVGSVGElement>) {
    const point = toCanvasPoint(event);
    const hit = findShapeAt(shapes, point) ?? findLabelAt(shapes, point);
    const connectorHit = hit ? undefined : findConnectorAt(shapes, point);
    if (hit || connectorHit || tool !== "select") return;
    event.preventDefault();
    addComponent(point, undefined, "generic");
  }

  function startConnectorDrag(event: React.PointerEvent<SVGCircleElement>, sourceId: string, start: ConnectionHandle) {
    event.stopPropagation();
    setSelectedId(sourceId);
    setConnectorDrag({ sourceId, sourceHandleId: start.id, start, current: start });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startReattachDrag(event: React.PointerEvent<SVGCircleElement>, arrow: DiagramShape, endpoint: "source" | "target") {
    event.stopPropagation();
    const endpoints = connectorEndpoints(arrow, shapes);
    setSelectedId(arrow.id);
    setReattachDrag({
      arrowId: arrow.id,
      endpoint,
      fixed: endpoint === "source" ? endpoints.end : endpoints.start,
      current: endpoint === "source" ? endpoints.start : endpoints.end
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function addContextNote() {
    if (!contextMenu) return;
    addNote(contextMenu.point);
    setContextMenu(null);
  }

  function chooseIndexKind(shapeId: string, indexKind: "vector" | "text") {
    commitShapes((currentShapes) => currentShapes.map((shape) => (
      shape.id === shapeId ? { ...shape, indexKind, label: shape.label ?? "Index" } : shape
    )));
    setIndexChooser(null);
  }

  function toggleIndexKind(shapeId: string) {
    commitShapes((currentShapes) => currentShapes.map((shape) => {
      if (shape.id !== shapeId || shape.primitive !== "vector-index") return shape;
      return { ...shape, indexKind: shape.indexKind === "text" ? "vector" : "text" };
    }));
    setContextMenu(null);
  }

  function changeShapePrimitive(shapeId: string, primitive: PrimitiveKind) {
    commitShapes((currentShapes) => {
      const changedShapes = currentShapes.map((shape) => {
        if (shape.id !== shapeId || shape.type === "arrow" || shape.type === "note") return shape;
        const nextSize = defaultSize(primitive);
        const center = centerOf(shape);
        return {
          ...shape,
          type: nextSize.type,
          primitive,
          x: center.x - nextSize.width / 2,
          y: center.y - nextSize.height / 2,
          width: nextSize.width,
          height: nextSize.height,
          indexKind: primitive === "vector-index" ? shape.indexKind ?? "vector" : undefined
        };
      });
      return refreshArrowsForMovedShape(changedShapes, shapeId);
    });
    setSelectedId(shapeId);
    setContextMenu(null);
    setIndexChooser(null);
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
      if (event.key === "Escape") setIndexChooser(null);
      if (event.key === "Escape") cancelEditing();
    }

    function onPointerDown() {
      setContextMenu(null);
      setIndexChooser(null);
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

  useEffect(() => {
    const currentSvg = svgRef.current;
    if (!currentSvg) return;
    const observedSvg = currentSvg;

    function updateViewBox() {
      const rect = observedSvg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nextHeight = Math.round((1200 * rect.height) / rect.width);
      setCanvasViewBox((current) => (
        current.height === nextHeight ? current : { width: 1200, height: nextHeight }
      ));
    }

    updateViewBox();
    const observer = new ResizeObserver(updateViewBox);
    observer.observe(observedSvg);
    window.addEventListener("resize", updateViewBox);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateViewBox);
    };
  }, []);

  const editorPosition = editingShape ? toViewportPoint(editorAnchorPosition(editingShape, shapes)) : null;
  const editorFontSize = editingShape ? toViewportFontSize() : shapeLabelSize;
  const editorWidth = Math.min(280, Math.max(44, editingLabel.length * editorFontSize * 0.62 + 18));
  const contextShape = contextMenu?.shapeId ? shapes.find((shape) => shape.id === contextMenu.shapeId) : null;

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
        {sessionControls && (
          <div className="canvas-session-controls">
            {sessionControls({
              canRedo: redoStack.length > 0,
              canUndo: undoStack.length > 0,
              clearCanvas: clearShapes,
              redo,
              undo
            })}
          </div>
        )}
      </div>

      <div className="canvas-zoom-controls" aria-label="Canvas zoom controls">
        <button className="icon-button" onClick={() => changeZoom(-0.1)} disabled={zoom <= minZoom} title="Zoom out" type="button">
          <Minus size={18} />
        </button>
        <button className="zoom-button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset zoom" type="button">
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-button" onClick={() => changeZoom(0.1)} disabled={zoom >= maxZoom} title="Zoom in" type="button">
          <Plus size={18} />
        </button>
      </div>

      <svg
        ref={svgRef}
        className={canvasClass}
        viewBox={`${zoomedViewBox.x} ${zoomedViewBox.y} ${zoomedViewBox.width} ${zoomedViewBox.height}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onCanvasDoubleClick}
        onContextMenu={onContextMenu}
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#d7dde7" strokeWidth="1" />
          </pattern>
          <marker id="connector-preview-arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
            <path d="M 0 0 L 8 3 L 0 6 z" fill={connectorColor} />
          </marker>
        </defs>
        <rect x={zoomedViewBox.x} y={zoomedViewBox.y} width={zoomedViewBox.width} height={zoomedViewBox.height} fill="url(#grid)" />
        {connectorDrag && (
          <line
            x1={connectorDrag.start.x}
            y1={connectorDrag.start.y}
            x2={connectorDrag.current.x}
            y2={connectorDrag.current.y}
            stroke={connectorColor}
            strokeLinecap="round"
            strokeWidth="2"
            markerEnd="url(#connector-preview-arrowhead)"
          />
        )}
        {reattachDrag && (
          <line
            x1={reattachDrag.endpoint === "source" ? reattachDrag.current.x : reattachDrag.fixed.x}
            y1={reattachDrag.endpoint === "source" ? reattachDrag.current.y : reattachDrag.fixed.y}
            x2={reattachDrag.endpoint === "source" ? reattachDrag.fixed.x : reattachDrag.current.x}
            y2={reattachDrag.endpoint === "source" ? reattachDrag.fixed.y : reattachDrag.current.y}
            stroke={connectorColor}
            strokeLinecap="round"
            strokeWidth="2"
            markerEnd="url(#connector-preview-arrowhead)"
          />
        )}
        {shapes.map((shape) => {
          const selected = shape.id === selectedId;
          const showLabel = shape.id !== editingId;
          const label = centerOf(shape);
          const strokeWidth = selected ? "3" : "2";
          if (shape.type === "rect") {
            const labelText = shape.label ? displayLabel(shape.label) : "";
            if (shape.primitive === "datastore") {
              const visualWidth = 67;
              const visualHeight = 101;
              const visualX = label.x - visualWidth / 2;
              const visualY = label.y - 56.5;
              const topY = visualY + 12;
              const bottomY = visualY + visualHeight - 12;
              const ellipseRy = 10;
              const ellipseRx = visualWidth / 2;
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <path
                    d={`M ${visualX} ${topY} L ${visualX} ${bottomY} M ${visualX + visualWidth} ${topY} L ${visualX + visualWidth} ${bottomY}`}
                    fill="#ffffff"
                    stroke={componentColor}
                    strokeWidth={strokeWidth}
                  />
                  <ellipse cx={label.x} cy={topY} rx={ellipseRx} ry={ellipseRy} fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                  <path d={`M ${visualX} ${bottomY} A ${ellipseRx} ${ellipseRy} 0 0 0 ${visualX + visualWidth} ${bottomY}`} fill="none" stroke={componentColor} strokeWidth={strokeWidth} />
                  {showLabel && shape.label && <text x={label.x} y={visualY + visualHeight + 18} textAnchor="middle" fill="#1f2937" fontSize={shapeLabelSize} fontWeight={shapeLabelWeight}><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }

            if (shape.primitive === "queue") {
              const tubeHeight = Math.min(34, shape.height - 22);
              const tubeWidth = Math.min(shape.width - 16, 150);
              const tubeX = label.x - tubeWidth / 2;
              const tubeY = shape.y + 10;
              const endWidth = tubeHeight * 0.72;
              const leftCx = tubeX + endWidth / 2;
              const rightStart = tubeX + tubeWidth - endWidth / 2;
              const cy = tubeY + tubeHeight / 2;
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <path
                    d={`M ${leftCx} ${tubeY} H ${rightStart} C ${tubeX + tubeWidth + endWidth / 4} ${tubeY}, ${tubeX + tubeWidth + endWidth / 4} ${tubeY + tubeHeight}, ${rightStart} ${tubeY + tubeHeight} H ${leftCx} C ${tubeX} ${tubeY + tubeHeight}, ${tubeX} ${tubeY}, ${leftCx} ${tubeY} Z`}
                    fill="#ffffff"
                    stroke={componentColor}
                    strokeWidth={strokeWidth}
                  />
                  <ellipse cx={leftCx} cy={cy} rx={endWidth / 2} ry={tubeHeight / 2} fill="#eef4ff" stroke={componentColor} strokeWidth={strokeWidth} />
                  {showLabel && shape.label && <text x={label.x} y={tubeY + tubeHeight + 18} textAnchor="middle" fill="#1f2937" fontSize={shapeLabelSize} fontWeight={shapeLabelWeight}><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }

            if (shape.primitive === "vector-index") {
              const visualWidth = 67;
              const visualHeight = 101;
              const visualX = label.x - visualWidth / 2;
              const visualY = label.y - 56.5;
              const topY = visualY + 12;
              const bottomY = visualY + visualHeight - 12;
              const ellipseRy = 10;
              const ellipseRx = visualWidth / 2;
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <path
                    d={`M ${visualX} ${topY} L ${visualX} ${bottomY} M ${visualX + visualWidth} ${topY} L ${visualX + visualWidth} ${bottomY}`}
                    fill="#ffffff"
                    stroke={componentColor}
                    strokeWidth={strokeWidth}
                  />
                  <ellipse cx={label.x} cy={topY} rx={ellipseRx} ry={ellipseRy} fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                  <path d={`M ${visualX} ${bottomY} A ${ellipseRx} ${ellipseRy} 0 0 0 ${visualX + visualWidth} ${bottomY}`} fill="none" stroke={componentColor} strokeWidth={strokeWidth} />
                  {shape.indexKind === "text" ? (
                    <>
                      <circle cx={visualX + visualWidth - 7} cy={topY - 12} r="7" fill="#eef4ff" stroke={componentColor} strokeWidth="1.5" />
                      <line x1={visualX + visualWidth - 2} y1={topY - 7} x2={visualX + visualWidth + 5} y2={topY} stroke={componentColor} strokeLinecap="round" strokeWidth="2" />
                    </>
                  ) : (
                    <>
                      <circle cx={visualX + visualWidth - 18} cy={topY - 15} r="3.2" fill={componentColor} />
                      <circle cx={visualX + visualWidth - 5} cy={topY - 11} r="3.2" fill={componentColor} />
                      <circle cx={visualX + visualWidth - 13} cy={topY + 1} r="3.2" fill={componentColor} />
                      <path d={`M ${visualX + visualWidth - 15} ${topY - 14} L ${visualX + visualWidth - 8} ${topY - 12} L ${visualX + visualWidth - 12} ${topY - 2}`} fill="none" stroke={componentColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                    </>
                  )}
                  {showLabel && shape.label && <text x={label.x} y={visualY + visualHeight + 18} textAnchor="middle" fill="#1f2937" fontSize={shapeLabelSize} fontWeight={shapeLabelWeight}><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }

            if (shape.primitive === "model") {
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                  <rect x={shape.x + 14} y={shape.y + 12} width="64" height="24" rx="4" fill="#eef4ff" stroke={componentColor} strokeWidth="1.5" />
                  <text x={shape.x + 46} y={shape.y + 29} textAnchor="middle" fill="#1d4ed8" fontSize="10" fontWeight="600">MODEL</text>
                  <path d={`M ${shape.x + shape.width - 48} ${shape.y + 20} h 24 m -12 -12 v 24`} stroke={componentColor} strokeLinecap="round" strokeWidth="2" />
                  {showLabel && shape.label && <text x={label.x} y={label.y + 11} textAnchor="middle" fill="#1f2937" fontSize={shapeLabelSize} fontWeight={shapeLabelWeight}><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }

            if (shape.primitive === "service") {
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                  <rect x={shape.x + 16} y={shape.y + 17} width="36" height="30" rx="4" fill="#eef4ff" stroke={componentColor} strokeWidth="1.5" />
                  <line x1={shape.x + 62} y1={shape.y + 25} x2={shape.x + shape.width - 22} y2={shape.y + 25} stroke={componentColor} strokeLinecap="round" strokeWidth="2.5" />
                  <line x1={shape.x + 62} y1={shape.y + 41} x2={shape.x + shape.width - 54} y2={shape.y + 41} stroke={componentColor} strokeLinecap="round" strokeWidth="2.5" />
                  {showLabel && shape.label && <text x={label.x} y={shape.y + shape.height - 14} textAnchor="middle" fill="#1f2937" fontSize={shapeLabelSize} fontWeight={shapeLabelWeight}><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }

            if (shape.primitive === "tool") {
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                  <rect x={shape.x + 18} y={shape.y + 12} width="38" height="28" rx="5" fill="#eef4ff" stroke={componentColor} strokeWidth="1.5" />
                  <path d={`M ${shape.x + 66} ${shape.y + 16} H ${shape.x + 84} M ${shape.x + 66} ${shape.y + 26} H ${shape.x + 92} M ${shape.x + 66} ${shape.y + 36} H ${shape.x + 80}`} stroke={componentColor} strokeLinecap="round" strokeWidth="2" />
                  <path d={`M ${shape.x + 30} ${shape.y + 22} L ${shape.x + 25} ${shape.y + 26} L ${shape.x + 30} ${shape.y + 30} M ${shape.x + 44} ${shape.y + 22} L ${shape.x + 49} ${shape.y + 26} L ${shape.x + 44} ${shape.y + 30}`} fill="none" stroke={componentColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  {showLabel && shape.label && <text x={label.x} y={shape.y + shape.height - 9} textAnchor="middle" fill="#1f2937" fontSize={shapeLabelSize} fontWeight={shapeLabelWeight}><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }

            return (
              <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                {showLabel && shape.label && <text x={label.x} y={label.y + 6} textAnchor="middle" fill="#1f2937" fontSize={shapeLabelSize} fontWeight={shapeLabelWeight}><title>{shape.label}</title>{labelText}</text>}
              </g>
            );
          }
          if (shape.type === "ellipse") {
            const labelText = shape.label ? displayLabel(shape.label) : "";
            if (shape.primitive === "user") {
              return (
                <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                  <circle cx={label.x} cy={shape.y + 24} r="12" fill="#eef4ff" stroke={componentColor} strokeWidth="2" />
                  <path d={`M ${label.x - 24} ${shape.y + 59} C ${label.x - 16} ${shape.y + 42}, ${label.x + 16} ${shape.y + 42}, ${label.x + 24} ${shape.y + 59}`} fill="none" stroke={componentColor} strokeLinecap="round" strokeWidth="2.5" />
                  {showLabel && shape.label && <text x={label.x} y={shape.y + shape.height - 8} textAnchor="middle" fill="#1f2937" fontSize={shapeLabelSize} fontWeight={shapeLabelWeight}><title>{shape.label}</title>{labelText}</text>}
                </g>
              );
            }
            return (
              <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                <ellipse cx={label.x} cy={label.y} rx={Math.abs(shape.width / 2)} ry={Math.abs(shape.height / 2)} fill="#ffffff" stroke={componentColor} strokeWidth={strokeWidth} />
                {shape.primitive === "human-review" && (
                  <>
                    <circle cx={label.x} cy={shape.y + 31} r="12" fill="#eef4ff" stroke={componentColor} strokeWidth="2" />
                    <path d={`M ${label.x - 25} ${shape.y + 66} C ${label.x - 16} ${shape.y + 48}, ${label.x + 16} ${shape.y + 48}, ${label.x + 25} ${shape.y + 66}`} fill="none" stroke={componentColor} strokeLinecap="round" strokeWidth="2.5" />
                    <path d={`M ${shape.x + shape.width - 47} ${shape.y + 32} L ${shape.x + shape.width - 38} ${shape.y + 41} L ${shape.x + shape.width - 22} ${shape.y + 23}`} fill="none" stroke={componentColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                  </>
                )}
                {showLabel && shape.label && <text x={label.x} y={shape.y + shape.height - 15} textAnchor="middle" fill="#1f2937" fontSize={shapeLabelSize} fontWeight={shapeLabelWeight}><title>{shape.label}</title>{labelText}</text>}
              </g>
            );
          }
          if (shape.type === "note") {
            return (
              <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" fill="#fff7d6" stroke={noteColor} strokeWidth={strokeWidth} />
                <text x={shape.x + 14} y={shape.y + 30} fill="#1f2937" fontSize={shapeLabelSize} fontWeight={shapeLabelWeight}>
                  {showLabel && shape.label && <title>{shape.label}</title>}
                  {showLabel && shape.label ? displayLabel(shape.label) : ""}
                </text>
              </g>
            );
          }
          if (shape.type === "arrow") {
            const markerId = `arrowhead-${shape.id}`;
            const endpoints = connectorEndpoints(shape, shapes);
            const midpoint = {
              x: (endpoints.start.x + endpoints.end.x) / 2,
              y: (endpoints.start.y + endpoints.end.y) / 2
            };
            const labelText = shape.label ? displayLabel(shape.label) : "";
            return (
              <g key={shape.id} onDoubleClick={(event) => startEditing(event, shape)}>
                <defs>
                  <marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                    <path d="M 0 0 L 8 3 L 0 6 z" fill={connectorColor} />
                  </marker>
                </defs>
                <line className="connector-hitline" x1={endpoints.start.x} y1={endpoints.start.y} x2={endpoints.end.x} y2={endpoints.end.y} stroke="transparent" strokeWidth="18" />
                <line x1={endpoints.start.x} y1={endpoints.start.y} x2={endpoints.end.x} y2={endpoints.end.y} stroke={connectorColor} strokeWidth="2" markerEnd={`url(#${markerId})`} />
                {showLabel && shape.label && (
                  <text x={midpoint.x} y={midpoint.y + 4} textAnchor="middle" dominantBaseline="middle" fill="#1f2937" fontSize={shapeLabelSize} fontWeight={shapeLabelWeight} paintOrder="stroke" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="7">
                    <title>{shape.label}</title>
                    {labelText}
                  </text>
                )}
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
        {selectedShape && selectedShape.type === "arrow" && (() => {
          const endpoints = connectorEndpoints(selectedShape, shapes);
          return (
            <>
              <circle
                className="connection-handle"
                cx={endpoints.start.x}
                cy={endpoints.start.y}
                r="8"
                fill={handleColor}
                stroke="#ffffff"
                strokeWidth="3"
                onPointerDown={(event) => startReattachDrag(event, selectedShape, "source")}
              />
              <circle
                className="connection-handle"
                cx={endpoints.end.x}
                cy={endpoints.end.y}
                r="8"
                fill={handleColor}
                stroke="#ffffff"
                strokeWidth="3"
                onPointerDown={(event) => startReattachDrag(event, selectedShape, "target")}
              />
            </>
          );
        })()}
      </svg>
      {editingShape && editorPosition && (
        <input
          ref={editorRef}
          className={[
            "label-editor",
            editingShape.type === "arrow" ? "connector-label-editor" : "",
            editingShape.type === "note" ? "note-label-editor" : ""
          ].filter(Boolean).join(" ")}
          value={editingLabel}
          onChange={(event) => setEditingLabel(event.target.value)}
          onBlur={commitEditing}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitEditing();
            if (event.key === "Escape") cancelEditing();
          }}
          style={{ fontSize: editorFontSize, left: editorPosition.x, top: editorPosition.y, width: editorWidth }}
          aria-label="Edit component title"
        />
      )}
      {indexChooser && (
        <div className="canvas-context-menu index-kind-menu" style={{ left: indexChooser.x, top: indexChooser.y }} onPointerDown={(event) => event.stopPropagation()}>
          <button onClick={() => chooseIndexKind(indexChooser.shapeId, "vector")} type="button">
            Vector
          </button>
          <button onClick={() => chooseIndexKind(indexChooser.shapeId, "text")} type="button">
            Text
          </button>
        </div>
      )}
      {contextMenu && (
        <div className="canvas-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <button onClick={addContextNote} type="button">
            <StickyNote size={16} />
            Add note
          </button>
          {contextMenu.shapeId && (
            <>
              {contextShape && contextShape.type !== "arrow" && contextShape.type !== "note" && (
                <div className="context-menu-group">
                  <div className="context-menu-label">
                    <ListRestart size={14} />
                    Change type
                  </div>
                  {componentKinds.map(({ kind, label, icon: Icon }) => (
                    <button
                      key={kind}
                      className={contextShape.primitive === kind ? "active" : ""}
                      onClick={() => changeShapePrimitive(contextMenu.shapeId!, kind)}
                      type="button"
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {contextShape?.primitive === "vector-index" && (
                <button onClick={() => toggleIndexKind(contextMenu.shapeId!)} type="button">
                  {contextShape.indexKind === "text" ? "Switch to Vector" : "Switch to Text"}
                </button>
              )}
            </>
          )}
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
