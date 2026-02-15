import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  useGLTF
} from "@react-three/drei";
import { Leva, button, folder, useControls } from "leva";
import SidePanel from "./components/SidePanel";

const GLB_URL =
  "https://raw.githubusercontent.com/rameshjhtpsus/wow/main/Rubix_cube_prototype_pastel.glb";

const PANEL_CONTENT = [
  {
    title: "Product Reel 01",
    url: "https://www.youtube.com/embed/u3l139Txuk4"
  },
  {
    title: "Product Reel 02",
    url: "https://www.youtube.com/embed/hAnTKmmMbXs"
  },
  {
    title: "Product Reel 03",
    url: "https://www.youtube.com/embed/HK683qBU8SU"
  },
  {
    title: "Product Reel 04",
    url: "https://www.youtube.com/embed/8KDBZVTm078"
  }
];

// Wong Kar-wai Effect Component - Frame rate controller with afterimage trails
// Based on: https://github.com/pmndrs/react-three-fiber/discussions/667
function WongKarWaiFrameController({ enabled, fps, trailStrength }) {
  const { gl, scene, camera, advance } = useThree();
  const rafRef = useRef(null);
  const renderTargetRef = useRef(null);
  const afterimageSceneRef = useRef(null);
  const afterimageMaterialRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Set up render target for afterimage effect
    const width = gl.domElement.width;
    const height = gl.domElement.height;

    // Render target stores accumulated LINEAR color values (pre-tone-mapping)
    renderTargetRef.current = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType // Use float to preserve HDR values
    });

    // Blend shader: blends current frame with previous in LINEAR space
    const blendMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tPrevious: { value: renderTargetRef.current.texture },
        trailStrength: { value: trailStrength }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tPrevious;
        uniform float trailStrength;
        varying vec2 vUv;

        void main() {
          vec4 current = texture2D(tDiffuse, vUv);
          vec4 previous = texture2D(tPrevious, vUv);

          // Blend in LINEAR space (no tone mapping yet)
          gl_FragColor = mix(current, previous, trailStrength);
        }
      `
    });

    // Display shader: applies tone mapping and color space conversion for final display
    afterimageMaterialRef.current = new THREE.ShaderMaterial({
      uniforms: {
        tAccumulated: { value: renderTargetRef.current.texture }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tAccumulated;
        varying vec2 vUv;

        // ACES Filmic Tone Mapping
        vec3 applyACESToneMapping(vec3 color) {
          const mat3 ACESInputMat = mat3(
            vec3(0.59719, 0.35458, 0.04823),
            vec3(0.07600, 0.90834, 0.01566),
            vec3(0.02840, 0.13383, 0.83777)
          );
          const mat3 ACESOutputMat = mat3(
            vec3( 1.60475, -0.53108, -0.07367),
            vec3(-0.10208,  1.10813, -0.00605),
            vec3(-0.00327, -0.07276,  1.07602)
          );
          color = ACESInputMat * color;
          vec3 a = color * (color + 0.0245786) - 0.000090537;
          vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
          color = a / b;
          color = ACESOutputMat * color;
          return clamp(color, 0.0, 1.0);
        }

        // Linear to sRGB conversion
        vec3 linearTosRGB(vec3 color) {
          return pow(color, vec3(1.0 / 2.2));
        }

        void main() {
          vec4 accumulated = texture2D(tAccumulated, vUv);

          // Apply tone mapping to the accumulated result
          accumulated.rgb = applyACESToneMapping(accumulated.rgb);

          // Convert to sRGB color space for display
          accumulated.rgb = linearTosRGB(accumulated.rgb);

          gl_FragColor = accumulated;
        }
      `
    });

    // Scene for blending pass
    const blendScene = new THREE.Scene();
    const blendMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blendMaterial);
    blendScene.add(blendMesh);

    // Create fullscreen quad for afterimage
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, afterimageMaterialRef.current);
    afterimageSceneRef.current = new THREE.Scene();
    afterimageSceneRef.current.add(mesh);

    let elapsed = 0;
    let then = 0;
    const interval = 1000 / fps;
    const tempTarget = new THREE.WebGLRenderTarget(width, height);

    // Create orthographic camera for fullscreen quad
    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    function tick(now) {
      rafRef.current = requestAnimationFrame(tick);
      elapsed = now - then;

      if (elapsed > interval) {
        // CRITICAL: Call advance() to trigger all useFrame hooks (Animator, etc.)
        // This ensures animations continue to work when frameloop="never"
        advance(now / 1000); // advance expects time in seconds

        // Update trail strength in blend material
        blendMaterial.uniforms.trailStrength.value = trailStrength;

        // STEP 1: Render main scene to temp target (LINEAR HDR values, no tone mapping)
        gl.setRenderTarget(tempTarget);
        gl.clear();
        gl.render(scene, camera);

        // STEP 2: Blend current frame with previous accumulated frame (in LINEAR space)
        blendMaterial.uniforms.tDiffuse.value = tempTarget.texture;
        blendMaterial.uniforms.tPrevious.value = renderTargetRef.current.texture;

        // Create a swap target to avoid reading and writing to the same render target
        const swapTarget = new THREE.WebGLRenderTarget(width, height, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.FloatType
        });

        gl.setRenderTarget(swapTarget);
        gl.clear();
        gl.render(blendScene, orthoCamera);

        // Swap render targets
        const temp = renderTargetRef.current;
        renderTargetRef.current = swapTarget;
        temp.dispose();

        // STEP 3: Apply tone mapping and render to screen
        afterimageMaterialRef.current.uniforms.tAccumulated.value = renderTargetRef.current.texture;

        gl.setRenderTarget(null);
        gl.clear();
        gl.render(afterimageSceneRef.current, orthoCamera);

        then = now - (elapsed % interval);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (tempTarget) {
        tempTarget.dispose();
      }
      if (renderTargetRef.current) {
        renderTargetRef.current.dispose();
      }
      if (blendMaterial) {
        blendMaterial.dispose();
      }
      if (afterimageMaterialRef.current) {
        afterimageMaterialRef.current.dispose();
      }
    };
  }, [enabled, fps, trailStrength, gl, scene, camera]);

  return null;
}

const cubeNames = [
  "btm_block_1", "btm_block_2", "btm_block_3", "btm_block_4", "btm_block_5", "btm_block_6", "btm_block_7", "btm_block_8", "btm_block_9",
  "mid_block_1", "mid_block_2", "mid_block_3", "mid_block_4", "mid_block_5", "mid_block_6", "mid_block_7", "mid_block_8", "mid_block_9",
  "top_block_1", "top_block_2", "top_block_3", "top_block_4", "top_block_5", "top_block_6", "top_block_7", "top_block_8", "top_block_9"
];

const SELECTED_CUBE_SCALE = 1.28;
const SELECTED_CUBE_BOUNCE = 1.38;
const DIMMED_CUBE_SCALE = 0.82;
const DIMMED_CUBE_BOUNCE = 0.76;
const DIMMED_FACE_OPACITY = 0.15;
const CLICK_DRAG_THRESHOLD_PX = 8;
const TOUCH_DRAG_THRESHOLD_PX = 22;
const CLICK_INTERACTION_FOV = 26;
const MIN_CLICK_PRESS_MS = 30;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t, amplitude = 0.36) {
  const c1 = 1.70158 * amplitude;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function normalizeAngle0ToTau(angle) {
  const tau = Math.PI * 2;
  return ((angle % tau) + tau) % tau;
}

function normalizeAngleMinusPiToPi(angle) {
  const tau = Math.PI * 2;
  return ((angle + Math.PI) % tau + tau) % tau - Math.PI;
}

function shortestAngleDelta(from, to) {
  const tau = Math.PI * 2;
  const a = normalizeAngle0ToTau(from);
  const b = normalizeAngle0ToTau(to);
  let d = b - a;
  if (d > Math.PI) d -= tau;
  if (d < -Math.PI) d += tau;
  return d;
}

function CameraRig({ controlsRef, values }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.fov = values.cameraProfile === "BabylonOriginal" ? values.babylonFov : values.cameraFov;
    camera.near = values.cameraNear;
    camera.far = values.cameraFar;
    camera.updateProjectionMatrix();
  }, [camera, values.babylonFov, values.cameraFar, values.cameraFov, values.cameraNear, values.cameraProfile]);

  useEffect(() => {
    // Keep the camera at a controlled spherical orbit for repeatable shots.
    if (!values.lockCameraToLeva) return;
    const target = new THREE.Vector3(values.targetX, values.targetY, values.targetZ);
    const spherical = new THREE.Spherical(
      values.cameraDistance,
      values.cameraPolar,
      values.cameraAzimuth
    );
    const offset = new THREE.Vector3().setFromSpherical(spherical);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);

    if (controlsRef.current) {
      controlsRef.current.target.copy(target);
      controlsRef.current.update();
    }
  }, [
    camera,
    controlsRef,
    values.lockCameraToLeva,
    values.cameraAzimuth,
    values.cameraDistance,
    values.cameraPolar,
    values.targetX,
    values.targetY,
    values.targetZ
  ]);

  return null;
}

