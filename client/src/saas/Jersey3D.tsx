import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { artworkSvg, type Design } from "@shared/production";
import {
  Loader2,
  RotateCcw,
  Download,
  Maximize2,
  Box,
  ScanLine,
  UserRound,
} from "lucide-react";

function environment() {
  const w = 512,
    h = 256,
    data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w,
        v = y / h;
      let light = 0.12 + 0.08 * Math.sin(v * Math.PI);
      if (
        ((u > 0.08 && u < 0.24) || (u > 0.58 && u < 0.67)) &&
        v > 0.22 &&
        v < 0.63
      )
        light = 2.3;
      if (u > 0.79 && u < 0.94 && v > 0.15 && v < 0.45) light = 1.2;
      const i = (y * w + x) * 4;
      data[i] = light;
      data[i + 1] = light * 0.99;
      data[i + 2] = light * 0.98;
      data[i + 3] = 1;
    }
  const texture = new THREE.DataTexture(
    data,
    w,
    h,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}
function textileNormal() {
  const w = 256,
    data = new Uint8Array(w * w * 4);
  function height(x: number, y: number) {
    return (
      0.5 * Math.sin((x * Math.PI) / 4) * Math.cos((y * Math.PI) / 4) +
      0.12 * Math.sin((x + y) * Math.PI)
    );
  }
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const dx = height(x + 1, y) - height(x - 1, y),
        dy = height(x, y + 1) - height(x, y - 1);
      const n = new THREE.Vector3(-dx * 0.65, -dy * 0.65, 1).normalize(),
        i = (y * w + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, w, w);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(12, 12);
  t.needsUpdate = true;
  return t;
}
export default function Jersey3D({
  design,
  imageData,
  assetUrl,
  showroomLabel = true,
}: {
  design: Design;
  imageData?: string;
  assetUrl?: string;
  showroomLabel?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<
      | {
          mode: (mode: string) => void;
          reset: () => void;
          avatar: () => void;
          capture: () => void;
        }
      | undefined
    >(undefined),
    [mode, setMode] = useState("live"),
    [status, setStatus] = useState("Caricamento capo"),
    [error, setError] = useState(""),
    [samples, setSamples] = useState(0),
    [resolution, setResolution] = useState(""),
    [avatar, setAvatar] = useState(false);
  const look = useRef({ design, imageData });
  look.current = { design, imageData };
  const updateLook = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    updateLook.current?.();
  }, [design, imageData]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false,
      frame = 0,
      quality = "live",
      moving = false,
      lastMotion = 0,
      pt: any,
      rendering = false;
    const textures: THREE.Texture[] = [],
      materials: THREE.Material[] = [],
      geometries: THREE.BufferGeometry[] = [];
    let meshGroup: THREE.Group | undefined;
    const avatars: THREE.Object3D[] = [];
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
    } catch {
      setError(
        "WebGL 2 non disponibile. Apri lo studio in un browser con accelerazione grafica."
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "Divisa 3D");
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e8e8e5");
    const env = environment();
    scene.environment = env;
    scene.environmentIntensity = 1;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
    camera.position.set(0.9, 0.45, 2.25);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.target.set(0, 0, 0);
    controls.minDistance = 0.65;
    controls.maxDistance = 4;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.addEventListener("start", () => {
      moving = true;
      lastMotion = performance.now();
    });
    controls.addEventListener("end", () => {
      moving = false;
      lastMotion = performance.now();
    });
    controls.addEventListener("change", () => {
      lastMotion = performance.now();
      pt?.updateCamera();
    });
    const floorGeo = new THREE.PlaneGeometry(200, 200),
      floorMat = new THREE.MeshStandardMaterial({
        color: "#e4e4e0",
        roughness: 1,
      });
    geometries.push(floorGeo);
    materials.push(floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.49;
    floor.receiveShadow = true;
    scene.add(floor);
    const key = new THREE.DirectionalLight("#fff4e8", 2);
    key.position.set(-1.5, 3, 2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1;
    key.shadow.camera.right = 1;
    key.shadow.camera.top = 1;
    key.shadow.camera.bottom = -1;
    key.shadow.normalBias = 0.005;
    key.shadow.bias = -0.0001;
    key.shadow.radius = 5;
    scene.add(key);
    scene.add(new THREE.HemisphereLight("#ffffff", "#69727d", 1.1));
    const rim = new THREE.DirectionalLight("#d2e5f4", 2);
    rim.position.set(2, 1, -2);
    scene.add(rim);
    const normal = textileNormal();
    textures.push(normal, env);
    let revision = 0;
    const fabricMeshes: { mesh: THREE.Mesh; role: string }[] = [];
    async function update() {
      const rev = ++revision;
      const { design: d, imageData: img } = look.current;
      const oldMaps = new Set<THREE.Texture>();
      const urls = new Map<string, THREE.Texture>();
      for (const { mesh, role } of fabricMeshes) {
        const back = role === "back",
          sleeve = role.includes("sleeve");
        const key = back ? "back" : sleeve ? "sleeve" : "front";
        let texture = urls.get(key);
        if (!texture) {
          try {
            const image = await new Promise<HTMLImageElement>(
              (resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artworkSvg(d, back, img, sleeve))}`;
              }
            );
            if (disposed || rev !== revision) return;
            const canvas = document.createElement("canvas");
            canvas.width = 1024;
            canvas.height = 1536;
            canvas.getContext("2d")!.drawImage(image, 0, 0, 1024, 1536);
            texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.flipY = false;
            texture.anisotropy = Math.min(
              8,
              renderer.capabilities.getMaxAnisotropy()
            );
            urls.set(key, texture);
            textures.push(texture);
          } catch {
            setError("La grafica non è stata caricata.");
            return;
          }
        }
        const mat = mesh.material as THREE.MeshPhysicalMaterial;
        if (role === "collar") {
          mat.color.set(d.accent);
          mat.map = null;
          mat.needsUpdate = true;
          continue;
        }
        if (mat.map) oldMaps.add(mat.map);
        mat.map = texture;
        mat.needsUpdate = true;
      }
      oldMaps.forEach(t => t.dispose());
      if (pt) {
        pt.updateMaterials();
        pt.reset();
      }
    }
    updateLook.current = update;
    function sceneReady() {
      pt?.setScene(scene, camera);
    }
    async function setQuality(q: string) {
      quality = q;
      setMode(q);
      if (q === "live") return;
      if (pt) {
        pt.reset();
        return;
      }
      setStatus("Preparazione path tracing");
      try {
        const { WebGLPathTracer } = await import("three-gpu-pathtracer");
        if (disposed) return;
        pt = new WebGLPathTracer(renderer);
        pt.bounces = 3;
        pt.tiles.set(2, 2);
        const gl = renderer.getContext(),
          debug = gl.getExtension("WEBGL_debug_renderer_info");
        const software =
          debug &&
          /swiftshader|llvmpipe|software/i.test(
            String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
          );
        pt.renderScale = software
          ? Math.min(
              0.5,
              Math.sqrt(
                4096 /
                  (el!.clientWidth *
                    el!.clientHeight *
                    renderer.getPixelRatio() ** 2)
              )
            )
          : 0.8;
        pt.dynamicLowRes = false;
        pt.lowResScale = 0.25;
        pt.minSamples = 1;
        pt.renderDelay = 150;
        pt.fadeDuration = 0;
        pt.textureSize.set(512, 512);
        pt.setScene(scene, camera);
        setStatus("");
      } catch (e) {
        quality = "live";
        setMode("live");
        setError(
          "Path tracing non disponibile su questa GPU. La vista PBR resta attiva."
        );
      }
    }
    runtime.current = {
      mode: setQuality,
      reset: () => {
        camera.position.set(0.9, 0.45, 2.25);
        controls.target.set(0, 0, 0);
        controls.update();
        pt?.reset();
      },
      avatar: () => {
        const show = !avatars[0]?.visible;
        avatars.forEach(o => (o.visible = show));
        setAvatar(show);
        sceneReady();
      },
      capture: () => {
        const a = document.createElement("a");
        a.href = renderer.domElement.toDataURL("image/png");
        a.download = "dreamteam-render.png";
        a.click();
      },
    };
    new GLTFLoader().load(
      assetUrl || "/models/dreamteam-jersey.glb",
      async gltf => {
        if (disposed) {
          gltf.scene.traverse(o => {
            if (o instanceof THREE.Mesh) {
              o.geometry.dispose();
              (Array.isArray(o.material) ? o.material : [o.material]).forEach(
                m => m.dispose()
              );
            }
          });
          return;
        }
        meshGroup = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(meshGroup),
          center = bounds.getCenter(new THREE.Vector3());
        meshGroup.position.sub(center);
        meshGroup.rotation.y = 0; // Blender faces -Y; glTF conversion faces -Z, turn it towards the viewer.
        const clothBounds = new THREE.Box3();
        meshGroup.traverse(o => {
          if (o instanceof THREE.Mesh) {
            geometries.push(o.geometry);
            o.castShadow = true;
            o.receiveShadow = true;
            const original = Array.isArray(o.material)
              ? o.material
              : [o.material];
            for (const mat of original) {
              if (mat.name === "Fitting bust") {
                avatars.push(o);
                o.visible = false;
                materials.push(mat);
              } else {
                const role = mat.name;
                const physical = new THREE.MeshPhysicalMaterial({
                  color: 0xffffff,
                  roughness: 0.88,
                  metalness: 0,
                  normalMap: normal,
                  normalScale: new THREE.Vector2(0.06, 0.06),
                  sheen: 0.28,
                  sheenRoughness: 0.85,
                  sheenColor: new THREE.Color("#e4e7ec"),
                  side: THREE.DoubleSide,
                });
                materials.push(physical);
                o.material = physical;
                fabricMeshes.push({ mesh: o, role });
                mat.dispose();
              }
            }
          }
        });
        scene.add(meshGroup);
        await update();
        const cloth = new THREE.Box3();
        for (const { mesh } of fabricMeshes) cloth.expandByObject(mesh);
        const c = cloth.getCenter(new THREE.Vector3());
        controls.target.copy(c);
        floor.position.y = cloth.min.y - 0.05;
        const height = Math.max(cloth.max.y - cloth.min.y, 0.6);
        camera.position.set(
          c.x + height * 1.05,
          c.y + height * 0.38,
          c.z + height * 2.4
        );
        controls.update();
        setStatus("");
        sceneReady();
      },
      undefined,
      () =>
        setError(
          "Modello non disponibile. Carica o simula un capo nel laboratorio DXF."
        )
    );
    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      pt?.updateCamera();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    let notified = 0;
    function animate(now: number) {
      frame = requestAnimationFrame(animate);
      controls.update();
      if (quality === "render" && pt && !moving && now - lastMotion > 250) {
        try {
          pt.renderSample();
          if (now - notified > 500) {
            notified = now;
            setSamples(Math.floor(pt.samples));
            setResolution(`${pt.target.width}×${pt.target.height}`);
          }
        } catch {
          quality = "live";
          setMode("live");
          setError(
            "La GPU non supporta questa scena in path tracing. Vista PBR attiva."
          );
        }
      } else renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      pt?.dispose();
      new Set(textures).forEach(t => t.dispose());
      new Set(materials).forEach(m => m.dispose());
      new Set(geometries).forEach(g => g.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = undefined;
      updateLook.current = undefined;
    };
  }, [assetUrl]);
  return (
    <div className="three-wrap garment-view">
      <div className="render-quality">
        <button
          className={mode === "live" ? "selected" : ""}
          onClick={() => runtime.current?.mode("live")}
        >
          <Box size={13} />
          Live PBR
        </button>
        <button
          className={mode === "render" ? "selected" : ""}
          onClick={() => runtime.current?.mode("render")}
        >
          <ScanLine size={13} />
          Path tracing
        </button>
      </div>
      <div
        ref={host}
        className="three-canvas"
        role="img"
        aria-label="Divisa 3D con materiali tessili"
      />
      {status && !error && (
        <div className="render-loading">
          <Loader2 className="spin" size={19} />
          {status}
        </div>
      )}
      {error && (
        <div className="render-error" role="alert">
          {error}
        </div>
      )}
      <div className="render-tools">
        <button
          title="Reimposta vista"
          aria-label="Reimposta vista"
          onClick={() => runtime.current?.reset()}
        >
          <RotateCcw size={17} />
        </button>
        <button
          className={avatar ? "selected" : ""}
          title="Mostra manichino"
          aria-label="Mostra manichino"
          onClick={() => runtime.current?.avatar()}
        >
          <UserRound size={17} />
        </button>
        <button
          title="Scarica render"
          aria-label="Scarica render"
          onClick={() => runtime.current?.capture()}
        >
          <Download size={17} />
        </button>
        <button
          title="Schermo intero"
          aria-label="Schermo intero"
          onClick={() => host.current?.parentElement?.requestFullscreen()}
        >
          <Maximize2 size={17} />
        </button>
      </div>
      <div className="render-info">
        <span>
          {mode === "render"
            ? `PATH TRACING / ${samples} SAMPLES / ${resolution}`
            : "LIVE / MATERIALI TESSILI"}
        </span>
        <span>
          {assetUrl
            ? "CAPO DA CARTAMODELLO"
            : showroomLabel
              ? "CAPO CAMPIONE / DREAMTEAM"
              : ""}
        </span>
      </div>
      <span className="orbit-hint">
        Trascina per ruotare · Scorri per ingrandire
        {mode === "render"
          ? " · Il render converge quando la vista è ferma"
          : ""}
      </span>
    </div>
  );
}
