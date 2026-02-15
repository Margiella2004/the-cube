# Three.js Tools Logo - Lighting Setup Analysis

## Overview

This document provides a comprehensive analysis of the lighting setup used in the ThreeToolsLogoScene, including material configuration, light placement, and implementation details.

---

## Table of Contents

1. [Scene Configuration](#scene-configuration)
2. [Lighting Setup](#lighting-setup)
3. [Material Configuration](#material-configuration)
4. [Advanced Rendering Techniques](#advanced-rendering-techniques)
5. [Implementation Guide](#implementation-guide)

---

## Scene Configuration

### Canvas Setup

The scene uses a narrow field of view for a cinematic, telephoto lens effect:

```jsx
<Canvas
  className="tt-visual__canvas"
  shadows
  camera={{
    position: [0, 0, 25],
    fov: 10,           // Narrow FOV for cinematic look
    near: 0.1,
    far: 100
  }}
>
  <color attach="background" args={['#050505']} />
  <ThreeToolsLogoScene />
</Canvas>
```

**Key Parameters:**
- **Camera Position**: `[0, 0, 25]` - Far back for telephoto compression
- **FOV**: `10` - Very narrow (default is 50-75)
- **Background**: `#050505` - Nearly black for high contrast

---

## Lighting Setup

### 1. Ambient Light (Base Illumination)

Provides overall scene brightness without direction:

```jsx
<ambientLight intensity={0.4} />
```

**Purpose**: Ensures no areas are completely black, simulates indirect light bounce.

**Why 0.4?** Low enough to maintain contrast, high enough to see shadow details.

---

### 2. Key Light (Primary Light Source)

A warm orange directional light acts as the main light:

```jsx
<directionalLight
  color="#ff6400"        // Bright orange
  intensity={2.4}        // Strong intensity
  position={[3, 4, 2]}   // Upper right front
/>
```

**Characteristics:**
- **Type**: DirectionalLight (parallel rays like sunlight)
- **Color**: `#ff6400` - Warm orange (RGB: 255, 100, 0)
- **Intensity**: 2.4 - Bright enough to be the dominant light
- **Position Breakdown**:
  - X: `3` - Right side of logo
  - Y: `4` - Above logo
  - Z: `2` - In front of logo

**Visual Effect**: Creates warm highlights on the logo's right side, establishing the main lighting direction.

---

### 3. Fill Light (Secondary Light)

A cool white spotlight balances the warm key light:

```jsx
<spotLight
  color="#ffffff"        // Pure white
  intensity={1}          // Half the key light intensity
  angle={0.45}           // ~25.8 degrees
  position={[-3, 3, 2]}  // Upper left front
/>
```

**Characteristics:**
- **Type**: SpotLight (focused beam with falloff)
- **Color**: `#ffffff` - Cool/neutral white
- **Intensity**: 1.0 - Softer than key light
- **Angle**: 0.45 radians (25.8°) - Focused beam
- **Position**: Opposite side from key light

**Visual Effect**: Fills in shadows created by the key light, adds cool highlights on the left side.

---

### 4. Environment Lighting

Uses Lightformers to create area lights that contribute to reflections:

```jsx
<Environment resolution={256}>
  {/* Warm environment bounce */}
  <Lightformer
    intensity={4.4}
    color="#ff6400"
    position={[5, 4, 0]}
    scale={[6, 6, 1]}
  />

  {/* Cool environment bounce */}
  <Lightformer
    intensity={1.6}
    color="#95A3B6"
    position={[-4, 3, -2]}
    scale={[4, 4, 1]}
  />
</Environment>
```

**Warm Lightformer:**
- **Intensity**: 4.4 - Very strong for reflections
- **Color**: `#ff6400` - Matches key light
- **Position**: `[5, 4, 0]` - Right side, slightly higher
- **Scale**: `[6, 6, 1]` - Large rectangular area light

**Cool Lightformer:**
- **Intensity**: 1.6 - Moderate intensity
- **Color**: `#95A3B6` - Cool gray-blue (RGB: 149, 163, 182)
- **Position**: `[-4, 3, -2]` - Left side, behind
- **Scale**: `[4, 4, 1]` - Medium area light

**Purpose**: These create realistic reflections on the metallic logo surfaces and simulate environmental light bounce.

---

### 5. Contact Shadows

Adds grounded realism with soft shadows beneath the logo:

```jsx
<ContactShadows
  position={[0, -0.85, 0]}  // Below the logo
  opacity={0.4}             // Semi-transparent
  scale={12}                // Wide shadow plane
  blur={2.2}                // Soft edges
/>
```

**Parameters:**
- **Position**: `[0, -0.85, 0]` - Ground plane below logo
- **Opacity**: 0.4 - Subtle, not too dark
- **Scale**: 12 - Extends beyond logo bounds
- **Blur**: 2.2 - Soft, natural shadow falloff

---

## Material Configuration

### Logo Model Loading

The logo is loaded with specific material tweaks:

```jsx
const logoMaterial = useCallback((mesh) => {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];

  materials.forEach((material) => {
    if (!material) return;
    material.metalness = 0.55;  // Moderately metallic
    material.roughness = 0.2;   // Fairly smooth/reflective
  });
}, []);

const logo = useSceneAsset(
  THREE_TOOLS_LOGO_URL,  // '/assets/three-tools-logo.glb'
  3.3,                   // Target height in units
  logoMaterial,          // Material callback
  afterClone             // Additional processing
);
```

### Material Properties Explained

**Base Material (All Meshes):**
```javascript
material.metalness = 0.55;
material.roughness = 0.2;
```

- **Metalness 0.55**: Semi-metallic appearance
  - 0 = dielectric (plastic, wood)
  - 1 = full metal
  - 0.55 = stylized metallic look

- **Roughness 0.2**: Smooth, reflective surface
  - 0 = mirror
  - 1 = completely diffuse
  - 0.2 = polished surface with clear reflections

---

### Special Mesh Configurations

**Logo Fill (Logo-Fill003):**

```javascript
const fill = root.getObjectByName('Logo-Fill003');
if (fill && fill.material) {
  const cloned = fill.material.clone();
  cloned.dithering = true;        // Prevents color banding
  cloned.toneMapped = false;      // Preserves exact colors
  cloned.metalness = 0.45;        // Slightly less metallic
  cloned.roughness = 0.25;        // Slightly rougher
  fill.material = cloned;
}
```

**Why These Values?**
- **Dithering**: Eliminates gradient banding in smooth color transitions
- **Tone Mapping OFF**: Ensures colors render exactly as specified (important for brand colors)
- **Lower Metalness/Higher Roughness**: Creates subtle material variation

---

**Logo Wire (Logo-Wire001):**

```javascript
const wire = root.getObjectByName('Logo-Wire001');
if (wire && wire.material) {
  const wireMaterial = wire.material.clone();
  wireMaterial.color.set('#FFFFFF');    // Pure white
  wireMaterial.toneMapped = false;      // Bright white, no tone mapping
  wireMaterial.transparent = true;      // Enable transparency
  wireMaterial.opacity = 0.9;           // Slightly transparent
  wire.material = wireMaterial;
  wire.layers.set(1);                   // Render to mask layer
  wire.renderOrder = 2;                 // Render on top
}
```

**Purpose:**
- Creates bright white wireframe overlay
- Renders to special layer for mask texture
- Always visible on top (renderOrder = 2)

---

## Advanced Rendering Techniques

### Dual-Layer Rendering System

The logo uses a sophisticated two-pass rendering technique:

**1. Main Scene Render:**
Normal 3D rendering with full lighting and materials.

**2. Mask Pass Render:**
```javascript
// In useFrame loop (scenes.jsx:811-833)

// Save current render state
const previousRenderTarget = gl.getRenderTarget();
const previousLayersMask = camera.layers.mask;

// Configure for mask render
gl.setRenderTarget(maskTarget);      // Render to texture
gl.setClearColor('#000000', 0);      // Clear to transparent black
camera.layers.set(1);                // Only render layer 1 meshes

// Render mask
gl.render(scene, camera);

// Restore previous state
camera.layers.mask = previousLayersMask;
gl.setRenderTarget(previousRenderTarget);
```

**What Gets Rendered to Mask:**
- Logo-Wire001 (white wireframe)
- Logo-FillWire (cloned fill, initially transparent)

**Purpose:** Creates a screen-space mask texture used by floating UI quads.

---

## Implementation Guide

### Step 1: Set Up the Scene

```jsx
import { Canvas } from '@react-three/fiber';
import { ThreeToolsLogoScene } from './components/scenes';

function App() {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 0, 25], fov: 10 }}
    >
      <color attach="background" args={['#050505']} />
      <ThreeToolsLogoScene />
    </Canvas>
  );
}
```

---

### Step 2: Create the Lighting Component

```jsx
function LogoLighting() {
  return (
    <>
      {/* Base illumination */}
      <ambientLight intensity={0.4} />

      {/* Warm key light - primary light source */}
      <directionalLight
        color="#ff6400"
        intensity={2.4}
        position={[3, 4, 2]}
      />

      {/* Cool fill light - balances shadows */}
      <spotLight
        color="#ffffff"
        intensity={1}
        angle={0.45}
        position={[-3, 3, 2]}
      />

      {/* Environment reflections */}
      <Environment resolution={256}>
        <Lightformer
          intensity={4.4}
          color="#ff6400"
          position={[5, 4, 0]}
          scale={[6, 6, 1]}
        />
        <Lightformer
          intensity={1.6}
          color="#95A3B6"
          position={[-4, 3, -2]}
          scale={[4, 4, 1]}
        />
      </Environment>

      {/* Ground shadows */}
      <ContactShadows
        position={[0, -0.85, 0]}
        opacity={0.4}
        scale={12}
        blur={2.2}
      />
    </>
  );
}
```

---

### Step 3: Load and Configure Model

```jsx
import { useGLTF } from '@react-three/drei';

function LogoModel() {
  const { scene } = useGLTF('/assets/three-tools-logo.glb');

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        // Base material setup
        child.material.metalness = 0.55;
        child.material.roughness = 0.2;

        // Special handling for specific meshes
        if (child.name === 'Logo-Fill003') {
          child.material.metalness = 0.45;
          child.material.roughness = 0.25;
          child.material.dithering = true;
          child.material.toneMapped = false;
        }

        if (child.name === 'Logo-Wire001') {
          child.material.color.set('#FFFFFF');
          child.material.transparent = true;
          child.material.opacity = 0.9;
          child.material.toneMapped = false;
        }
      }
    });
  }, [scene]);

  return <primitive object={scene} />;
}
```

---

### Step 4: Add Animation

```jsx
import { Float } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

function AnimatedLogo() {
  const logoRef = useRef();
  const pointerSmooth = useRef({ x: 0, y: 0 });

  useFrame((state, delta) => {
    // Smooth pointer tracking
    pointerSmooth.current.x = MathUtils.damp(
      pointerSmooth.current.x,
      state.pointer.x,
      4,
      delta
    );
    pointerSmooth.current.y = MathUtils.damp(
      pointerSmooth.current.y,
      state.pointer.y,
      4,
      delta
    );

    // Apply tilt based on pointer
    if (logoRef.current) {
      logoRef.current.rotation.x = -pointerSmooth.current.y * 0.25;
      logoRef.current.rotation.y = pointerSmooth.current.x * 0.35;
    }
  });

  return (
    <Float
      speed={1.1}
      floatIntensity={0.9}
      rotationIntensity={0.35}
    >
      <group ref={logoRef}>
        <LogoModel />
      </group>
    </Float>
  );
}
```

---

## Lighting Diagram

```
                    Environment (#ff6400)
                           |
                           |
         Cool Fill         |        Warm Key
         (#ffffff)         |        (#ff6400)
              \            |            /
               \           |           /
                \          |          /
                 \         |         /
                  \        |        /
                   \       |       /
                    \      |      /
                     \     |     /
                      \    |    /
                       \   |   /
                        \  |  /
                         \ | /
                          \|/
                     [LOGO MODEL]
                           |
                           |
                    Contact Shadows
                    (opacity: 0.4)
```

---

## Color Temperature Breakdown

| Light Source | Color Code | RGB Values | Temperature |
|--------------|-----------|------------|-------------|
| Key Light | `#ff6400` | (255, 100, 0) | Warm Orange |
| Fill Light | `#ffffff` | (255, 255, 255) | Neutral White |
| Warm Env | `#ff6400` | (255, 100, 0) | Warm Orange |
| Cool Env | `#95A3B6` | (149, 163, 182) | Cool Gray-Blue |

**Theory:** The warm/cool contrast creates visual interest and depth. The warm orange establishes the primary mood while cool accents add sophistication.

---

## Tips for Customization

### Changing the Color Scheme

**For a Blue Theme:**
```jsx
<directionalLight color="#0066ff" intensity={2.4} position={[3, 4, 2]} />
<spotLight color="#ffffff" intensity={1} angle={0.45} position={[-3, 3, 2]} />

<Environment resolution={256}>
  <Lightformer intensity={4.4} color="#0066ff" position={[5, 4, 0]} scale={[6, 6, 1]} />
  <Lightformer intensity={1.6} color="#ff9966" position={[-4, 3, -2]} scale={[4, 4, 1]} />
</Environment>
```

**For a Neon/Cyberpunk Theme:**
```jsx
<directionalLight color="#ff00ff" intensity={3.0} position={[3, 4, 2]} />
<spotLight color="#00ffff" intensity={1.5} angle={0.45} position={[-3, 3, 2]} />
```

---

### Adjusting Material Reflectivity

**More Matte:**
```javascript
material.metalness = 0.3;
material.roughness = 0.6;
```

**More Reflective:**
```javascript
material.metalness = 0.8;
material.roughness = 0.05;
```

**Glass-like:**
```javascript
material.metalness = 0;
material.roughness = 0;
material.transmission = 1;
material.transparent = true;
```

---

### Performance Optimization

**Lower Environment Resolution:**
```jsx
<Environment resolution={128}>  {/* Was 256 */}
```

**Disable Contact Shadows on Mobile:**
```jsx
{!isMobile && (
  <ContactShadows position={[0, -0.85, 0]} opacity={0.4} scale={12} blur={2.2} />
)}
```

---

## Complete Scene Example

```jsx
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, ContactShadows, Float } from '@react-three/drei';
import { useGLTF } from '@react-three/drei';

function ThreeToolsLogoScene() {
  const { scene } = useGLTF('/assets/three-tools-logo.glb');

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.metalness = 0.55;
        child.material.roughness = 0.2;
      }
    });
  }, [scene]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight color="#ff6400" intensity={2.4} position={[3, 4, 2]} />
      <spotLight color="#ffffff" intensity={1} angle={0.45} position={[-3, 3, 2]} />

      <Environment resolution={256}>
        <Lightformer intensity={4.4} color="#ff6400" position={[5, 4, 0]} scale={[6, 6, 1]} />
        <Lightformer intensity={1.6} color="#95A3B6" position={[-4, 3, -2]} scale={[4, 4, 1]} />
      </Environment>

      {/* Model */}
      <Float speed={1.1} floatIntensity={0.9} rotationIntensity={0.35}>
        <primitive object={scene} />
      </Float>

      {/* Shadows */}
      <ContactShadows position={[0, -0.85, 0]} opacity={0.4} scale={12} blur={2.2} />
    </>
  );
}

export default function App() {
  return (
    <Canvas shadows camera={{ position: [0, 0, 25], fov: 10 }}>
      <color attach="background" args={['#050505']} />
      <ThreeToolsLogoScene />
    </Canvas>
  );
}
```

---

## Conclusion

This lighting setup creates a polished, professional 3D logo presentation with:

- **Warm/cool color contrast** for visual interest
- **Metallic materials** that reflect the environment
- **Soft shadows** for grounding
- **Environment lighting** for realistic reflections
- **Interactive animations** for engagement

The combination of directional, spot, and environment lights creates a sophisticated lighting scheme that works well for product visualization and hero sections.
