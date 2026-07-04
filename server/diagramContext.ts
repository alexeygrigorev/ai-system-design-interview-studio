type DiagramArtifactKind = "component" | "note" | "arrow" | "other";

interface Point {
  x: number;
  y: number;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DiagramArtifact {
  index: number;
  id: string;
  type: string;
  kind: DiagramArtifactKind;
  primitive?: string;
  label?: string;
  color?: string;
  bounds?: Bounds;
  start?: Point;
  end?: Point;
  warnings: string[];
}

interface EndpointResolution {
  artifact: DiagramArtifact;
  method: "inside bounds" | "nearest within 48 units";
  distance: number;
}

export interface DiagramPromptContext {
  textContext: string;
  rawJson: string;
}

const CONNECT_DISTANCE_LIMIT = 48;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function quoteText(value: string) {
  return JSON.stringify(normalizeText(value));
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function normalizeBounds(x: number, y: number, width: number, height: number): Bounds {
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height)
  };
}

function boundsArea(bounds: Bounds) {
  return bounds.width * bounds.height;
}

function center(bounds: Bounds): Point {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}

function distanceBetween(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function containsPoint(bounds: Bounds, point: Point) {
  return point.x >= bounds.x
    && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y
    && point.y <= bounds.y + bounds.height;
}

function distanceToBounds(bounds: Bounds, point: Point) {
  const dx = point.x < bounds.x
    ? bounds.x - point.x
    : Math.max(0, point.x - (bounds.x + bounds.width));
  const dy = point.y < bounds.y
    ? bounds.y - point.y
    : Math.max(0, point.y - (bounds.y + bounds.height));
  return Math.hypot(dx, dy);
}

function compareText(a: string, b: string) {
  const primary = a.localeCompare(b, "en", { sensitivity: "base" });
  if (primary !== 0) return primary;
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortValue(value: string | number | undefined) {
  return value === undefined ? "" : String(value);
}

function boundsSortLabel(bounds: Bounds | undefined) {
  if (!bounds) return "";
  return [
    formatNumber(bounds.x),
    formatNumber(bounds.y),
    formatNumber(bounds.width),
    formatNumber(bounds.height)
  ].join(",");
}

function pointSortLabel(point: Point | undefined) {
  if (!point) return "";
  return `${formatNumber(point.x)},${formatNumber(point.y)}`;
}

function artifactSortLabel(artifact: DiagramArtifact) {
  return [
    artifact.kind,
    sortValue(artifact.label),
    sortValue(artifact.id),
    sortValue(artifact.primitive),
    artifact.type,
    sortValue(artifact.color),
    boundsSortLabel(artifact.bounds),
    pointSortLabel(artifact.start),
    pointSortLabel(artifact.end),
    artifact.warnings.join("|")
  ].join(":");
}

function compareArtifacts(a: DiagramArtifact, b: DiagramArtifact) {
  return compareText(artifactSortLabel(a), artifactSortLabel(b));
}

function connectionLabel(artifact: DiagramArtifact) {
  const base = artifact.label ?? `unlabeled ${artifact.primitive ?? artifact.type}`;
  return `${quoteText(base)} [id=${quoteText(artifact.id)}]`;
}

function artifactDisplay(artifact: DiagramArtifact) {
  const parts = [`${artifact.kind} ${connectionLabel(artifact)}`, `type=${quoteText(artifact.type)}`];
  if (artifact.primitive) parts.push(`primitive=${quoteText(artifact.primitive)}`);
  if (artifact.bounds) {
    parts.push(`bounds=x${formatNumber(artifact.bounds.x)},y${formatNumber(artifact.bounds.y)},w${formatNumber(artifact.bounds.width)},h${formatNumber(artifact.bounds.height)}`);
  }
  if (artifact.color) parts.push(`color=${quoteText(artifact.color)}`);
  if (artifact.warnings.length) parts.push(`warnings=${artifact.warnings.map(quoteText).join("; ")}`);
  return parts.join("; ");
}

function classify(type: string): DiagramArtifactKind {
  if (type === "rect" || type === "ellipse") return "component";
  if (type === "note") return "note";
  if (type === "arrow") return "arrow";
  return "other";
}

function readPointArrayBounds(record: Record<string, unknown>, fallback: Point): Bounds | undefined {
  const points = record.points;
  if (!Array.isArray(points)) return undefined;

  const validPoints = points.filter(isRecord).map((point) => {
    const x = readNumber(point, "x");
    const y = readNumber(point, "y");
    return x === undefined || y === undefined ? undefined : { x, y };
  }).filter((point): point is Point => point !== undefined);

  if (!validPoints.length) return undefined;

  const xs = [fallback.x, ...validPoints.map((point) => point.x)];
  const ys = [fallback.y, ...validPoints.map((point) => point.y)];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY
  };
}

function parseArtifact(value: unknown, index: number): DiagramArtifact {
  const fallbackId = `artifact-${index + 1}`;
  if (!isRecord(value)) {
    return {
      index,
      id: fallbackId,
      type: "unknown",
      kind: "other",
      warnings: ["artifact is not an object"]
    };
  }

  const id = readString(value, "id") ?? fallbackId;
  const type = readString(value, "type") ?? "unknown";
  const kind = classify(type);
  const primitive = readString(value, "primitive");
  const label = readString(value, "label");
  const color = readString(value, "color");
  const x = readNumber(value, "x");
  const y = readNumber(value, "y");
  const width = readNumber(value, "width");
  const height = readNumber(value, "height");
  const warnings: string[] = [];

  if (!readString(value, "id")) warnings.push("missing id");
  if (!readString(value, "type")) warnings.push("missing type");

  let bounds: Bounds | undefined;
  let start: Point | undefined;
  let end: Point | undefined;

  if (x === undefined || y === undefined) {
    warnings.push("missing x/y");
  } else if (type === "freehand") {
    bounds = readPointArrayBounds(value, { x, y });
    if (!bounds) warnings.push("missing usable freehand points");
  } else if (width === undefined || height === undefined) {
    warnings.push("missing width/height");
  } else if (type === "arrow" || type === "line") {
    start = { x, y };
    end = { x: x + width, y: y + height };
    bounds = normalizeBounds(x, y, width, height);
  } else {
    bounds = normalizeBounds(x, y, width, height);
  }

  return {
    index,
    id,
    type,
    kind,
    primitive,
    label,
    color,
    bounds,
    start,
    end,
    warnings
  };
}

function parseArtifacts(canvasSummary: unknown) {
  if (!Array.isArray(canvasSummary)) return undefined;
  return canvasSummary.map(parseArtifact);
}

function describeValueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function compareEndpointCandidate(point: Point, a: DiagramArtifact, b: DiagramArtifact) {
  if (!a.bounds || !b.bounds) return compareArtifacts(a, b);
  const areaDelta = boundsArea(a.bounds) - boundsArea(b.bounds);
  if (areaDelta !== 0) return areaDelta;
  const centerDelta = distanceBetween(point, center(a.bounds)) - distanceBetween(point, center(b.bounds));
  if (centerDelta !== 0) return centerDelta;
  return compareArtifacts(a, b);
}

function resolveEndpoint(point: Point, connectableArtifacts: DiagramArtifact[]): EndpointResolution | undefined {
  const boundedArtifacts = connectableArtifacts.filter((artifact) => artifact.bounds);
  const inside = boundedArtifacts
    .filter((artifact) => containsPoint(artifact.bounds!, point))
    .sort((a, b) => compareEndpointCandidate(point, a, b));

  if (inside[0]) {
    return {
      artifact: inside[0],
      method: "inside bounds",
      distance: 0
    };
  }

  const nearest = boundedArtifacts
    .map((artifact) => ({
      artifact,
      distance: distanceToBounds(artifact.bounds!, point)
    }))
    .filter((candidate) => candidate.distance <= CONNECT_DISTANCE_LIMIT)
    .sort((a, b) => {
      const distanceDelta = a.distance - b.distance;
      if (distanceDelta !== 0) return distanceDelta;
      return compareEndpointCandidate(point, a.artifact, b.artifact);
    });

  if (!nearest[0]) return undefined;

  return {
    artifact: nearest[0].artifact,
    method: "nearest within 48 units",
    distance: nearest[0].distance
  };
}

function formatResolution(resolution: EndpointResolution | undefined) {
  if (!resolution) return "unresolved";
  if (resolution.method === "inside bounds") {
    return `${connectionLabel(resolution.artifact)} by inside-bounds match`;
  }
  return `${connectionLabel(resolution.artifact)} by nearest match at ${formatNumber(resolution.distance)} units`;
}

function formatComponents(components: DiagramArtifact[]) {
  if (!components.length) return ["- None detected."];
  return [...components].sort(compareArtifacts).map((artifact) => `- ${artifactDisplay(artifact)}`);
}

function formatNotes(notes: DiagramArtifact[]) {
  if (!notes.length) return ["- None detected."];
  return [...notes].sort(compareArtifacts).map((artifact) => `- ${artifactDisplay(artifact)}`);
}

function formatRelationships(arrows: DiagramArtifact[], connectableArtifacts: DiagramArtifact[]) {
  if (!arrows.length) return { lines: ["- None detected."], connectedIds: new Set<string>() };

  const connectedIds = new Set<string>();
  const lines = [...arrows].sort(compareArtifacts).map((arrow) => {
    if (!arrow.start || !arrow.end) {
      return `- Arrow ${quoteText(arrow.id)}: unresolved because endpoint coordinates are incomplete; ${artifactDisplay(arrow)}`;
    }

    const source = resolveEndpoint(arrow.start, connectableArtifacts);
    const target = resolveEndpoint(arrow.end, connectableArtifacts);
    if (source) connectedIds.add(source.artifact.id);
    if (target) connectedIds.add(target.artifact.id);

    const relationship = source && target
      ? `${connectionLabel(source.artifact)} -> ${connectionLabel(target.artifact)}`
      : `unresolved arrow from ${formatResolution(source)} to ${formatResolution(target)}`;

    return `- Arrow ${quoteText(arrow.id)}: ${relationship}; start=${formatResolution(source)}; end=${formatResolution(target)}; direction follows arrow start to arrowhead.`;
  });

  return { lines, connectedIds };
}

function formatUnconnectedArtifacts(
  artifacts: DiagramArtifact[],
  connectedIds: Set<string>
) {
  const unconnected = artifacts.filter((artifact) => {
    if (artifact.kind === "arrow") return false;
    if (artifact.kind === "component" || artifact.kind === "note") {
      return !connectedIds.has(artifact.id);
    }
    return true;
  }).sort(compareArtifacts);

  if (!unconnected.length) return ["- None detected."];
  return unconnected.map((artifact) => `- ${artifactDisplay(artifact)}`);
}

function stringifyRawJson(canvasSummary: unknown) {
  try {
    return JSON.stringify(canvasSummary, null, 2) ?? "undefined";
  } catch {
    return "[Unable to stringify canvas summary]";
  }
}

export function buildDiagramPromptContext(canvasSummary: unknown): DiagramPromptContext {
  const normalizedCanvasSummary = canvasSummary === undefined ? [] : canvasSummary;
  const artifacts = parseArtifacts(normalizedCanvasSummary);
  const rawJson = stringifyRawJson(normalizedCanvasSummary);

  if (!artifacts) {
    return {
      textContext: `Malformed diagram canvasSummary: expected an array of diagram components, but received ${describeValueType(normalizedCanvasSummary)} (malformed/not-array). Raw canvas JSON is secondary evidence only.`,
      rawJson
    };
  }

  if (!artifacts.length) {
    return {
      textContext: "No diagram components provided.",
      rawJson
    };
  }

  const sortedArtifacts = [...artifacts].sort(compareArtifacts);
  const components = sortedArtifacts.filter((artifact) => artifact.kind === "component");
  const notes = sortedArtifacts.filter((artifact) => artifact.kind === "note");
  const arrows = sortedArtifacts.filter((artifact) => artifact.kind === "arrow");
  const connectableArtifacts = components;
  const relationships = formatRelationships(arrows, connectableArtifacts);
  const unconnected = formatUnconnectedArtifacts(sortedArtifacts, relationships.connectedIds);

  return {
    textContext: [
      "Arrow endpoint matching rule: endpoint-inside-bounds first; otherwise nearest component within 48 units; notes are annotations only and are not matched as relationship endpoints; ties are resolved deterministically by distance, bounds area, center distance, and stable artifact fields.",
      "",
      "Components:",
      ...formatComponents(components),
      "",
      "Notes:",
      ...formatNotes(notes),
      "",
      "Relationships inferred from arrows:",
      ...relationships.lines,
      "",
      "Unconnected or non-relationship artifacts:",
      ...unconnected
    ].join("\n"),
    rawJson
  };
}
