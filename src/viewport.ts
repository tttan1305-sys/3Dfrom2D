import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type PlaneId = "front" | "top" | "right";
export type ViewId = "front" | "top" | "right" | "iso";

const PLANE_SIZE = 120;
const PLANE_COLOR = 0x3b82f6;
const PLANE_SELECTED_COLOR = 0xf59e0b;

/**
 * The 3D viewport: scene, camera, mouse/touch navigation and the three
 * reference planes (Front = XY, Top = XZ, Right = YZ, Y is up).
 */
export class Viewport {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly planes = new Map<PlaneId, THREE.Group>();

  private selectedPlane: PlaneId | null = null;
  private hoveredPlane: PlaneId | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private viewAnimation: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private onPlaneSelect: (id: PlaneId | null) => void = () => {};

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0xeef2f7);
    container.prepend(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
    this.camera.position.set(220, 180, 260);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.15;
    // SolidWorks-style: middle button rotates, right button pans.
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    this.buildScene();
    this.bindPointer();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  setPlaneSelectHandler(handler: (id: PlaneId | null) => void): void {
    this.onPlaneSelect = handler;
  }

  selectPlane(id: PlaneId | null): void {
    this.selectedPlane = id;
    this.refreshPlaneColors();
  }

  setView(view: ViewId): void {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const dir = {
      front: new THREE.Vector3(0, 0, 1),
      top: new THREE.Vector3(0, 1, 0.0001),
      right: new THREE.Vector3(1, 0, 0),
      iso: new THREE.Vector3(1, 1, 1),
    }[view].normalize();
    const to = this.controls.target.clone().add(dir.multiplyScalar(dist));
    this.viewAnimation = { from: this.camera.position.clone(), to, t: 0 };
  }

  zoomToFit(): void {
    this.controls.target.set(0, 0, 0);
    const dir = this.camera.position.clone().normalize();
    const to = dir.multiplyScalar(PLANE_SIZE * 3.2);
    this.viewAnimation = { from: this.camera.position.clone(), to, t: 0 };
  }

  private buildScene(): void {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(200, 300, 150);
    this.scene.add(sun);

    const grid = new THREE.GridHelper(600, 60, 0xb6c2d1, 0xd5dde7);
    grid.position.y = -0.01;
    this.scene.add(grid);

    this.scene.add(this.makeOriginTriad());

    const half = Math.PI / 2;
    this.addPlane("front", new THREE.Euler(0, 0, 0), "Front");
    this.addPlane("top", new THREE.Euler(-half, 0, 0), "Top");
    this.addPlane("right", new THREE.Euler(0, half, 0), "Right");
  }

  private addPlane(id: PlaneId, rotation: THREE.Euler, label: string): void {
    const group = new THREE.Group();
    group.rotation.copy(rotation);
    group.name = id;

    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE),
      new THREE.MeshBasicMaterial({
        color: PLANE_COLOR,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    fill.name = "fill";
    fill.userData.planeId = id;

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(fill.geometry),
      new THREE.LineBasicMaterial({ color: PLANE_COLOR }),
    );
    border.name = "border";

    const tag = this.makeLabel(label);
    tag.position.set(-PLANE_SIZE / 2 + 12, PLANE_SIZE / 2 - 6, 0);

    group.add(fill, border, tag);
    this.planes.set(id, group);
    this.scene.add(group);
  }

  private makeOriginTriad(): THREE.Group {
    const g = new THREE.Group();
    const len = 30;
    const axes: [THREE.Vector3, number][] = [
      [new THREE.Vector3(1, 0, 0), 0xdc2626],
      [new THREE.Vector3(0, 1, 0), 0x16a34a],
      [new THREE.Vector3(0, 0, 1), 0x2563eb],
    ];
    for (const [dir, color] of axes) {
      g.add(new THREE.ArrowHelper(dir, new THREE.Vector3(), len, color, 6, 3));
    }
    return g;
  }

  private makeLabel(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "600 28px system-ui, sans-serif";
    ctx.fillStyle = "#1e3a8a";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 4, 24);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }),
    );
    sprite.scale.set(24, 9, 1);
    return sprite;
  }

  private bindPointer(): void {
    const el = this.renderer.domElement;
    let downAt: { x: number; y: number } | null = null;

    el.addEventListener("pointermove", (e) => {
      this.hoveredPlane = this.pickPlane(e);
      this.refreshPlaneColors();
    });
    el.addEventListener("pointerdown", (e) => {
      downAt = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener("pointerup", (e) => {
      // A click (not a drag) selects the plane under the cursor.
      if (!downAt || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > 4) return;
      const id = this.pickPlane(e);
      this.selectPlane(id);
      this.onPlaneSelect(id);
    });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private pickPlane(e: PointerEvent): PlaneId | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const fills = [...this.planes.values()].map((g) => g.getObjectByName("fill")!);
    const hit = this.raycaster.intersectObjects(fills, false)[0];
    return hit ? (hit.object.userData.planeId as PlaneId) : null;
  }

  private refreshPlaneColors(): void {
    for (const [id, group] of this.planes) {
      const active = id === this.selectedPlane;
      const hover = id === this.hoveredPlane;
      const color = active ? PLANE_SELECTED_COLOR : PLANE_COLOR;
      const fill = group.getObjectByName("fill") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      const border = group.getObjectByName("border") as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
      fill.material.color.setHex(color);
      fill.material.opacity = active ? 0.22 : hover ? 0.16 : 0.08;
      border.material.color.setHex(color);
    }
    this.renderer.domElement.style.cursor = this.hoveredPlane ? "pointer" : "default";
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tick(): void {
    if (this.viewAnimation) {
      const a = this.viewAnimation;
      a.t = Math.min(1, a.t + 0.08);
      const k = 1 - Math.pow(1 - a.t, 3);
      this.camera.position.lerpVectors(a.from, a.to, k);
      if (a.t >= 1) this.viewAnimation = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
