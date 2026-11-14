import * as THREE from "three";
import type { Viewport } from "../viewport";
import {
  ENTITY_NAMES,
  angleOf,
  dist,
  distanceTo,
  norm,
  outline,
  polar,
  snapPoints,
  v,
  type Entity,
  type Sketch,
  type Vec,
} from "./model";

export type Tool = "select" | "line" | "rect" | "circle" | "arc";

const COLORS = {
  inactive: 0x64748b,
  active: 0x0f172a,
  selected: 0xf97316,
  hover: 0x2563eb,
  preview: 0x2563eb,
  snap: 0xf97316,
  point: 0x0f172a,
};

const SNAP_PX = 10;
const PICK_PX = 8;
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Hint shown next to the dimension box, per tool and drawing stage. */
const INPUT_HINT: Record<Exclude<Tool, "select">, string[]> = {
  line: ["", "Chiều dài (hoặc dài,góc)"],
  rect: ["", "Rộng,cao"],
  circle: ["", "Đường kính"],
  arc: ["", "Bán kính", "Góc quét (°)"],
};

/**
 * Draws all sketches in the 3D scene and handles editing of the active one:
 * drawing tools, snapping, typed dimensions, selection, property editing,
 * delete and undo/redo.
 */
export class SketchEditor {
  private sketches: Sketch[] = [];
  private active: Sketch | null = null;
  private tool: Tool = "select";
  /** Points clicked so far for the tool in progress. */
  private clicks: Vec[] = [];
  private cursor: Vec | null = null;
  private snapped: Vec | null = null;
  private hoverId: number | null = null;
  private selectedId: number | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private nextId = 1;

  private readonly groups = new Map<number, THREE.Group>();
  private readonly overlay = new THREE.Group();

  constructor(
    private readonly viewport: Viewport,
    private readonly ui: {
      props: HTMLElement;
      dimBox: HTMLElement;
      dimInput: HTMLInputElement;
      dimLabel: HTMLElement;
    },
    private readonly onChange: () => void,
    private readonly onStatus: (text: string) => void,
  ) {
    this.overlay.renderOrder = 10;
    this.bindEvents();
  }

  // ---- Public API --------------------------------------------------------

  load(sketches: Sketch[]): void {
    this.sketches = sketches;
    this.nextId = 1 + Math.max(0, ...sketches.flatMap((s) => s.entities.map((e) => e.id)));
    for (const s of sketches) this.redraw(s);
  }

  get activeSketch(): Sketch | null {
    return this.active;
  }

  get currentTool(): Tool {
    return this.tool;
  }

  edit(sketch: Sketch): void {
    if (!this.sketches.includes(sketch)) this.sketches.push(sketch);
    this.active = sketch;
    this.undoStack = [];
    this.redoStack = [];
    this.selectedId = null;
    this.viewport.setSketchMode(sketch.plane);
    this.viewport.planes.get(sketch.plane)!.add(this.overlay);
    this.setTool("line");
    this.redraw(sketch);
  }

  exit(): void {
    if (!this.active) return;
    const s = this.active;
    this.cancelTool();
    this.active = null;
    this.selectedId = null;
    this.hoverId = null;
    this.overlay.removeFromParent();
    this.viewport.setSketchMode(null);
    this.viewport.renderer.domElement.style.cursor = "default";
    this.redraw(s);
    this.renderProps();
  }

  remove(sketch: Sketch): void {
    this.groups.get(sketch.id)?.removeFromParent();
    this.groups.delete(sketch.id);
    this.sketches = this.sketches.filter((s) => s !== sketch);
  }

  setTool(tool: Tool): void {
    this.cancelTool();
    this.tool = tool;
    if (tool !== "select") this.selectedId = null;
    this.viewport.renderer.domElement.style.cursor = tool === "select" ? "default" : "crosshair";
    this.refresh();
    this.renderProps();
    this.statusForTool();
  }

  undo(): void {
    if (!this.active || this.undoStack.length === 0) return;
    this.redoStack.push(JSON.stringify(this.active.entities));
    this.active.entities = JSON.parse(this.undoStack.pop()!);
    this.afterEdit();
  }

  redo(): void {
    if (!this.active || this.redoStack.length === 0) return;
    this.undoStack.push(JSON.stringify(this.active.entities));
    this.active.entities = JSON.parse(this.redoStack.pop()!);
    this.afterEdit();
  }

  deleteSelected(): void {
    if (!this.active || this.selectedId === null) return;
    this.checkpoint();
    this.active.entities = this.active.entities.filter((e) => e.id !== this.selectedId);
    this.selectedId = null;
    this.afterEdit();
  }