function Animator({ controlsRef, animRef, onCameraAnimEnd, onCameraTweenDone }) {
  const { camera } = useThree();

  useFrame(() => {
    const now = performance.now();

    // Opacity tweens
    animRef.current.opacity.forEach((tw, id) => {
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      const e = easeInOutCubic(t);
      tw.material.opacity = tw.from + (tw.to - tw.from) * e;
      if (t >= 1) animRef.current.opacity.delete(id);
    });

    // Scale tweens
    animRef.current.scale.forEach((tw, id) => {
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      const midT = 0.55;
      let s = tw.to;
      if (t < midT) {
        const e = easeInOutCubic(t / midT);
        s = tw.from + (tw.bounce - tw.from) * e;
      } else {
        const e = easeInOutCubic((t - midT) / (1 - midT));
        s = tw.bounce + (tw.to - tw.bounce) * e;
      }
      tw.obj.scale.setScalar(s);
      if (t >= 1) animRef.current.scale.delete(id);
    });

    // Center intro tween
    if (animRef.current.center) {
      const tw = animRef.current.center;
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      const eRot = easeOutCubic(t);
      const ePos = easeOutBack(t, tw.amplitude);
      tw.obj.position.x = tw.fromX + (tw.toX - tw.fromX) * ePos;
      tw.obj.rotation.y = tw.fromRotY + (tw.toRotY - tw.fromRotY) * eRot;
      if (t >= 1) animRef.current.center = null;
    }

    // Camera tween
    if (animRef.current.camera) {
      const tw = animRef.current.camera;
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      const e = easeInOutCubic(t);
      const az = tw.fromAz + tw.dAz * e;
      const pol = tw.fromPol + (tw.toPol - tw.fromPol) * e;
      // Let the dolly lead slightly so the zoom is noticeable while turning.
      const eDist = easeInOutCubic(Math.min(1, t * 1.12));
      const dist = tw.fromDist + (tw.toDist - tw.fromDist) * eDist;
      const target = tw.target;

      const spherical = new THREE.Spherical(dist, pol, az);
      const offset = new THREE.Vector3().setFromSpherical(spherical);
      camera.position.copy(target).add(offset);
      camera.lookAt(target);

      // Zoom animation is driven by FOV so it can be strong even if distance changes are subtle.
      if (typeof tw.fromFov === "number" && typeof tw.toFov === "number") {
        camera.fov = tw.fromFov + (tw.toFov - tw.fromFov) * eDist;
        camera.updateProjectionMatrix();
      }

      if (controlsRef.current) {
        controlsRef.current.target.copy(target);
        controlsRef.current.update();
      }

      if (t >= 1) {
        animRef.current.camera = null;
        if (controlsRef.current) {
          if (tw.lockDistanceAtEnd) {
            controlsRef.current.minDistance = dist;
            controlsRef.current.maxDistance = dist;
          }
          controlsRef.current.enabled = true;
          controlsRef.current.update();
        }
        if (typeof onCameraTweenDone === "function") onCameraTweenDone();
        if (typeof onCameraAnimEnd === "function") onCameraAnimEnd({ azimuth: az, polar: pol, distance: dist, target });
      }
    }
  });

  return null;
}

function StudioLights({ values }) {
  const keyRef = useRef();
  const fillRef = useRef();

  useEffect(() => {
    const target = new THREE.Vector3(values.targetX, values.targetY, values.targetZ);
    if (keyRef.current) keyRef.current.target.position.copy(target);
    if (fillRef.current) fillRef.current.target.position.copy(target);
  }, [values.targetX, values.targetY, values.targetZ]);

  return (
    <>
      <ambientLight intensity={values.ambientIntensity} color={values.ambientColor} />

      <directionalLight
        ref={keyRef}
        castShadow
        intensity={values.keyIntensity}
        color={values.keyColor}
        position={[values.keyX, values.keyY, values.keyZ]}
        shadow-mapSize={[values.shadowMapSize, values.shadowMapSize]}
        shadow-bias={values.shadowBias}
        shadow-normalBias={values.shadowNormalBias}
      />

      <spotLight
        ref={fillRef}
        intensity={values.fillIntensity}
        color={values.fillColor}
        position={[values.fillX, values.fillY, values.fillZ]}
        angle={values.fillAngle}
        penumbra={values.fillPenumbra}
      />

      <Environment resolution={values.envResolution}>
        <Lightformer
          intensity={values.warmSoftboxIntensity}
          color={values.warmSoftboxColor}
          position={[values.warmSoftboxX, values.warmSoftboxY, values.warmSoftboxZ]}
          scale={[values.warmSoftboxScaleX, values.warmSoftboxScaleY, 1]}
        />
        <Lightformer
          intensity={values.coolSoftboxIntensity}
          color={values.coolSoftboxColor}
          position={[values.coolSoftboxX, values.coolSoftboxY, values.coolSoftboxZ]}
          scale={[values.coolSoftboxScaleX, values.coolSoftboxScaleY, 1]}
        />
      </Environment>
    </>
  );
}

function BabylonConstraints({ controlsRef, values }) {
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    if (values.cameraProfile !== "BabylonOriginal" && values.cameraMode !== "Babylon") return;

    // Match the original behavior: no zoom, fixed radius (distance).
    c.minDistance = values.cameraDistance;
    c.maxDistance = values.cameraDistance;

    // Match the original vertical limits (approx).
    c.minPolarAngle = 0.5;
    c.maxPolarAngle = 2.64;
    c.update();
  }, [controlsRef, values.cameraDistance, values.cameraMode, values.cameraProfile]);

  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    if (values.cameraMode !== "Free" && values.cameraProfile === "BabylonOriginal") return;

    // Free mode: allow some range.
    c.minDistance = 5;
    c.maxDistance = 120;
    c.minPolarAngle = 0.2;
    c.maxPolarAngle = Math.PI - 0.2;
    c.update();
  }, [controlsRef, values.cameraMode]);

  return null;
}

function Model({ values, onReady, onPointerDown, onPointerMove, onPointerUp }) {
  const { scene } = useGLTF(GLB_URL);
  const root = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    if (typeof onReady === "function") onReady(root);
  }, [onReady, root]);

  useEffect(() => {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = values.castShadows;
      obj.receiveShadow = values.receiveShadows;
      if (obj.material) {
        // Slightly more "C4D polished plastic" baseline.
        if ("metalness" in obj.material) obj.material.metalness = values.baseMetalness;
        if ("roughness" in obj.material) obj.material.roughness = values.baseRoughness;
        obj.material.needsUpdate = true;
      }
    });
  }, [root, values.baseMetalness, values.baseRoughness, values.castShadows, values.receiveShadows]);

  return <primitive object={root} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />;
}

