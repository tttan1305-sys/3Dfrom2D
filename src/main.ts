import "./style.css";
import { Viewport, type PlaneId, type ViewId } from "./viewport";
import { SketchEditor, type Tool } from "./sketch/editor";
import type { Sketch } from "./sketch/model";
import { loadDocument, saveDocument } from "./storage";
import { initUpdater } from "./updater";

const PLANE_NAMES: Record<PlaneId, string> = {
  front: "Mặt đứng",
  top: "Mặt bằng",
  right: "Mặt cạnh",
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const viewport = new Viewport($("#viewport"));
const status = $("#status");
const toolbar = $("#toolbar");
const tree = $("#tree");

const doc = loadDocument();
let selectedPlane: PlaneId | null = null;

const editor = new SketchEditor(
  viewport,
  {
    props: $("#props"),
    dimBox: $("#dim-box"),
    dimInput: $<HTMLInputElement>("#dim-input"),
    dimLabel: $("#dim-label"),
  },
  () => {
    saveDocument(doc);
    renderTree();
  },
  (text) => (status.textContent = text),
);
editor.load(doc.sketches);

// ---- Toolbar -------------------------------------------------------------

const PART_TOOLS = [
  { id: "sketch", label: "Sketch", hint: "Vẽ phác thảo 2D trên mặt phẳng đã chọn" },
  { id: "extrude", label: "Extrude", hint: "Đùn biên dạng thành khối (Bước 3)" },
  { id: "revolve", label: "Revolve", hint: "Xoay biên dạng quanh trục (Bước 3)" },
  { id: "cut", label: "Cut", hint: "Khoét vật liệu (Bước 3)" },
];

const SKETCH_TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: "select", label: "Chọn", key: "S" },
  { id: "line", label: "Line", key: "L" },
  { id: "rect", label: "Rectangle", key: "R" },
  { id: "circle", label: "Circle", key: "C" },
  { id: "arc", label: "Arc", key: "A" },
];

function renderToolbar(): void {
  const sketch = editor.activeSketch;
  if (!sketch) {
    toolbar.innerHTML = `
      <div class="brand">3Dfrom2D</div>
      <div class="tools">
        ${PART_TOOLS.map(
          (t) =>
            `<button data-cmd="${t.id}" title="${t.hint}" ${t.id === "sketch" && selectedPlane ? "" : "disabled"}>${t.label}</button>`,
        ).join("")}
      </div>
      <div id="update-slot"></div>`;
    updater.mount();
    return;
  }
  toolbar.innerHTML = `
    <button class="primary" data-cmd="exit" title="Thoát Sketch (Ctrl+Enter)">✓ Thoát</button>
    <div class="tools">
      ${SKETCH_TOOLS.map(
        (t) =>
          `<button data-tool="${t.id}" class="${editor.currentTool === t.id ? "active" : ""}" title="${t.label} (${t.key})">${t.label}</button>`,
      ).join("")}
      <span class="sep"></span>
      <button data-cmd="undo" title="Hoàn tác (Ctrl+Z)">↶</button>
      <button data-cmd="redo" title="Làm lại (Ctrl+Y)">↷</button>
    </div>
    <div class="sketch-name">${sketch.name} · ${PLANE_NAMES[sketch.plane]}</div>`;
}

toolbar.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!btn || btn.disabled) return;
  if (btn.dataset.tool) return setTool(btn.dataset.tool as Tool);
  switch (btn.dataset.cmd) {
    case "sketch":
      if (selectedPlane) newSketch(selectedPlane);
      break;
    case "exit":
      exitSketch();
      break;
    case "undo":
      editor.undo();
      break;
    case "redo":
      editor.redo();
      break;
  }
});

function setTool(tool: Tool): void {
  editor.setTool(tool);
  renderToolbar();
}

// ---- Sketch lifecycle ----------------------------------------------------

function newSketch(plane: PlaneId): void {
  const n = 1 + Math.max(0, ...doc.sketches.map((s) => Number(s.name.replace(/\D/g, "")) || 0));
  const id = 1 + Math.max(0, ...doc.sketches.map((s) => s.id));
  const sketch: Sketch = { id, name: `Sketch${n}`, plane, entities: [] };
  doc.sketches.push(sketch);
  editSketch(sketch);
  saveDocument(doc);
}

function editSketch(sketch: Sketch): void {
  if (editor.activeSketch) editor.exit();
  selectPlane(null);
  editor.edit(sketch);
  renderToolbar();
  renderTree();
}

function exitSketch(): void {
  const s = editor.activeSketch;
  if (!s) return;
  editor.exit();
  // An empty sketch is not worth keeping.
  if (s.entities.length === 0) {
    doc.sketches = doc.sketches.filter((x) => x !== s);
    editor.remove(s);
  }
  saveDocument(doc);
  renderToolbar();
  renderTree();
  status.textContent = IDLE_STATUS;
}

