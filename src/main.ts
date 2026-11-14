import "./style.css";
import { Viewport, type PlaneId, type ViewId } from "./viewport";

const PLANE_NAMES: Record<PlaneId, string> = {
  front: "Mặt đứng",
  top: "Mặt bằng",
  right: "Mặt cạnh",
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const viewport = new Viewport($("#viewport"));
const status = $("#status");

// ---- Toolbar -------------------------------------------------------------
// Sketch / Extrude / Revolve / Cut are placeholders until steps 2 and 3.
const tools = [
  { id: "sketch", label: "Sketch", hint: "Vẽ phác thảo 2D trên mặt phẳng đã chọn (Bước 2)" },
  { id: "extrude", label: "Extrude", hint: "Đùn biên dạng thành khối (Bước 3)" },
  { id: "revolve", label: "Revolve", hint: "Xoay biên dạng quanh trục (Bước 3)" },
  { id: "cut", label: "Cut", hint: "Khoét vật liệu (Bước 3)" },
];
$("#toolbar").innerHTML = `
  <div class="brand">3Dfrom2D</div>
  <div class="tools">
    ${tools
      .map((t) => `<button data-tool="${t.id}" title="${t.hint}" disabled>${t.label}</button>`)
      .join("")}
  </div>`;

// ---- Feature tree --------------------------------------------------------
const tree = $("#tree");
tree.innerHTML = `
  <div class="tree-title">Part1</div>
  <ul>
    <li class="static">Origin</li>
    ${(Object.keys(PLANE_NAMES) as PlaneId[])
      .map((id) => `<li data-plane="${id}">${PLANE_NAMES[id]}</li>`)
      .join("")}
  </ul>
  <div class="tree-empty">Chưa có feature nào.</div>`;

tree.addEventListener("click", (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-plane]");
  if (!li) return;
  const id = li.dataset.plane as PlaneId;
  viewport.selectPlane(id);
  onPlaneSelected(id);
});

function onPlaneSelected(id: PlaneId | null): void {
  tree.querySelectorAll("li[data-plane]").forEach((li) => {
    li.classList.toggle("selected", (li as HTMLElement).dataset.plane === id);
  });
  $<HTMLButtonElement>('button[data-tool="sketch"]').disabled = id === null;
  status.textContent = id
    ? `Đã chọn ${PLANE_NAMES[id].toLowerCase()}. Lệnh Sketch sẽ có ở Bước 2.`
    : "Chọn một mặt phẳng để bắt đầu.";
}
viewport.setPlaneSelectHandler(onPlaneSelected);
onPlaneSelected(null);

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
  const v = btn.dataset.view as ViewId | "fit";
  if (v === "fit") viewport.zoomToFit();
  else viewport.setView(v);
});

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key.toLowerCase() === "g") return toggleGrid();
  const map: Record<string, ViewId | "fit"> = { "1": "front", "5": "top", "3": "right", "0": "iso", f: "fit" };
  const v = map[e.key.toLowerCase()];
  if (!v) return;
  if (v === "fit") viewport.zoomToFit();
  else viewport.setView(v);
});
