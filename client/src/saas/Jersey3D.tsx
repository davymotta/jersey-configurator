import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { artworkSvg, type Design } from "@shared/production";
import { FlatJersey } from "./Preview";
function makeSurface(shape: THREE.Shape, back: boolean) {
  const points = shape.getPoints(16),
    triangles = THREE.ShapeUtils.triangulateShape(points, []),
    positions: number[] = [],
    uv: number[] = [];
  for (const triangle of triangles)
    for (const i of back ? [...triangle].reverse() : triangle) {
      const p = points[i],
        z = (0.07 + 0.07 * Math.cos(p.x * 2)) * (back ? -1 : 1);
      positions.push(p.x, p.y, z);
      uv.push(
        back ? 1 - (p.x + 0.85) / 1.7 : (p.x + 0.85) / 1.7,
        (p.y + 0.85) / 1.85
      );
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}
export default function Jersey3D({
  design,
  imageData,
}: {
  design: Design;
  imageData?: string;
}) {
  const container = useRef<HTMLDivElement>(null),
    [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let disposed = false,
      frame = 0;
    const textures: THREE.Texture[] = [];
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.1, 4.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 2.8;
    controls.maxDistance = 6;
    controls.minPolarAngle = 0.7;
    controls.maxPolarAngle = 2.2;
    controls.target.set(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x748a78, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 4, 5);
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xffffff, 2);
    fill.position.set(-3, 2, -4);
    scene.add(fill);
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.83);
    shape.quadraticCurveTo(0, -0.91, 0.5, -0.83);
    shape.lineTo(0.46, 0.3);
    shape.lineTo(0.66, 0.2);
    shape.lineTo(0.84, 0.58);
    shape.lineTo(0.44, 0.88);
    shape.lineTo(0.2, 0.98);
    shape.quadraticCurveTo(0, 0.77, -0.2, 0.98);
    shape.lineTo(-0.44, 0.88);
    shape.lineTo(-0.84, 0.58);
    shape.lineTo(-0.66, 0.2);
    shape.lineTo(-0.46, 0.3);
    shape.closePath();
    const group = new THREE.Group();
    group.rotation.y = -0.2;
    scene.add(group);
    for (const back of [false, true]) {
      const geometry = makeSurface(shape, back);
      geometries.push(geometry);
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        side: THREE.DoubleSide,
      });
      materials.push(material);
      group.add(new THREE.Mesh(geometry, material));
      const img = new Image();
      img.onload = () => {
        if (disposed) return;
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 2000;
        canvas.getContext("2d")!.drawImage(img, 0, 0, 1200, 2000);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(
          8,
          renderer.capabilities.getMaxAnisotropy()
        );
        textures.push(texture);
        material.map = texture;
        material.needsUpdate = true;
      };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artworkSvg(design, back, imageData))}`;
    }
    const points = shape.getPoints(16),
      vertices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i],
        q = points[(i + 1) % points.length],
        pz = 0.07 + 0.07 * Math.cos(p.x * 2),
        qz = 0.07 + 0.07 * Math.cos(q.x * 2);
      vertices.push(
        p.x,
        p.y,
        pz,
        q.x,
        q.y,
        qz,
        p.x,
        p.y,
        -pz,
        q.x,
        q.y,
        qz,
        q.x,
        q.y,
        -qz,
        p.x,
        p.y,
        -pz
      );
    }
    const sideGeometry = new THREE.BufferGeometry();
    sideGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    sideGeometry.computeVertexNormals();
    geometries.push(sideGeometry);
    const sideMaterial = new THREE.MeshStandardMaterial({
      color: design.primary,
      side: THREE.DoubleSide,
      roughness: 1,
    });
    materials.push(sideMaterial);
    group.add(new THREE.Mesh(sideGeometry, sideMaterial));
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      textures.forEach(t => t.dispose());
      materials.forEach(m => m.dispose());
      geometries.forEach(g => g.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [design, imageData]);
  return (
    <div className="three-wrap">
      <div
        ref={container}
        className="three-canvas"
        role="img"
        aria-label="Anteprima tridimensionale ruotabile della maglia"
      />
      {unavailable && (
        <div className="three-fallback">
          <FlatJersey design={design} imageData={imageData} />
          <p>WebGL non disponibile. Anteprima 2D.</p>
        </div>
      )}
      <span className="orbit-hint">
        Trascina per ruotare · Scorri per ingrandire
      </span>
    </div>
  );
}