function deleteSketch(sketch: Sketch): void {
  if (!confirm(`Xóa ${sketch.name}?`)) return;
  if (editor.activeSketch === sketch) editor.exit();
  editor.remove(sketch);
  doc.sketches = doc.sketches.filter((x) => x !== sketch);
  saveDocument(doc);
  renderToolbar();
  renderTree();
}

// ---- Feature tree --------------------------------------------------------

const IDLE_STATUS = "Chọn một mặt phẳng rồi bấm Sketch, hoặc nhấp một Sketch trong cây để sửa.";

function renderTree(): void {
  const active = editor.activeSketch;
  tree.innerHTML = `
    <div class="tree-title">Part1</div>
    <ul>
      <li class="static">Origin</li>
      ${(Object.keys(PLANE_NAMES) as PlaneId[])
        .map((id) => `<li data-plane="${id}" class="${id === selectedPlane ? "selected" : ""}">${PLANE_NAMES[id]}</li>`)
        .join("")}
      ${doc.sketches
        .map(
          (s) => `<li data-sketch="${s.id}" class="sketch ${s === active ? "editing" : ""}" title="Nhấp để sửa">
            <span>✎ ${s.name} <small>${PLANE_NAMES[s.plane]} · ${s.entities.length} nét</small></span>
            <button class="icon" data-delete="${s.id}" title="Xóa sketch">×</button>
          </li>`,
        )
        .join("")}
    </ul>
    ${doc.sketches.length === 0 ? `<div class="tree-empty">Chưa có feature nào.</div>` : ""}`;
}

tree.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const del = target.closest<HTMLElement>("[data-delete]");
  if (del) {
    const s = doc.sketches.find((x) => x.id === Number(del.dataset.delete));
    if (s) deleteSketch(s);
    return;
  }
  const sk = target.closest<HTMLElement>("li[data-sketch]");
  if (sk) {
    const s = doc.sketches.find((x) => x.id === Number(sk.dataset.sketch));
    if (s && s !== editor.activeSketch) editSketch(s);
    return;
  }
  const li = target.closest<HTMLElement>("li[data-plane]");
  if (!li || editor.activeSketch) return;
  selectPlane(li.dataset.plane as PlaneId);
});

function selectPlane(id: PlaneId | null): void {
  selectedPlane = id;
  viewport.selectPlane(id);
  renderTree();
  renderToolbar();
  if (!editor.activeSketch) {
    status.textContent = id
      ? `Đã chọn ${PLANE_NAMES[id].toLowerCase()}. Bấm Sketch để vẽ trên mặt phẳng này.`
      : IDLE_STATUS;
  }
}
viewport.setPlaneSelectHandler((id) => selectPlane(id));

// ---- View buttons --------------------------------------------------------

const views: { id: ViewId | "fit"; label: string }[] = [
  { id: "front", label: "Đứng" },
  { id: "top", label: "Bằng" },
  { id: "right", label: "Cạnh" },
  { id: "iso", label: "Iso" },
  { id: "fit", label: "Fit" },
];
const viewButtons = $("#view-buttons");
viewButtons.innerHTML =
  views.map((v) => `<button data-view="${v.id}">${v.label}</button>`).join("") +
  `<button data-grid title="Bật/tắt lưới (G)">Grid</button>`;
const gridButton = $<HTMLButtonElement>("button[data-grid]");
const toggleGrid = () => gridButton.classList.toggle("active", viewport.toggleGrid());
gridButton.addEventListener("click", toggleGrid);
viewButtons.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("button[data-view]");
  if (!btn) return;
  applyView(btn.dataset.view as ViewId | "fit");
});

function applyView(v: ViewId | "fit"): void {
  // In sketch mode the view stays square to the sketch plane.
  if (editor.activeSketch) {
    if (v === "fit") viewport.setView(editor.activeSketch.plane);
    return;
  }
  if (v === "fit") viewport.zoomToFit();
  else viewport.setView(v);
}

// ---- Keyboard ------------------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const key = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;

  if (editor.activeSketch) {
    if (ctrl && key === "z") {
      e.preventDefault();
      return e.shiftKey ? editor.redo() : editor.undo();
    }
    if (ctrl && key === "y") {
      e.preventDefault();
      return editor.redo();
    }
    if (ctrl && key === "enter") return exitSketch();
    if (key === "escape") {
      editor.escape();
      return renderToolbar();
    }
    if (key === "delete" || key === "backspace") {
      e.preventDefault();
      return editor.deleteSelected();
    }
    // Digits start typing a dimension while a tool is in progress.
    if (/^[0-9.\-]$/.test(e.key) && editor.focusDimension()) return;
    const tool = SKETCH_TOOLS.find((t) => t.key.toLowerCase() === key);
    if (tool && !ctrl) return setTool(tool.id);
  }

  if (key === "g") return toggleGrid();
  const map: Record<string, ViewId | "fit"> = { "1": "front", "5": "top", "3": "right", "0": "iso", f: "fit" };
  if (map[key]) applyView(map[key]);
});

// ---- Start ---------------------------------------------------------------

const updater = initUpdater(() => document.querySelector<HTMLElement>("#update-slot"));
renderToolbar();
renderTree();
selectPlane(null);