  /** Esc: first cancels the tool in progress, then drops the selection. */
  escape(): void {
    if (this.clicks.length) this.cancelTool();
    else if (this.selectedId !== null) {
      this.selectedId = null;
      this.renderProps();
    } else if (this.tool !== "select") this.setTool("select");
    this.refresh();
  }

  /** Focus the dimension box (called when a digit is typed). */
  focusDimension(): boolean {
    if (this.ui.dimBox.hidden) return false;
    this.ui.dimInput.focus();
    return true;
  }

  // ---- Events ------------------------------------------------------------

  private bindEvents(): void {
    const el = this.viewport.renderer.domElement;
    let down: { x: number; y: number; button: number } | null = null;

    el.addEventListener("pointermove", (e) => {
      if (!this.active) return;
      this.updateCursor(e.clientX, e.clientY);
    });
    el.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY, button: e.button };
    });
    el.addEventListener("pointerup", (e) => {
      if (!this.active || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const button = down.button;
      down = null;
      if (moved > 5) return; // a pan/zoom drag, not a click
      if (button === 2) {
        this.finishChain();
        return;
      }
      if (button !== 0) return;
      this.updateCursor(e.clientX, e.clientY);
      this.click();
    });
    el.addEventListener("dblclick", () => {
      if (this.active && this.tool === "line") this.finishChain();
    });

    this.ui.dimInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.applyTypedValue(this.ui.dimInput.value);
      } else if (e.key === "Escape") {
        this.ui.dimInput.value = "";
        this.ui.dimInput.blur();
        this.escape();
      }
      e.stopPropagation();
    });
  }

  private updateCursor(clientX: number, clientY: number): void {
    const p = this.viewport.pointerOnPlane(this.active!.plane, clientX, clientY);
    if (!p) return;
    const raw = v(p.x, p.y);
    const px = this.viewport.pixelSize();

    if (this.tool === "select") {
      this.cursor = raw;
      this.hoverId = this.pick(raw, px * PICK_PX);
      this.viewport.renderer.domElement.style.cursor = this.hoverId !== null ? "pointer" : "default";
      this.refresh();
      return;
    }

    // Snap to existing points first, then to horizontal/vertical, then round.
    this.snapped = this.findSnap(raw, px * SNAP_PX);
    let pt = this.snapped ?? this.round(raw, px);
    const from = this.clicks[this.clicks.length - 1];
    let hint = "";
    if (!this.snapped && from && (this.tool === "line" || (this.tool === "arc" && this.clicks.length === 1))) {
      const a = norm(angleOf(from, pt));
      const tol = rad(4);
      for (const [target, name] of [
        [0, "ngang"],
        [Math.PI / 2, "dọc"],
        [Math.PI, "ngang"],
        [(3 * Math.PI) / 2, "dọc"],
        [2 * Math.PI, "ngang"],
      ] as const) {
        if (Math.abs(a - target) < tol) {
          const r = dist(from, pt);
          pt = this.roundVec(polar(from, r, target), px);
          hint = ` (${name})`;
        }
      }
    }
    this.cursor = pt;
    this.refresh();
    this.statusLive(hint);
  }

  private click(): void {
    const s = this.active!;
    const p = this.cursor;
    if (!p) return;

    if (this.tool === "select") {
      this.selectedId = this.hoverId;
      this.renderProps();
      this.refresh();
      return;
    }

    this.clicks.push(p);
    const [a, b, c] = this.clicks;
    switch (this.tool) {
      case "line":
        if (this.clicks.length === 2) {
          if (dist(a, b) > 1e-6) this.add({ id: 0, kind: "line", a, b });
          this.clicks = [b]; // keep chaining from the end point
        }
        break;
      case "rect":
        if (this.clicks.length === 2) {
          if (Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.y - b.y) > 1e-6) this.add({ id: 0, kind: "rect", a, b });
          this.clicks = [];
        }
        break;
      case "circle":
        if (this.clicks.length === 2) {
          const r = dist(a, b);
          if (r > 1e-6) this.add({ id: 0, kind: "circle", c: a, r });
          this.clicks = [];
        }
        break;
      case "arc":
        if (this.clicks.length === 3) {
          const r = dist(a, b);
          const start = angleOf(a, b);
          const sweep = norm(angleOf(a, c) - start) || 2 * Math.PI;
          if (r > 1e-6) this.add({ id: 0, kind: "arc", c: a, r, start, sweep });
          this.clicks = [];
        }
        break;
    }
    void s;
    this.ui.dimInput.value = "";
    this.refresh();
    this.statusForTool();
  }

  private finishChain(): void {
    if (this.clicks.length) {
      this.cancelTool();
      this.statusForTool();
    }
  }

  private applyTypedValue(text: string): void {
    const nums = text
      .split(/[,;x*\s]+/)
      .filter(Boolean)
      .map(Number);
    if (nums.length === 0 || nums.some((n) => !Number.isFinite(n))) return;
    const cur = this.cursor;
    const [a] = this.clicks;
    if (!a || !cur) return;

    let point: Vec | null = null;
    switch (this.tool) {
      case "line": {
        const ang = nums.length > 1 ? rad(nums[1]) : angleOf(a, cur);
        point = polar(a, Math.abs(nums[0]), ang);
        break;
      }
      case "rect": {
        const w = Math.abs(nums[0]);
        const h = Math.abs(nums[1] ?? nums[0]);
        point = v(a.x + w * Math.sign(cur.x - a.x || 1), a.y + h * Math.sign(cur.y - a.y || 1));
        break;
      }
      case "circle":
        point = polar(a, Math.abs(nums[0]) / 2, angleOf(a, cur) || 0);
        break;
      case "arc":
        if (this.clicks.length === 1) point = polar(a, Math.abs(nums[0]), angleOf(a, cur) || 0);
        else {
          const b = this.clicks[1];
          point = polar(a, dist(a, b), angleOf(a, b) + rad(nums[0]));
        }
        break;
    }
    if (!point) return;
    this.cursor = point;
    this.ui.dimInput.value = "";
    this.click();
  }

  // ---- Editing helpers ---------------------------------------------------

  private add(e: Entity): void {
    this.checkpoint();
    e.id = this.nextId++;
    this.active!.entities.push(e);
    this.afterEdit();
  }

  private checkpoint(): void {
    this.undoStack.push(JSON.stringify(this.active!.entities));
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  private afterEdit(): void {
    if (this.selectedId !== null && !this.active!.entities.some((e) => e.id === this.selectedId)) {
      this.selectedId = null;
    }
    this.redraw(this.active!);
    this.renderProps();
    this.onChange();
  }

  private cancelTool(): void {
    this.clicks = [];
    this.snapped = null;
    this.ui.dimInput.value = "";
    this.refresh();
  }

  private pick(p: Vec, tol: number): number | null {
    let best: { id: number; d: number } | null = null;
    for (const e of this.active!.entities) {
      const d = distanceTo(e, p);
      if (d < tol && (!best || d < best.d)) best = { id: e.id, d };
    }
    return best?.id ?? null;
  }

  private findSnap(p: Vec, tol: number): Vec | null {
    const candidates = [v(0, 0), ...this.clicks, ...this.active!.entities.flatMap(snapPoints)];
    let best: Vec | null = null;
    let bestD = tol;
    for (const c of candidates) {
      const d = dist(c, p);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best ? v(best.x, best.y) : null;
  }

  /** Round to a "nice" step that depends on zoom (0.01 … 10 mm). */
  private round(p: Vec, px: number): Vec {
    return this.roundVec(p, px);
  }

  private roundVec(p: Vec, px: number): Vec {
    const steps = [0.01, 0.05, 0.1, 0.5, 1, 5, 10];
    const step = steps.find((s) => s >= px * 3) ?? 10;
    const r = (n: number) => Math.round(n / step) * step;
    return v(r(p.x), r(p.y));
  }

  // ---- Status & dimension box -------------------------------------------

  private statusForTool(): void {
    const n = this.clicks.length;
    const text: Record<Tool, string[]> = {
      select: ["Nhấp vào một nét để chọn và sửa kích thước. Delete để xóa."],
      line: ["Line: nhấp điểm đầu.", "Line: nhấp điểm tiếp theo, hoặc gõ chiều dài rồi Enter. Nhấp phải hoặc Esc để dừng."],
      rect: ["Rectangle: nhấp góc thứ nhất.", "Rectangle: nhấp góc đối diện, hoặc gõ rộng,cao rồi Enter."],
      circle: ["Circle: nhấp tâm.", "Circle: nhấp điểm trên đường tròn, hoặc gõ đường kính rồi Enter."],
      arc: ["Arc: nhấp tâm.", "Arc: nhấp điểm đầu cung, hoặc gõ bán kính.", "Arc: nhấp điểm cuối (ngược chiều kim đồng hồ), hoặc gõ góc."],
    };
    this.onStatus(text[this.tool][Math.min(n, text[this.tool].length - 1)]);
    this.updateDimBox();
  }

  private statusLive(hint: string): void {
    const [a, b] = this.clicks;
    const c = this.cursor;
    if (!a || !c) {
      if (c) this.onStatus(`${this.statusPrefix()} X ${fmt(c.x)}  Y ${fmt(c.y)}${this.snapped ? "  (bắt điểm)" : ""}`);
      return;
    }
    let text = "";
    switch (this.tool) {
      case "line":
        text = `Dài ${fmt(dist(a, c))}  Góc ${fmt(deg(norm(angleOf(a, c))))}°`;
        break;
      case "rect":
        text = `Rộng ${fmt(Math.abs(c.x - a.x))}  Cao ${fmt(Math.abs(c.y - a.y))}`;
        break;
      case "circle":
        text = `Đường kính ${fmt(2 * dist(a, c))}`;
        break;
      case "arc":
        text = b
          ? `Bán kính ${fmt(dist(a, b))}  Góc quét ${fmt(deg(norm(angleOf(a, c) - angleOf(a, b))))}°`
          : `Bán kính ${fmt(dist(a, c))}`;
        break;
    }
    this.onStatus(`${this.statusPrefix()} ${text}${hint}${this.snapped ? "  (bắt điểm)" : ""}`);
  }

  private statusPrefix(): string {
    return { select: "", line: "Line:", rect: "Rectangle:", circle: "Circle:", arc: "Arc:" }[this.tool];
  }

  private updateDimBox(): void {
    const hint = this.tool === "select" ? "" : INPUT_HINT[this.tool][this.clicks.length] ?? "";
    this.ui.dimBox.hidden = !this.active || !hint;
    this.ui.dimLabel.textContent = hint;
    if (!hint) this.ui.dimInput.blur();
  }

  // ---- Properties panel (edit dimensions of the selected entity) ---------

  private renderProps(): void {
    const panel = this.ui.props;
    const e = this.active?.entities.find((x) => x.id === this.selectedId);
    if (!e) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    const fields = this.fieldsFor(e);
    panel.hidden = false;
    panel.innerHTML = `
      <div class="props-title">${ENTITY_NAMES[e.kind]}</div>
      ${fields
        .map(
          (f, i) => `<label><span>${f.label}</span>
            <input type="number" step="any" data-field="${i}" value="${fmt(f.get())}" /></label>`,
        )
        .join("")}
      <button class="danger" data-action="delete">Xóa</button>`;
    panel.querySelectorAll<HTMLInputElement>("input[data-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const val = Number(input.value);
        if (!Number.isFinite(val)) return;
        this.checkpoint();
        fields[Number(input.dataset.field)].set(val);
        this.afterEdit();
      });
      input.addEventListener("keydown", (ev) => ev.stopPropagation());
    });
    panel.querySelector("[data-action=delete]")!.addEventListener("click", () => this.deleteSelected());
  }

  private fieldsFor(e: Entity): { label: string; get: () => number; set: (n: number) => void }[] {
    switch (e.kind) {
      case "line": {
        const len = () => dist(e.a, e.b);
        const ang = () => deg(norm(angleOf(e.a, e.b)));
        return [
          { label: "X đầu", get: () => e.a.x, set: (n) => this.moveLine(e, v(n, e.a.y)) },
          { label: "Y đầu", get: () => e.a.y, set: (n) => this.moveLine(e, v(e.a.x, n)) },
          { label: "Chiều dài", get: len, set: (n) => (e.b = polar(e.a, Math.abs(n), rad(ang()))) },
          { label: "Góc (°)", get: ang, set: (n) => (e.b = polar(e.a, len(), rad(n))) },
        ];
      }
      case "rect": {
        const sx = () => Math.sign(e.b.x - e.a.x) || 1;
        const sy = () => Math.sign(e.b.y - e.a.y) || 1;
        return [
          { label: "X góc", get: () => e.a.x, set: (n) => ((e.b.x += n - e.a.x), (e.a.x = n)) },
          { label: "Y góc", get: () => e.a.y, set: (n) => ((e.b.y += n - e.a.y), (e.a.y = n)) },
          { label: "Rộng", get: () => Math.abs(e.b.x - e.a.x), set: (n) => (e.b.x = e.a.x + sx() * Math.abs(n)) },
          { label: "Cao", get: () => Math.abs(e.b.y - e.a.y), set: (n) => (e.b.y = e.a.y + sy() * Math.abs(n)) },
        ];
      }
      case "circle":
        return [
          { label: "X tâm", get: () => e.c.x, set: (n) => (e.c = v(n, e.c.y)) },
          { label: "Y tâm", get: () => e.c.y, set: (n) => (e.c = v(e.c.x, n)) },
          { label: "Đường kính", get: () => 2 * e.r, set: (n) => (e.r = Math.abs(n) / 2 || e.r) },
        ];
      case "arc":
        return [
          { label: "X tâm", get: () => e.c.x, set: (n) => (e.c = v(n, e.c.y)) },
          { label: "Y tâm", get: () => e.c.y, set: (n) => (e.c = v(e.c.x, n)) },
          { label: "Bán kính", get: () => e.r, set: (n) => (e.r = Math.abs(n) || e.r) },
          { label: "Góc đầu (°)", get: () => deg(norm(e.start)), set: (n) => (e.start = rad(n)) },
          { label: "Góc quét (°)", get: () => deg(e.sweep), set: (n) => (e.sweep = rad(Math.min(360, Math.abs(n))) || e.sweep) },
        ];
    }
  }

  private moveLine(e: Extract<Entity, { kind: "line" }>, a: Vec): void {
    e.b = v(e.b.x + a.x - e.a.x, e.b.y + a.y - e.a.y);
    e.a = a;
  }

  // ---- Drawing in the 3D scene -------------------------------------------

  /** Rebuild the 3D lines of one sketch. */
  private redraw(s: Sketch): void {
    let g = this.groups.get(s.id);
    if (!g) {
      g = new THREE.Group();
      g.name = `sketch-${s.id}`;
      this.groups.set(s.id, g);
    }
    this.viewport.planes.get(s.plane)!.add(g);
    disposeChildren(g);

    const isActive = s === this.active;
    for (const e of s.entities) {
      const color = !isActive
        ? COLORS.inactive
        : e.id === this.selectedId
          ? COLORS.selected
          : e.id === this.hoverId
            ? COLORS.hover
            : COLORS.active;
      g.add(makeLine(outline(e), color));
    }
    if (isActive) {
      const pts = s.entities.flatMap((e) => (e.kind === "circle" || e.kind === "arc" ? [e.c] : snapPoints(e).slice(0, e.kind === "line" ? 2 : 4)));
      if (pts.length) g.add(makePoints(pts, COLORS.point, 5));
    }
  }

  /** Redraw the active sketch (colours) and the tool preview / snap marker. */
  private refresh(): void {
    if (this.active) this.redraw(this.active);
    disposeChildren(this.overlay);
    if (!this.active) return;

    const preview = this.previewEntity();
    if (preview) this.overlay.add(makeLine(outline(preview), COLORS.preview, true));
    if (this.tool === "arc" && this.clicks.length >= 1 && this.cursor) {
      // Construction line from the centre to the cursor.
      this.overlay.add(makeLine([this.clicks[0], this.cursor], COLORS.inactive, true));
    }
    if (this.snapped) this.overlay.add(makePoints([this.snapped], COLORS.snap, 11));
    if (this.clicks.length) this.overlay.add(makePoints(this.clicks, COLORS.preview, 6));
    this.updateDimBox();
  }

  private previewEntity(): Entity | null {
    const [a, b] = this.clicks;
    const c = this.cursor;
    if (!a || !c) return null;
    switch (this.tool) {
      case "line":
        return { id: -1, kind: "line", a, b: c };
      case "rect":
        return { id: -1, kind: "rect", a, b: c };
      case "circle":
        return { id: -1, kind: "circle", c: a, r: dist(a, c) };
      case "arc":
        if (!b) return { id: -1, kind: "circle", c: a, r: dist(a, c) };
        return { id: -1, kind: "arc", c: a, r: dist(a, b), start: angleOf(a, b), sweep: norm(angleOf(a, c) - angleOf(a, b)) };
      default:
        return null;
    }
  }
}

function makeLine(points: Vec[], color: number, dashed = false): THREE.Line {
  const geom = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, 0.05)));
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5, depthTest: false })
    : new THREE.LineBasicMaterial({ color, depthTest: false });
  const line = new THREE.Line(geom, mat);
  if (dashed) line.computeLineDistances();
  line.renderOrder = 10;
  return line;
}

function makePoints(points: Vec[], color: number, size: number): THREE.Points {
  const geom = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, 0.06)));
  const pts = new THREE.Points(geom, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, depthTest: false }));
  pts.renderOrder = 11;
  return pts;
}

function disposeChildren(g: THREE.Object3D): void {
  for (const child of [...g.children]) {
    g.remove(child);
    const obj = child as THREE.Line;
    obj.geometry?.dispose();
    (obj.material as THREE.Material | undefined)?.dispose();
  }
}