export default function App() {
  const controlsRef = useRef();
  const cameraRef = useRef();
  const modelRef = useRef();
  const modelCenterRef = useRef(new THREE.Vector3(0, 0, 0));
  const modelSizeRef = useRef(10);
  const didSetupRef = useRef(false);
  const [isCameraAnimating, setIsCameraAnimating] = useState(false);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [isPanelDemoRunning, setIsPanelDemoRunning] = useState(false);
  const [selectedCubeName, setSelectedCubeName] = useState(null);
  const selectedCubeNameRef = useRef(null);
  const [demoCursor, setDemoCursor] = useState({ visible: false, x: 0, y: 0, pulse: 0, label: "" });
  const isGuidedRunning = isDemoRunning || isPanelDemoRunning;
  const [panelState, setPanelState] = useState({
    primary: null,
    secondary: null
  });
  const defaultPoseRef = useRef({ azimuth: -2.983, polar: 2.051, distance: 20 });
  const levaActionsRef = useRef({
    captureFromOrbit: () => {},
    replayIntro: () => {}
  });
  const interactionRef = useRef({
    cubesByName: new Map(),
    cubeFacesByName: new Map(),
    allFaceMeshes: [],
    faceMeshUUIDs: new Set(),
    bodyMaterialUUIDs: new Set(),
    currentlyExpandedCubeName: null,
    currentlyClickedFace: null
  });
  const pointerDownRef = useRef({
    active: false,
    pointerId: null,
    x: 0,
    y: 0,
    downAt: -1,
    maxFromStart: 0,
    startAzimuth: null,
    startPolar: null,
    startDistance: null
  });
  const lastPointerUpRef = useRef({
    pointerId: null,
    timeStamp: -1
  });
  const lastResolvedTapRef = useRef({
    time: -1,
    x: null,
    y: null,
    pointerType: null,
    faceUuid: null
  });
  const lastSelectionAtRef = useRef(-1);
  const suppressOrbitSyncUntilRef = useRef(0);
  const panelContentRef = useRef(new Map());
  const panelSlotRef = useRef(0);

  const animRef = useRef({
    opacity: new Map(),
    scale: new Map(),
    camera: null,
    center: null
  });
  const cameraAnimLockRef = useRef(false);

  const timerRef = useRef({ id: null, active: false });

  const [values, setValues] = useControls(
    () => ({
      Background: folder({
        background: { value: "#050505" }
      }),
      Camera: folder({
        cameraProfile: { value: "Cinematic", options: ["Cinematic", "BabylonOriginal"] },
        lockCameraToLeva: { value: true },
        cameraDistance: { value: 20, min: 5, max: 150, step: 0.1 },
        cameraFov: { value: 45, min: 8, max: 75, step: 0.1 },
        cameraNear: { value: 0.1, min: 0.01, max: 1, step: 0.01 },
        cameraFar: { value: 200, min: 50, max: 600, step: 1 },
        // Default intro pose tuned for a strong key light angle (adjust as needed, then use "captureFromOrbit").
        cameraAzimuth: { value: -2.983, min: -Math.PI, max: Math.PI, step: 0.001 },
        cameraPolar: { value: 2.051, min: 0.2, max: Math.PI - 0.2, step: 0.001 },
        targetX: { value: -0.2, min: -10, max: 10, step: 0.01 },
        targetY: { value: 0, min: -10, max: 10, step: 0.01 },
        targetZ: { value: -0.8, min: -10, max: 10, step: 0.01 },
        presetYawOffset: { value: 0, min: -Math.PI, max: Math.PI, step: 0.001 },
        presetPolarOffset: { value: 0, min: -1, max: 1, step: 0.001 },
        babylonFov: { value: 55, min: 20, max: 80, step: 0.1 },
        babylonClickDistance: { value: 18.0, min: 5, max: 150, step: 0.1 },
        captureFromOrbit: button(() => levaActionsRef.current.captureFromOrbit())
      }),
      Controls: folder({
        cameraMode: { value: "Babylon", options: ["Babylon", "Free"] },
        syncLevaFromOrbit: { value: true },
        lockTargetToModelCenter: { value: true },
        enableRotate: { value: true },
        enableZoom: { value: true },
        enablePan: { value: false }
      }),
      Lights: folder({
        ambientIntensity: { value: 0.4, min: 0, max: 2, step: 0.01 },
        ambientColor: { value: "#ffffff" },

        keyIntensity: { value: 2.4, min: 0, max: 10, step: 0.01 },
        keyColor: { value: "#ff6400" },
        keyX: { value: 3, min: -20, max: 20, step: 0.01 },
        keyY: { value: 4, min: -20, max: 20, step: 0.01 },
        keyZ: { value: 2, min: -20, max: 20, step: 0.01 },

        fillIntensity: { value: 1.0, min: 0, max: 10, step: 0.01 },
        fillColor: { value: "#ffffff" },
        fillX: { value: -3, min: -20, max: 20, step: 0.01 },
        fillY: { value: 3, min: -20, max: 20, step: 0.01 },
        fillZ: { value: 2, min: -20, max: 20, step: 0.01 },
        fillAngle: { value: 0.45, min: 0.05, max: 1.2, step: 0.001 },
        fillPenumbra: { value: 0.56, min: 0, max: 1, step: 0.01 },

        envResolution: { value: 256, options: { 128: 128, 256: 256, 512: 512 } },
        warmSoftboxIntensity: { value: 11.0, min: 0, max: 20, step: 0.01 },
        warmSoftboxColor: { value: "#ff6400" },
        warmSoftboxX: { value: 4.02, min: -20, max: 20, step: 0.01 },
        warmSoftboxY: { value: 4.00, min: -20, max: 20, step: 0.01 },
        warmSoftboxZ: { value: 0, min: -20, max: 20, step: 0.01 },
        warmSoftboxScaleX: { value: 5.13, min: 0.1, max: 20, step: 0.01 },
        warmSoftboxScaleY: { value: 6, min: 0.1, max: 20, step: 0.01 },

        coolSoftboxIntensity: { value: 1.6, min: 0, max: 20, step: 0.01 },
        coolSoftboxColor: { value: "#95a3b6" },
        coolSoftboxX: { value: -4, min: -20, max: 20, step: 0.01 },
        coolSoftboxY: { value: 3, min: -20, max: 20, step: 0.01 },
        coolSoftboxZ: { value: -2, min: -20, max: 20, step: 0.01 },
        coolSoftboxScaleX: { value: 8.65, min: 0.1, max: 20, step: 0.01 },
        coolSoftboxScaleY: { value: 4, min: 0.1, max: 20, step: 0.01 },

        shadowMapSize: { value: 4096, options: { 1024: 1024, 2048: 2048, 4096: 4096 } },
        shadowBias: { value: -0.0, min: -0.01, max: 0.01, step: 0.00001 },
        shadowNormalBias: { value: 0.02, min: 0, max: 0.2, step: 0.001 }
      }),
      Materials: folder({
        baseMetalness: { value: 0.44, min: 0, max: 1, step: 0.01 },
        baseRoughness: { value: 0.16, min: 0, max: 1, step: 0.01 }
      }),
      Shadows: folder({
        castShadows: { value: true },
        receiveShadows: { value: true },
        contactOpacity: { value: 0.4, min: 0, max: 1, step: 0.01 },
        contactBlur: { value: 2.2, min: 0, max: 10, step: 0.01 },
        contactScale: { value: 12, min: 1, max: 50, step: 0.1 },
        contactY: { value: -0.85, min: -10, max: 10, step: 0.01 }
      }),
      Motion: folder({
        autoRotate: { value: true },
        autoRotateSpeed: { value: 0.15, min: 0, max: 2, step: 0.01 }
      }),
      Intro: folder({
        playIntro: { value: true },
        introFaceFadeMs: { value: 3170, min: 0, max: 8000, step: 10 },
        introCenterMs: { value: 3200, min: 0, max: 8000, step: 10 },
        introBackEase: { value: 0.92, min: 0, max: 2, step: 0.01 },
        introSpinTurns: { value: 8.3, min: 0, max: 12, step: 0.1 },
        replayIntro: button(() => levaActionsRef.current.replayIntro())
      }),
      Glow: folder({
        glowColor: { value: "#ff6400" },
        glowIntensity: { value: 1.2, min: 0, max: 3, step: 0.1 },
        bloomIntensity: { value: 1.5, min: 0, max: 5, step: 0.1 },
        bloomThreshold: { value: 0.2, min: 0, max: 1, step: 0.01 },
        bloomSmoothing: { value: 0.9, min: 0, max: 1, step: 0.01 }
      }),
      "Wong Kar-wai": folder({
        wkwEnabled: { value: false, label: "Enable Effect" },
        wkwFps: { value: 15, min: 6, max: 60, step: 1, label: "FPS (Choppiness)" },
        wkwTrails: { value: 0.85, min: 0, max: 0.95, step: 0.05, label: "Afterimage Trails" }
      }),
      Blur: folder({
        blurAmount: { value: 0, min: 0, max: 20, step: 0.5, label: "Blur Amount (px)" }
      })
    }),
    []
  );

  // Late-bind Leva button callbacks to avoid TDZ issues during `useControls` evaluation.
  useEffect(() => {
    levaActionsRef.current.captureFromOrbit = () => {
      const c = controlsRef.current;
      if (!c) return;
      const nextPose = {
        cameraAzimuth: c.getAzimuthalAngle(),
        cameraPolar: c.getPolarAngle(),
        cameraDistance: c.getDistance(),
        targetX: c.target.x,
        targetY: c.target.y,
        targetZ: c.target.z
      };
      setValues(nextPose);
      defaultPoseRef.current = {
        azimuth: nextPose.cameraAzimuth,
        polar: nextPose.cameraPolar,
        distance: nextPose.cameraDistance
      };
    };
  }, [setValues]);


  const prepareFaceForFade = useCallback((mesh) => {
    if (!mesh || !mesh.material) return;
    if (mesh.userData.__fadePrepared) return;
    mesh.material = mesh.material.clone();
    mesh.material.transparent = true;
    mesh.material.opacity = 1.0;
    mesh.material.depthWrite = false;
    // Prepare for emissive glow
    if (!mesh.material.emissive) mesh.material.emissive = new THREE.Color(0x000000);
    mesh.material.emissiveIntensity = 0;
    mesh.userData.__fadePrepared = true;
  }, []);

  const animateOpacity = useCallback((mesh, to, dur = 250) => {
    if (!mesh || !mesh.material) return;
    prepareFaceForFade(mesh);
    const id = mesh.uuid;
    animRef.current.opacity.set(id, {
      material: mesh.material,
      from: mesh.material.opacity,
      to,
      t0: performance.now(),
      dur
    });
  }, [prepareFaceForFade]);

  const animateScale = useCallback((obj, to, bounce, dur = 260) => {
    if (!obj) return;
    const id = obj.uuid;
    animRef.current.scale.set(id, {
      obj,
      from: obj.scale.x,
      bounce,
      to,
      t0: performance.now(),
      dur
    });
  }, []);

  const setFaceGlow = useCallback((mesh) => {
    if (!mesh || !mesh.material) return;
    prepareFaceForFade(mesh);
    // Set emissive properties for glow
    mesh.material.emissive.set(values.glowColor);
    mesh.material.emissiveIntensity = values.glowIntensity;
    // Enable bloom layer (layer 1)
    mesh.layers.enable(1);
  }, [prepareFaceForFade, values.glowColor, values.glowIntensity]);

  const removeFaceGlow = useCallback((mesh) => {
    if (!mesh || !mesh.material) return;
    // Remove emissive glow
    mesh.material.emissive.set(0x000000);
    mesh.material.emissiveIntensity = 0;
    // Disable bloom layer
    mesh.layers.disable(1);
  }, []);

  const getContentForFace = useCallback((face) => {
    if (!face) return PANEL_CONTENT[0];
    const map = panelContentRef.current;
    let slot = map.get(face.uuid);
    if (slot === undefined) {
      slot = panelSlotRef.current % PANEL_CONTENT.length;
      panelSlotRef.current = (panelSlotRef.current + 1) % PANEL_CONTENT.length;
      map.set(face.uuid, slot);
    }
    return PANEL_CONTENT[slot] || PANEL_CONTENT[0];
  }, []);

  const buildPanelData = useCallback((face) => {
    const content = getContentForFace(face);
    return {
      id: face?.uuid || `face-${Date.now()}`,
      title: content.title,
      iframeUrl: content.url,
      faceUuid: face?.uuid || null
    };
  }, [getContentForFace]);

  const clearPanels = useCallback(() => {
    setPanelState({ primary: null, secondary: null });
  }, []);

  const focusPanelForFace = useCallback((face) => {
    const next = buildPanelData(face);
    setPanelState((prev) => {
      if (!prev.primary) return { primary: next, secondary: null };
      if (prev.primary.faceUuid === next.faceUuid) return prev;
      return { primary: next, secondary: prev.primary };
    });
  }, [buildPanelData]);

  const swapPanels = useCallback(() => {
    setPanelState((prev) => {
      if (!prev.primary || !prev.secondary) return prev;
      return { primary: prev.secondary, secondary: prev.primary };
    });
  }, []);

  const resetAllCubes = useCallback((closePanelsToo = false) => {
    interactionRef.current.cubesByName.forEach((cube) => {
      animateScale(cube, 1.0, 0.8);
    });
    interactionRef.current.allFaceMeshes.forEach((face) => {
      animateOpacity(face, 1.0);
      removeFaceGlow(face);
    });
    if (closePanelsToo) {
      clearPanels();
    }
  }, [animateOpacity, animateScale, clearPanels, removeFaceGlow]);

  const animateCameraToPreset = useCallback((to, durationMs = 900, options = {}) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const fromAz = controls.getAzimuthalAngle();
    const fromPol = controls.getPolarAngle();
    const fromDist = controls.getDistance();
    const fromFov = controls.object?.fov;
    const toFov =
      typeof options.toFov === "number" && Number.isFinite(options.toFov) ? options.toFov : null;

    const forceCenter = values.lockTargetToModelCenter || values.cameraProfile === "BabylonOriginal";
    const target = forceCenter ? modelCenterRef.current.clone() : controls.target.clone();
    if (values.lockTargetToModelCenter) {
      controls.target.copy(target);
      if (values.syncLevaFromOrbit) {
        setValues({ targetX: target.x, targetY: target.y, targetZ: target.z });
      }
    }

    const lockDistanceAtEnd = values.cameraMode === "Babylon" || values.cameraProfile === "BabylonOriginal";
    // Allow dolly/zoom to animate while turning by temporarily widening distance limits during the tween.
    // If we clamp to the final distance immediately, OrbitControls will snap to it and you won't see a smooth zoom.
    if (lockDistanceAtEnd) {
      const minD = Math.min(fromDist, to.distance);
      const maxD = Math.max(fromDist, to.distance);
      controls.minDistance = minD;
      controls.maxDistance = maxD;
    }
    cameraAnimLockRef.current = true;
    controls.enabled = false;
    setIsCameraAnimating(true);

    animRef.current.camera = {
      t0: performance.now(),
      dur: durationMs,
      fromAz,
      dAz: shortestAngleDelta(fromAz, to.azimuth),
      fromPol,
      toPol: to.polar,
      fromDist,
      toDist: to.distance,
      target,
      lockDistanceAtEnd,
      fromFov: typeof fromFov === "number" ? fromFov : null,
      toFov: toFov ?? (typeof fromFov === "number" ? fromFov : null)
    };
  }, [setValues, setIsCameraAnimating, values.cameraMode, values.cameraProfile, values.lockTargetToModelCenter, values.syncLevaFromOrbit]);

  const resetTimer = useCallback(() => {
    if (!timerRef.current.active) return;
    clearTimeout(timerRef.current.id);
    timerRef.current.active = false;
  }, []);

  const returnToDefault = useCallback(() => {
    animateCameraToPreset(defaultPoseRef.current, 900, { toFov: values.cameraFov });
    resetAllCubes(true);
    interactionRef.current.currentlyExpandedCubeName = null;
    interactionRef.current.currentlyClickedFace = null;
    selectedCubeNameRef.current = null;
    setSelectedCubeName(null);
    lastSelectionAtRef.current = -1;
  }, [animateCameraToPreset, resetAllCubes, values.cameraFov]);

  const startTimer = useCallback(() => {
    if (timerRef.current.active) return;
    timerRef.current.active = true;
    timerRef.current.id = setTimeout(() => {
      returnToDefault();
      timerRef.current.active = false;
    }, 30000);
  }, [returnToDefault]);

  const onInteraction = useCallback(() => {
    if (isGuidedRunning) return;
    resetTimer();
    startTimer();
  }, [isGuidedRunning, resetTimer, startTimer]);

  const handlePanelClose = useCallback(() => {
    if (isDemoRunning) return;
    onInteraction();
    returnToDefault();
  }, [isDemoRunning, onInteraction, returnToDefault]);

  const onCameraAnimEnd = useCallback(
    ({ azimuth, polar, distance, target }) => {
      // Update Leva so the UI reflects click-driven camera moves.
      setValues({
        cameraAzimuth: normalizeAngleMinusPiToPi(azimuth),
        cameraPolar: polar,
        cameraDistance: distance,
        targetX: target.x,
        targetY: target.y,
        targetZ: target.z
      });
    },
    [setValues]
  );

  const onCameraTweenDone = useCallback(() => {
    cameraAnimLockRef.current = false;
    setIsCameraAnimating(false);
  }, []);

  const getCameraPoseForFace = useCallback((name) => {
    const second = (name || "").charAt(1);
    let alpha, beta;
    if (second === "1") {
      alpha = Math.PI / -2.7;
      beta = 1.5628;
    } else if (second === "2") {
      alpha = Math.PI / -1.1;
      beta = 1.5096;
    } else if (second === "3") {
      alpha = (2 * Math.PI) / 3.2;
      beta = 1.5352;
    } else if (second === "4") {
      alpha = Math.PI / 7;
      beta = 1.5638;
    } else if (second === "b") {
      alpha = 1.5 * Math.PI - 0.2;
      beta = Math.PI - 0.5;
    } else {
      alpha = 1.5 * Math.PI + 0.3;
      beta = 0.3;
    }

    const azimuth = normalizeAngleMinusPiToPi(Math.PI / 2 - alpha + values.presetYawOffset);
    const polar = beta + values.presetPolarOffset;
    const distance = values.cameraProfile === "BabylonOriginal" ? values.babylonClickDistance : values.cameraDistance;
    return { azimuth, polar, distance };
  }, [values.babylonClickDistance, values.cameraDistance, values.cameraProfile, values.presetPolarOffset, values.presetYawOffset]);

  const getCameraPoseForMesh = useCallback(
    (mesh, distanceOverride) => {
      const controls = controlsRef.current;
      const forceCenter = values.lockTargetToModelCenter || values.cameraProfile === "BabylonOriginal";
      const target = forceCenter
        ? modelCenterRef.current.clone()
        : (controls?.target ? controls.target.clone() : modelCenterRef.current.clone());

      const distance =
        typeof distanceOverride === "number"
          ? distanceOverride
          : (values.cameraProfile === "BabylonOriginal" ? values.babylonClickDistance : values.cameraDistance);
      const worldPos = new THREE.Vector3();
      mesh?.getWorldPosition?.(worldPos);
      const dir = worldPos.sub(target);
      if (dir.lengthSq() < 1e-8) return getCameraPoseForFace(mesh?.name);

      dir.normalize().multiplyScalar(distance);
      const spherical = new THREE.Spherical().setFromVector3(dir);

      const azimuth = normalizeAngleMinusPiToPi(spherical.theta + values.presetYawOffset);
      const polar = clamp(spherical.phi + values.presetPolarOffset, 0.001, Math.PI - 0.001);
      return { azimuth, polar, distance };
    },
    [
      getCameraPoseForFace,
      values.babylonClickDistance,
      values.cameraDistance,
      values.cameraProfile,
      values.lockTargetToModelCenter,
      values.presetPolarOffset,
      values.presetYawOffset
    ]
  );

  const introSettingsRef = useRef({ play: true, faceMs: 900, centerMs: 1400, backEase: 0.36, spinTurns: 4 });
  useEffect(() => {
    introSettingsRef.current = {
      play: values.playIntro,
      faceMs: values.introFaceFadeMs,
      centerMs: values.introCenterMs,
      backEase: values.introBackEase,
      spinTurns: values.introSpinTurns
    };
  }, [values.introBackEase, values.introCenterMs, values.introFaceFadeMs, values.introSpinTurns, values.playIntro]);

  const playIntroNow = useCallback(() => {
    const root = modelRef.current;
    if (!root) return;

    const intro = introSettingsRef.current;
    const allFaces = interactionRef.current.allFaceMeshes;

    const now = performance.now();
    allFaces.forEach((face) => {
      prepareFaceForFade(face);
      face.material.opacity = 0;
      animRef.current.opacity.set(face.uuid, {
        material: face.material,
        from: 0,
        to: 1,
        t0: now,
        dur: intro.faceMs
      });
    });

    const center = root.getObjectByName("Center");
    if (center) {
      const originalPosition = new THREE.Vector3(0.055, 3.046, 0.05);
      const originalRotation = new THREE.Euler(
        THREE.MathUtils.degToRad(88.27),
        THREE.MathUtils.degToRad(576.34),
        THREE.MathUtils.degToRad(125.93)
      );
      // Original feel: slide in from the side with a BackEase "boomerang" settle.
      center.position.copy(originalPosition).add(new THREE.Vector3(150, 0, 0));
      center.rotation.copy(originalRotation);
      animRef.current.center = {
        obj: center,
        fromX: center.position.x,
        toX: originalPosition.x,
        fromRotY: originalRotation.y,
        toRotY: originalRotation.y + intro.spinTurns * Math.PI * 2,
        amplitude: intro.backEase,
        t0: now,
        dur: intro.centerMs
      };
    }
  }, [prepareFaceForFade]);

  useEffect(() => {
    levaActionsRef.current.replayIntro = () => playIntroNow();
  }, [playIntroNow]);

  const onModelReady = useCallback(
    (root) => {
      if (didSetupRef.current) return;
      didSetupRef.current = true;
      modelRef.current = root;

      // Compute model center once (used for Babylon-like target lock + camera moves).
      const box = new THREE.Box3().setFromObject(root);
      box.getCenter(modelCenterRef.current);
      const size = box.getSize(new THREE.Vector3());
      modelSizeRef.current = Math.max(1, size.length());
      if (values.lockTargetToModelCenter) {
        setValues({
          targetX: modelCenterRef.current.x,
          targetY: modelCenterRef.current.y,
          targetZ: modelCenterRef.current.z
        });
      }

      // Build cube lookup
      const cubesByName = new Map();
      cubeNames.forEach((n) => {
        const cube = root.getObjectByName(n);
        if (cube) cubesByName.set(n, cube);
      });

      // Determine material UUIDs that appear somewhere in EVERY cube hierarchy.
      const collectMaterialUUIDs = (cube) => {
        const ids = new Set();
        cube.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m && ids.add(m.uuid));
        });
        return ids;
      };

      const cubes = Array.from(cubesByName.values());
      const common = cubes.length ? collectMaterialUUIDs(cubes[0]) : new Set();
      for (let i = 1; i < cubes.length; i++) {
        const ids = collectMaterialUUIDs(cubes[i]);
        for (const id of common) if (!ids.has(id)) common.delete(id);
      }

      // Determine which of the "common across all cubes" materials are actually the cube BODY.
      // Note: some assets reuse sticker/face materials across all cubes too, so "common" can include
      // face materials. We therefore use a heuristic to pick the most likely dark/plastic body material(s).
      const materialByUUID = new Map();
      root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m) return;
          materialByUUID.set(m.uuid, m);
        });
      });

      const commonMaterials = Array.from(common)
        .map((id) => materialByUUID.get(id))
        .filter(Boolean);

      const materialLuma = (m) => {
        const c = m?.color;
        if (!c || typeof c.r !== "number") return 1;
        return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      };

      const looksLikeBodyByName = (m) => {
        const n = (m?.name || "").toLowerCase();
        return n.includes("black") || n.includes("blk") || n.includes("body") || n.includes("plastic");
      };

      // Pick body as: any common material that is named like body/black OR is sufficiently dark.
      const bodyUUIDs = new Set(
        commonMaterials
          .filter((m) => looksLikeBodyByName(m) || materialLuma(m) < 0.18)
          .map((m) => m.uuid)
      );

      // Fallback: if nothing matched, pick the single darkest common material.
      if (bodyUUIDs.size === 0 && commonMaterials.length) {
        const darkest = [...commonMaterials].sort((a, b) => materialLuma(a) - materialLuma(b))[0];
        if (darkest) bodyUUIDs.add(darkest.uuid);
      }

      const isBodyMat = (material) => {
        if (!material) return false;
        if (Array.isArray(material)) return material.some((m) => m && bodyUUIDs.has(m.uuid));
        return bodyUUIDs.has(material.uuid);
      };

      const cubeFacesByName = new Map();
      const allFaces = [];
      cubesByName.forEach((cube, name) => {
        const faces = [];
        cube.traverse((o) => {
          if (!o.isMesh) return;
          if (isBodyMat(o.material)) return; // skip the shared "body" material
          faces.push(o);
        });
        cubeFacesByName.set(name, faces);
        allFaces.push(...faces);
      });

      // Prep materials for opacity fades once so interaction is instant.
      allFaces.forEach((face) => prepareFaceForFade(face));
      const faceMeshUUIDs = new Set(allFaces.map((face) => face.uuid));

      interactionRef.current.cubesByName = cubesByName;
      interactionRef.current.cubeFacesByName = cubeFacesByName;
      interactionRef.current.allFaceMeshes = allFaces;
      interactionRef.current.faceMeshUUIDs = faceMeshUUIDs;
      interactionRef.current.bodyMaterialUUIDs = bodyUUIDs;

      console.log(
        "[GLB/R3F] Materials used on ALL cubes:",
        (() => {
          const mats = new Map();
          root.traverse((o) => {
            if (!o.isMesh || !o.material) return;
            const arr = Array.isArray(o.material) ? o.material : [o.material];
            arr.forEach((m) => {
              if (!m) return;
              if (common.has(m.uuid)) mats.set(m.uuid, m);
            });
          });
          return Array.from(mats.values()).map((m) => `${m.name || "(unnamed)"} :: ${m.type} (uuid=${m.uuid})`);
        })()
      );
      console.log(
        "[GLB/R3F] Classified body/common materials:",
        Array.from(bodyUUIDs)
          .map((id) => materialByUUID.get(id))
          .filter(Boolean)
          .map((m) => `${m.name || "(unnamed)"} :: ${m.type} (uuid=${m.uuid})`)
      );

      // Intro: fade faces in + center cube fly-in.
      if (introSettingsRef.current.play) {
        playIntroNow();
      }
    },
    [playIntroNow, setValues, values.lockTargetToModelCenter]
  );

  const applyFaceSelection = useCallback(
    (clicked, { allowHomeReset = true, distanceOverride = null } = {}) => {
      if (!clicked) return;

      const findCubeName = (obj) => {
        let cur = obj;
        while (cur) {
          if (interactionRef.current.cubesByName.has(cur.name)) return cur.name;
          cur = cur.parent;
        }
        return null;
      };

      const cubeName = findCubeName(clicked);
      if (!cubeName) return;

      const body = interactionRef.current.bodyMaterialUUIDs;
      const mats = clicked.material ? (Array.isArray(clicked.material) ? clicked.material : [clicked.material]) : [];
      if (mats.some((m) => m && body.has(m.uuid))) return;

      const currentlyClickedFace = interactionRef.current.currentlyClickedFace;
      const activeSelectedCubeName = selectedCubeNameRef.current;
      const hasActiveSelection = !!activeSelectedCubeName;
      const isSameCube = hasActiveSelection && activeSelectedCubeName === cubeName;

      // Treat top_block_5 as "home reset" only after a selection already exists.
      // This avoids the first click instantly snapping back to default when the initial hit is top_block_5.
      if (allowHomeReset && cubeName === "top_block_5" && hasActiveSelection) {
        returnToDefault();
        return;
      }

      const isSameFace = isSameCube && currentlyClickedFace === clicked;
      if (isSameFace) {
        // Prevent an immediate reset from duplicate/echoed first-click events.
        if (performance.now() - lastSelectionAtRef.current < 500) return;
        returnToDefault();
        return;
      }

      // Only animate to clicked face when this click is an actual selection/switch action.
      const desiredDistance =
        typeof distanceOverride === "number" ? distanceOverride : values.babylonClickDistance;
      const camPreset = getCameraPoseForMesh(clicked, desiredDistance);
      if (camPreset) {
        animateCameraToPreset(camPreset, 900, { toFov: CLICK_INTERACTION_FOV });
      }

      if (isSameCube && currentlyClickedFace && clicked !== currentlyClickedFace) {
        animateOpacity(currentlyClickedFace, 0.2);
        removeFaceGlow(currentlyClickedFace);
        animateOpacity(clicked, 1.0);
        setFaceGlow(clicked);
        selectedCubeNameRef.current = cubeName;
        setSelectedCubeName(cubeName);
        lastSelectionAtRef.current = performance.now();
        interactionRef.current.currentlyClickedFace = clicked;
        interactionRef.current.cubesByName.forEach((cube, name) => {
          if (name === cubeName) animateScale(cube, SELECTED_CUBE_SCALE, SELECTED_CUBE_BOUNCE);
          else animateScale(cube, DIMMED_CUBE_SCALE, DIMMED_CUBE_BOUNCE);
        });
        interactionRef.current.allFaceMeshes.forEach((face) => {
          if (face === clicked) return;
          animateOpacity(face, DIMMED_FACE_OPACITY);
          removeFaceGlow(face);
        });
        focusPanelForFace(clicked);
        return;
      }

      interactionRef.current.cubesByName.forEach((cube, name) => {
        if (name === cubeName) animateScale(cube, SELECTED_CUBE_SCALE, SELECTED_CUBE_BOUNCE);
        else animateScale(cube, DIMMED_CUBE_SCALE, DIMMED_CUBE_BOUNCE);
      });
      interactionRef.current.allFaceMeshes.forEach((face) => {
        animateOpacity(face, face === clicked ? 1.0 : DIMMED_FACE_OPACITY);
        if (face === clicked) {
          setFaceGlow(face);
        } else {
          removeFaceGlow(face);
        }
      });

      interactionRef.current.currentlyExpandedCubeName = cubeName;
      interactionRef.current.currentlyClickedFace = clicked;
      selectedCubeNameRef.current = cubeName;
      setSelectedCubeName(cubeName);
      lastSelectionAtRef.current = performance.now();
      focusPanelForFace(clicked);
    },
    [animateCameraToPreset, animateOpacity, animateScale, focusPanelForFace, getCameraPoseForMesh, removeFaceGlow, returnToDefault, setFaceGlow, values.babylonClickDistance, values.cameraFov]
  );

  const onModelPointerDown = useCallback(
    (e) => {
      if (isGuidedRunning) return;
      const ev = e?.nativeEvent || e;
      if (ev?.pointerType === "touch" && ev?.isPrimary === false) return;
      const controls = controlsRef.current;
      pointerDownRef.current.active = true;
      pointerDownRef.current.pointerId = ev?.pointerId ?? null;
      pointerDownRef.current.x = ev?.clientX ?? 0;
      pointerDownRef.current.y = ev?.clientY ?? 0;
      pointerDownRef.current.downAt = performance.now();
      pointerDownRef.current.maxFromStart = 0;
      pointerDownRef.current.startAzimuth = controls ? controls.getAzimuthalAngle() : null;
      pointerDownRef.current.startPolar = controls ? controls.getPolarAngle() : null;
      pointerDownRef.current.startDistance = controls ? controls.getDistance() : null;
    },
    [isGuidedRunning]
  );

  const onModelPointerMove = useCallback(
    (e) => {
      const down = pointerDownRef.current;
      if (!down.active) return;
      const ev = e?.nativeEvent || e;
      const samePointer =
        down.pointerId == null || ev?.pointerId == null || down.pointerId === ev.pointerId;
      if (!samePointer) return;
      if (!Number.isFinite(ev?.clientX) || !Number.isFinite(ev?.clientY)) return;
      const fromStart = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      if (fromStart > down.maxFromStart) down.maxFromStart = fromStart;
    },
    []
  );

  const onModelPointerUp = useCallback(
    (e) => {
      if (isGuidedRunning) return;
      if (cameraAnimLockRef.current) return;
      if (typeof e.stopPropagation === "function") e.stopPropagation();
      const ev = e?.nativeEvent || e;
      if (ev?.pointerType === "touch" && ev?.isPrimary === false) return;
      if (ev?.pointerType === "mouse" && typeof ev?.button === "number" && ev.button !== 0) return;
      const dragThreshold = ev?.pointerType === "touch" ? TOUCH_DRAG_THRESHOLD_PX : CLICK_DRAG_THRESHOLD_PX;

      // R3F can invoke parent handlers multiple times for one physical pointer-up (one per hit object).
      // Handle only the closest intersection for this event to avoid double-toggle/reset.
      if (Array.isArray(e.intersections) && e.intersections.length > 0 && e.intersections[0]?.object !== e.object) {
        return;
      }

      // Guard against duplicate callbacks carrying the same native event.
      const pointerId = ev?.pointerId ?? null;
      const timeStamp = Number.isFinite(ev?.timeStamp) ? ev.timeStamp : -1;
      if (
        timeStamp >= 0 &&
        lastPointerUpRef.current.timeStamp === timeStamp &&
        lastPointerUpRef.current.pointerId === pointerId
      ) {
        return;
      }
      lastPointerUpRef.current.pointerId = pointerId;
      lastPointerUpRef.current.timeStamp = timeStamp;

      const down = pointerDownRef.current;
      const hadPointerDown = down.active;
      const downPointerId = down.pointerId;
      const downX = down.x;
      const downY = down.y;
      const downAt = down.downAt;
      const downMaxFromStart = down.maxFromStart || 0;
      const downStartAzimuth = down.startAzimuth;
      const downStartPolar = down.startPolar;
      const downStartDistance = down.startDistance;
      pointerDownRef.current.active = false;
      const pointerUpAt = performance.now();

      if (!hadPointerDown) return;

      if (Number.isFinite(downAt)) {
        const pressDuration = pointerUpAt - downAt;
        if (pressDuration < MIN_CLICK_PRESS_MS) return;
      }

      {
        const hasCoords =
          Number.isFinite(downX) &&
          Number.isFinite(downY) &&
          Number.isFinite(ev?.clientX) &&
          Number.isFinite(ev?.clientY);
        const samePointer =
          downPointerId == null || ev?.pointerId == null || downPointerId === ev.pointerId;
        if (hasCoords && samePointer) {
          const dragDistance = Math.max(
            Math.hypot(ev.clientX - downX, ev.clientY - downY),
            downMaxFromStart
          );
          if (dragDistance > dragThreshold) return;
        }
      }

      const controls = controlsRef.current;
      if (controls) {
        const hasStartAngles =
          Number.isFinite(downStartAzimuth) &&
          Number.isFinite(downStartPolar) &&
          Number.isFinite(downStartDistance);
        if (hasStartAngles) {
          const azMoved = Math.abs(shortestAngleDelta(downStartAzimuth, controls.getAzimuthalAngle()));
          const polMoved = Math.abs(controls.getPolarAngle() - downStartPolar);
          const distMoved = Math.abs(controls.getDistance() - downStartDistance);
          if (azMoved > 0.01 || polMoved > 0.01 || distMoved > 0.05) return;
        }
      }

      // Keep R3F's delta as a secondary fallback.
      if (typeof e.delta === "number" && e.delta > dragThreshold) return;
      if (!interactionRef.current.allFaceMeshes.length) return;

      const findCubeName = (obj) => {
        let cur = obj;
        while (cur) {
          if (interactionRef.current.cubesByName.has(cur.name)) return cur.name;
          cur = cur.parent;
        }
        return null;
      };

      const isKnownFace = (obj) =>
        obj?.isMesh && interactionRef.current.faceMeshUUIDs.has(obj.uuid) && !!findCubeName(obj);

      // Prefer intersections computed by R3F for this event, then raycast against known faces.
      const eventHits = Array.isArray(e.intersections) ? e.intersections : [];
      const clickedFromEvent = eventHits.find((hit) => isKnownFace(hit?.object));
      const faceHits = e.raycaster?.intersectObjects(interactionRef.current.allFaceMeshes, false) || [];
      const clickedHit = clickedFromEvent || faceHits.find((hit) => isKnownFace(hit?.object));
      const clicked = clickedHit?.object || null;
      const fallbackObject = e.object;
      const fallback = isKnownFace(fallbackObject) ? fallbackObject : null;

      if (!clicked && !fallback) return;

      const resolvedFace = clicked || fallback;
      const now = pointerUpAt;
      const lastTap = lastResolvedTapRef.current;
      const x = Number.isFinite(ev?.clientX) ? ev.clientX : null;
      const y = Number.isFinite(ev?.clientY) ? ev.clientY : null;
      const pointerType = ev?.pointerType || "mouse";
      const sameFace = lastTap.faceUuid && resolvedFace?.uuid && lastTap.faceUuid === resolvedFace.uuid;
      const sameSpot =
        Number.isFinite(lastTap.x) &&
        Number.isFinite(lastTap.y) &&
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Math.hypot(x - lastTap.x, y - lastTap.y) < 2;

      // Ignore duplicate dispatches for the same physical tap.
      if (sameFace && sameSpot && now - lastTap.time < 320) return;
      // Ignore synthetic mouse event that often follows touch on some devices.
      if (pointerType === "mouse" && lastTap.pointerType === "touch" && now - lastTap.time < 800) return;

      lastResolvedTapRef.current = {
        time: now,
        x,
        y,
        pointerType,
        faceUuid: resolvedFace?.uuid || null
      };
      // OrbitControls may emit an onEnd with pre-click angles right after pointerup.
      // Ignore those sync writes while we transition to the selected face.
      suppressOrbitSyncUntilRef.current = Math.max(suppressOrbitSyncUntilRef.current, now + 1100);

      onInteraction();
      applyFaceSelection(resolvedFace, { allowHomeReset: true });
    },
    [applyFaceSelection, isGuidedRunning, onInteraction]
  );

  const dpr = useMemo(() => clamp(window.devicePixelRatio || 1, 1, 2), []);

  const runDemo = useCallback(async () => {
    if (isGuidedRunning) return;
    if (!modelRef.current) return;
    if (!interactionRef.current.allFaceMeshes.length) return;
    if (!cameraRef.current) return;

    setIsDemoRunning(true);
    resetTimer();

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const HOLD_MS = 2000;
    const PAUSE_MS = 5000;
    const START_DELAY_MS = 5000;
    const screenPosForWorld = (v3) => {
      const camera = cameraRef.current;
      if (!camera || !v3) return null;
      const v = v3.clone().project(camera);
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      // Account for canvas being on the right 45% of screen (panel takes left 55%)
      const canvasOffsetX = w * 0.55;
      const canvasWidth = w * 0.45;
      return {
        x: canvasOffsetX + (v.x * 0.5 + 0.5) * canvasWidth,
        y: (-v.y * 0.5 + 0.5) * h
      };
    };
    const screenPosForMesh = (mesh) => {
      const camera = cameraRef.current;
      if (!camera || !mesh?.getWorldPosition) return null;
      const v = new THREE.Vector3();
      mesh.getWorldPosition(v);
      v.project(camera);
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      // Account for canvas being on the right 45% of screen (panel takes left 55%)
      const canvasOffsetX = w * 0.55;
      const canvasWidth = w * 0.45;
      return {
        x: canvasOffsetX + (v.x * 0.5 + 0.5) * canvasWidth,
        y: (-v.y * 0.5 + 0.5) * h
      };
    };
    const demoClick = async (meshOrWorldPoint, label) => {
      const p =
        meshOrWorldPoint?.isVector3 ? screenPosForWorld(meshOrWorldPoint) : screenPosForMesh(meshOrWorldPoint);
      if (!p) return;
      setDemoCursor((s) => ({ ...s, visible: true, x: p.x, y: p.y, label: label || "", pulse: s.pulse + 1 }));
      await sleep(450);
    };

    try {
      await sleep(START_DELAY_MS);
      if (controlsRef.current) controlsRef.current.enabled = false;

      // Hard reset to default before intro (so lighting angle matches the intended shot).
      animateCameraToPreset(defaultPoseRef.current, 900, { toFov: values.cameraFov });
      resetAllCubes(true);
      interactionRef.current.currentlyExpandedCubeName = null;
      interactionRef.current.currentlyClickedFace = null;
      await sleep(1150);

      // 1) Intro
      playIntroNow();
      await sleep(Math.max(values.introFaceFadeMs, values.introCenterMs) + PAUSE_MS);

      // Ensure transforms are current before choosing faces.
      modelRef.current.updateWorldMatrix(true, true);

      const body = interactionRef.current.bodyMaterialUUIDs;
      const isBody = (obj) => {
        const mats = obj?.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
        return mats.some((m) => m && body.has(m.uuid));
      };
      const yellowScore = (obj) => {
        const mat = obj?.material;
        const m = Array.isArray(mat) ? mat[0] : mat;
        const c = m?.color;
        if (!c || typeof c.r !== "number") return -Infinity;
        // High R+G, low B => yellow-ish.
        return (c.r + c.g) - c.b * 2;
      };

      const pickCube = ({ exclude = new Set() } = {}) => {
        const entries = Array.from(interactionRef.current.cubeFacesByName.entries());
        for (const [name, faces] of entries) {
          if (name === "top_block_5") continue;
          if (exclude.has(name)) continue;
          if (Array.isArray(faces) && faces.length >= 2) return { name, faces };
        }
        return null;
      };

      const picked = pickCube();
      if (!picked) return;

      const target = modelCenterRef.current.clone();
      const faceDir = (m) => {
        const p = new THREE.Vector3();
        m.getWorldPosition(p);
        return p.sub(target).normalize();
      };

      // Choose two faces on that cube with the largest angular separation.
      let faceA = picked.faces[0];
      let faceB = picked.faces[1];
      let best = -1;
      for (let i = 0; i < picked.faces.length; i++) {
        const a = picked.faces[i];
        const da = faceDir(a);
        for (let j = i + 1; j < picked.faces.length; j++) {
          const b = picked.faces[j];
          const db = faceDir(b);
          const angleScore = 1 - da.dot(db); // higher = more different
          if (angleScore > best) {
            best = angleScore;
            faceA = a;
            faceB = b;
          }
        }
      }

      const clickDistance = values.babylonClickDistance;

      // Pick a third face from the same cube (different from faceA and faceB)
      let faceC_sameCube = null;
      for (const face of picked.faces) {
        if (face !== faceA && face !== faceB && !isBody(face)) {
          faceC_sameCube = face;
          break;
        }
      }
      // Fallback if we don't have a third face
      if (!faceC_sameCube) faceC_sameCube = faceB;

      // 2) Click multiple faces on the same cube, then reset
      // Click faceA (first face)
      await demoClick(faceA, "CLICK");
      applyFaceSelection(faceA, { allowHomeReset: true, distanceOverride: clickDistance });
      await sleep(HOLD_MS);

      // Click faceB (left face on same cube)
      await demoClick(faceB, "CLICK");
      applyFaceSelection(faceB, { allowHomeReset: true, distanceOverride: clickDistance });
      await sleep(HOLD_MS);

      // Click third face (top or another face on same cube)
      await demoClick(faceC_sameCube, "CLICK");
      applyFaceSelection(faceC_sameCube, { allowHomeReset: true, distanceOverride: clickDistance });
      await sleep(HOLD_MS);

      // 3) Click faceA again (go back to first face)
      await demoClick(faceA, "CLICK");
      applyFaceSelection(faceA, { allowHomeReset: true, distanceOverride: clickDistance });
      await sleep(HOLD_MS);

      // 4) Click faceA again to trigger reset (zoom out and reset to default)
      await demoClick(faceA, "CLICK");
      applyFaceSelection(faceA, { allowHomeReset: true, distanceOverride: clickDistance });
      await sleep(HOLD_MS);

      // 5) Click a different random cube, then click HOME to reset.
      // Pick a cube on the TOP layer with a yellow-ish face so the HOME button on the yellow face is visible next.
      const preferredTop = [
        "top_block_2",
        "top_block_4",
        "top_block_6",
        "top_block_8",
        "top_block_1",
        "top_block_3",
        "top_block_7",
        "top_block_9"
      ];
      let picked2 = null;
      let faceC = null;
      let bestYellow = -Infinity;
      for (const name of preferredTop) {
        if (name === "top_block_5") continue;
        if (name === picked.name) continue;
        const faces = interactionRef.current.cubeFacesByName.get(name);
        if (!faces?.length) continue;
        for (const f of faces) {
          if (!f || !f.isMesh || isBody(f)) continue;
          const s = yellowScore(f);
          if (s > bestYellow) {
            bestYellow = s;
            picked2 = { name, faces };
            faceC = f;
          }
        }
      }
      if (!picked2 || !faceC) {
        picked2 = pickCube({ exclude: new Set([picked.name]) });
        if (!picked2) return;
        faceC = picked2.faces.find((f) => f && f.isMesh && !isBody(f)) || picked2.faces[0];
      }
      await demoClick(faceC, "CLICK");
      applyFaceSelection(faceC, { allowHomeReset: true, distanceOverride: clickDistance });
      await sleep(HOLD_MS);

      // 4) Click the HOME cube (top_block_5) and reset immediately.
      const homeFaces = interactionRef.current.cubeFacesByName.get("top_block_5") || [];
      if (homeFaces.length) {
        const homeFace =
          homeFaces.filter((f) => f && f.isMesh && !isBody(f)).sort((a, b) => yellowScore(b) - yellowScore(a))[0] ||
          homeFaces[0];

        // Visualize the click at the top-center of the yellow face (where the home button appears).
        let homeButtonWorld = null;
        if (homeFace?.geometry) {
          const geom = homeFace.geometry;
          if (!geom.boundingBox) geom.computeBoundingBox?.();
          const bb = geom.boundingBox;
          if (bb) {
            const inset = 0.85;
            const local = new THREE.Vector3(
              (bb.min.x + bb.max.x) * 0.5,
              bb.min.y + (bb.max.y - bb.min.y) * inset,
              (bb.min.z + bb.max.z) * 0.5
            );
            homeButtonWorld = homeFace.localToWorld(local.clone());
          }
        }

        await demoClick(homeButtonWorld || homeFace, "HOME");
        applyFaceSelection(homeFace, { allowHomeReset: true });
        await sleep(HOLD_MS);
      }

      // 6) Click a random cube, wait 5s, then auto-reset back to default.
      const picked3 = pickCube({ exclude: new Set([picked.name, picked2.name]) }) || picked2;
      const faceD = picked3.faces[picked3.faces.length - 1] || picked3.faces[0];
      await demoClick(faceD, "CLICK");
      applyFaceSelection(faceD, { allowHomeReset: true, distanceOverride: clickDistance });
      await sleep(HOLD_MS);

      animateCameraToPreset(defaultPoseRef.current, 900, { toFov: values.cameraFov });
      resetAllCubes(true);
      interactionRef.current.currentlyExpandedCubeName = null;
      interactionRef.current.currentlyClickedFace = null;
      await sleep(1050);
    } finally {
      if (controlsRef.current) controlsRef.current.enabled = true;
      setIsDemoRunning(false);
      setDemoCursor({ visible: false, x: 0, y: 0, pulse: 0, label: "" });
      startTimer();
    }
  }, [animateCameraToPreset, applyFaceSelection, isGuidedRunning, playIntroNow, resetAllCubes, resetTimer, startTimer, values.babylonClickDistance, values.cameraAzimuth, values.cameraDistance, values.cameraPolar, values.introCenterMs, values.introFaceFadeMs]);

  const runPanelDemo = useCallback(async () => {
    if (isGuidedRunning) return;
    if (!modelRef.current) return;
    if (!interactionRef.current.allFaceMeshes.length) return;
    if (!cameraRef.current) return;

    setIsPanelDemoRunning(true);
    resetTimer();

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const HOLD_MS = 2000;
    const START_DELAY_MS = 5000;
    const screenPosForWorld = (v3) => {
      const camera = cameraRef.current;
      if (!camera || !v3) return null;
      const v = v3.clone().project(camera);
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const canvasOffsetX = w * 0.55;
      const canvasWidth = w * 0.45;
      return {
        x: canvasOffsetX + (v.x * 0.5 + 0.5) * canvasWidth,
        y: (-v.y * 0.5 + 0.5) * h
      };
    };
    const screenPosForMesh = (mesh) => {
      const camera = cameraRef.current;
      if (!camera || !mesh?.getWorldPosition) return null;
      const v = new THREE.Vector3();
      mesh.getWorldPosition(v);
      v.project(camera);
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const canvasOffsetX = w * 0.55;
      const canvasWidth = w * 0.45;
      return {
        x: canvasOffsetX + (v.x * 0.5 + 0.5) * canvasWidth,
        y: (-v.y * 0.5 + 0.5) * h
      };
    };
    const demoClick = async (meshOrWorldPoint, label) => {
      const p =
        meshOrWorldPoint?.isVector3 ? screenPosForWorld(meshOrWorldPoint) : screenPosForMesh(meshOrWorldPoint);
      if (!p) return;
      setDemoCursor((s) => ({ ...s, visible: true, x: p.x, y: p.y, label: label || "", pulse: s.pulse + 1 }));
      await sleep(450);
    };
    const demoClickAt = async (point, label) => {
      if (!point) return;
      setDemoCursor((s) => ({ ...s, visible: true, x: point.x, y: point.y, label: label || "", pulse: s.pulse + 1 }));
      await sleep(450);
    };
    const ensureSelectionVisuals = (clicked) => {
      if (!clicked) return;
      let cubeName = null;
      let cur = clicked;
      while (cur) {
        if (interactionRef.current.cubesByName.has(cur.name)) {
          cubeName = cur.name;
          break;
        }
        cur = cur.parent;
      }
      if (!cubeName) return;
      interactionRef.current.cubesByName.forEach((cube, name) => {
        if (name === cubeName) animateScale(cube, SELECTED_CUBE_SCALE, SELECTED_CUBE_BOUNCE);
        else animateScale(cube, DIMMED_CUBE_SCALE, DIMMED_CUBE_BOUNCE);
      });
      interactionRef.current.allFaceMeshes.forEach((face) => {
        animateOpacity(face, face === clicked ? 1.0 : DIMMED_FACE_OPACITY);
        if (face === clicked) setFaceGlow(face);
        else removeFaceGlow(face);
      });
      interactionRef.current.currentlyExpandedCubeName = cubeName;
      interactionRef.current.currentlyClickedFace = clicked;
    };

    try {
      await sleep(START_DELAY_MS);
      if (controlsRef.current) controlsRef.current.enabled = false;

      animateCameraToPreset(defaultPoseRef.current, 900, { toFov: values.cameraFov });
      resetAllCubes(true);
      interactionRef.current.currentlyExpandedCubeName = null;
      interactionRef.current.currentlyClickedFace = null;
      await sleep(1050);

      modelRef.current.updateWorldMatrix(true, true);

      const body = interactionRef.current.bodyMaterialUUIDs;
      const isBody = (obj) => {
        const mats = obj?.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
        return mats.some((m) => m && body.has(m.uuid));
      };

      const pickCube = ({ exclude = new Set() } = {}) => {
        const entries = Array.from(interactionRef.current.cubeFacesByName.entries());
        for (const [name, faces] of entries) {
          if (name === "top_block_5") continue;
          if (exclude.has(name)) continue;
          const usable = Array.isArray(faces) ? faces.filter((f) => f && f.isMesh && !isBody(f)) : [];
          if (usable.length >= 2) return { name, faces: usable };
        }
        return null;
      };

      const picked = pickCube();
      if (!picked) return;

      const target = modelCenterRef.current.clone();
      const faceDir = (m) => {
        const p = new THREE.Vector3();
        m.getWorldPosition(p);
        return p.sub(target).normalize();
      };

      let faceA = picked.faces[0];
      let faceB = picked.faces[1];
      let best = -1;
      for (let i = 0; i < picked.faces.length; i++) {
        const a = picked.faces[i];
        const da = faceDir(a);
        for (let j = i + 1; j < picked.faces.length; j++) {
          const b = picked.faces[j];
          const db = faceDir(b);
          const score = 1 - da.dot(db);
          if (score > best) {
            best = score;
            faceA = a;
            faceB = b;
          }
        }
      }

      const clickDistance = values.babylonClickDistance;

      await demoClick(faceA, "CLICK");
      applyFaceSelection(faceA, { allowHomeReset: true, distanceOverride: clickDistance });
      ensureSelectionVisuals(faceA);
      await sleep(HOLD_MS);

      await demoClick(faceB, "CLICK");
      applyFaceSelection(faceB, { allowHomeReset: true, distanceOverride: clickDistance });
      ensureSelectionVisuals(faceB);
      await sleep(HOLD_MS);

      const picked2 = pickCube({ exclude: new Set([picked.name]) });
      if (picked2) {
        const faceC = picked2.faces.find((f) => f && f.isMesh && !isBody(f)) || picked2.faces[0];
        if (faceC) {
          await demoClick(faceC, "CLICK");
          applyFaceSelection(faceC, { allowHomeReset: true, distanceOverride: clickDistance });
          ensureSelectionVisuals(faceC);
          await sleep(HOLD_MS);
        }
      }

      const resetFace = (picked2?.faces && picked2.faces.length) ? (picked2.faces.find((f) => f && f.isMesh && !isBody(f)) || picked2.faces[0]) : faceB;
      if (resetFace) {
        await demoClick(resetFace, "RESET");
        applyFaceSelection(resetFace, { allowHomeReset: true, distanceOverride: clickDistance });
        await sleep(HOLD_MS);
      }
    } finally {
      if (controlsRef.current) controlsRef.current.enabled = true;
      setIsPanelDemoRunning(false);
      setDemoCursor({ visible: false, x: 0, y: 0, pulse: 0, label: "" });
      startTimer();
    }
  }, [animateCameraToPreset, animateOpacity, animateScale, applyFaceSelection, handlePanelClose, isGuidedRunning, removeFaceGlow, resetAllCubes, resetTimer, setFaceGlow, startTimer, values.babylonClickDistance, values.cameraAzimuth, values.cameraDistance, values.cameraFov, values.cameraPolar]);

  const onDemoHotkey = useCallback((event) => {
    if (isGuidedRunning) return;
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
    if (event.key === "d" || event.key === "D") {
      event.preventDefault();
      runPanelDemo();
    }
  }, [isGuidedRunning, runPanelDemo]);

  useEffect(() => {
    window.addEventListener("keydown", onDemoHotkey);
    return () => window.removeEventListener("keydown", onDemoHotkey);
  }, [onDemoHotkey]);

  return (
    <>
      <Leva hidden />
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1002,
          pointerEvents: isGuidedRunning ? "auto" : "none",
          background: "transparent"
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: demoCursor.x,
          top: demoCursor.y,
          transform: "translate(-50%, -50%)",
          zIndex: 1004,
          pointerEvents: "none",
          opacity: demoCursor.visible ? 1 : 0,
          transition: "opacity 180ms ease"
        }}
      >
        <div
          key={demoCursor.pulse}
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            background: "rgba(255,255,255,0.95)",
            boxShadow: "0 0 0 6px rgba(255,255,255,0.10), 0 10px 30px rgba(0,0,0,0.55)"
          }}
        />
        <div
          key={`ring-${demoCursor.pulse}`}
          style={{
            position: "absolute",
            inset: -18,
            borderRadius: 999,
            border: "2px solid rgba(255,255,255,0.65)",
            transform: "scale(0.2)",
            opacity: 0,
            animation: "demoClickRing 420ms ease-out"
          }}
        />
        {demoCursor.label ? (
          <div
            style={{
              position: "absolute",
              top: 20,
              left: "50%",
              transform: "translateX(-50%)",
              fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontSize: 12,
              letterSpacing: 1,
              padding: "4px 8px",
              borderRadius: 999,
              background: "rgba(15,15,15,0.72)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "white",
              backdropFilter: "blur(8px)",
              whiteSpace: "nowrap"
            }}
          >
            {demoCursor.label}
          </div>
        ) : null}
      </div>
      <style>{`
        @keyframes demoClickRing {
          0% { transform: scale(0.2); opacity: 0.0; }
          20% { opacity: 0.85; }
          100% { transform: scale(1.0); opacity: 0.0; }
        }
      `}</style>

      {/* Main Grid Layout: Side Panel (55%) + Canvas (45%) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '55% 45%',
          width: '100vw',
          height: '100vh',
          position: 'fixed',
          inset: 0,
          zIndex: 1
        }}
      >
        {/* Side Panel */}
        <SidePanel
          panels={[panelState.primary, panelState.secondary]}
          isDemoRunning={isDemoRunning}
          onClose={handlePanelClose}
          onSwapSecondary={swapPanels}
        />

        {/* Canvas Wrapper */}
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <Canvas
            shadows
            dpr={dpr}
            frameloop={values.wkwEnabled ? "never" : "always"}
            camera={{ fov: values.cameraFov, position: [0, 0, 25], near: values.cameraNear, far: values.cameraFar }}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: "high-performance"
            }}
            onCreated={({ gl, camera }) => {
              cameraRef.current = camera;
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.15;
            }}
            style={{
              filter: values.blurAmount > 0 ? `blur(${values.blurAmount}px)` : 'none',
              touchAction: "none"
            }}
          >
        <color attach="background" args={[values.background]} />

        <CameraRig controlsRef={controlsRef} values={values} />

        <OrbitControls
          ref={controlsRef}
          enableRotate={!isGuidedRunning && values.enableRotate}
          enableZoom={!isGuidedRunning && (values.cameraMode === "Babylon" || values.cameraProfile === "BabylonOriginal" ? false : values.enableZoom)}
          enablePan={!isGuidedRunning && (values.cameraMode === "Babylon" || values.cameraProfile === "BabylonOriginal" ? false : values.enablePan)}
          enableDamping
          dampingFactor={0.08}
          autoRotate={!isGuidedRunning && values.autoRotate && !isCameraAnimating && !selectedCubeName}
          autoRotateSpeed={values.autoRotateSpeed}
          onStart={onInteraction}
          onEnd={() => {
            const now = performance.now();
            if (isGuidedRunning) return;
            if (!values.syncLevaFromOrbit) return;
            if (!controlsRef.current) return;
            if (cameraAnimLockRef.current) return;
            if (now < suppressOrbitSyncUntilRef.current) return;
            setValues({
              cameraAzimuth: controlsRef.current.getAzimuthalAngle(),
              cameraPolar: controlsRef.current.getPolarAngle(),
              cameraDistance: controlsRef.current.getDistance(),
              targetX: controlsRef.current.target.x,
              targetY: controlsRef.current.target.y,
              targetZ: controlsRef.current.target.z
            });
          }}
        />

        <BabylonConstraints controlsRef={controlsRef} values={values} />

        <StudioLights values={values} />

        <Suspense fallback={null}>
          <Model
            values={values}
            onReady={onModelReady}
            onPointerDown={onModelPointerDown}
            onPointerMove={onModelPointerMove}
            onPointerUp={onModelPointerUp}
          />
        </Suspense>

        <ContactShadows
          position={[0, values.contactY, 0]}
          opacity={values.contactOpacity}
          blur={values.contactBlur}
          scale={values.contactScale}
        />

        <Animator
          controlsRef={controlsRef}
          animRef={animRef}
          onCameraAnimEnd={onCameraAnimEnd}
          onCameraTweenDone={onCameraTweenDone}
        />

        {/* Wong Kar-wai Frame Rate Controller with Afterimage Trails */}
        <WongKarWaiFrameController
          enabled={values.wkwEnabled}
          fps={values.wkwFps}
          trailStrength={values.wkwTrails}
        />
          </Canvas>
        </div>
      </div>
    </>
  );
}

useGLTF.preload(GLB_URL);
