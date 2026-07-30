import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { CockpitDisplays } from './CockpitDisplays';

/**
 * First-person cockpit in the Everspace architectural language:
 *  - two THICK angular A-pillars framing the view, with accent light strips
 *  - a wrap-around console of three angled panels whose displays show LIVE
 *    game data (target/ship status center, armament left, hold/systems right)
 *  - chunky top-corner frame slabs, amber rim lighting along the console
 *  - a subtle fresnel glass shell
 * Built around the eye at (0, 0.58, -0.55) looking -Z; the console tops stay
 * ~20° below the sightline so the canopy view remains open.
 */
export function buildCockpitMesh(accent: number, displays: CockpitDisplays): Group {
  const group = new Group();
  const accentColor = new Color(accent);

  const frameMat = new MeshStandardMaterial({
    color: 0x3a434e, metalness: 0.7, roughness: 0.35, flatShading: true,
  });
  const trimMat = new MeshStandardMaterial({
    color: 0x20262d, metalness: 0.55, roughness: 0.5, flatShading: true,
  });
  const bezelMat = new MeshStandardMaterial({ color: 0x11151a, metalness: 0.4, roughness: 0.6 });
  // Strip brightness stays BELOW the bloom threshold (~0.7 post-tonemap) —
  // they should read as lit trim, not light sabers.
  const amberStrip = new MeshBasicMaterial({ color: new Color(0xffa73d).multiplyScalar(0.6), toneMapped: false });
  const accentStrip = new MeshBasicMaterial({ color: accentColor.clone().multiplyScalar(0.5), toneMapped: false });
  const dimStrip = new MeshBasicMaterial({ color: accentColor.clone().multiplyScalar(0.2), toneMapped: false });

  const add = (mesh: Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mesh => {
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    group.add(mesh);
    return mesh;
  };

  // ---- canopy glass ---------------------------------------------------------

  const glass = new Mesh(
    new SphereGeometry(1.45, 24, 16),
    new ShaderMaterial({
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTint: { value: accentColor.clone().lerp(new Color(0x88bbdd), 0.6) } },
      vertexShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vViewDirW = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint;
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          float fresnel = pow(1.0 - abs(dot(vNormalW, vViewDirW)), 3.0);
          gl_FragColor = vec4(uTint, fresnel * 0.09);
        }
      `,
    }),
  );
  glass.position.set(0, 0.5, -0.7);
  glass.scale.set(1.15, 0.9, 1.5);
  group.add(glass);

  // ---- frame: thick A-pillars + top corner slabs ----------------------------

  // Thin pillars, pushed outboard — frame the view, don't eat it.
  const pillarGeo = new BoxGeometry(0.1, 1.85, 0.1);
  add(new Mesh(pillarGeo, frameMat), 0.97, 0.6, -1.35, 0.28, -0.12, -0.22);
  add(new Mesh(pillarGeo.clone(), frameMat), -0.97, 0.6, -1.35, 0.28, 0.12, 0.22);
  // Accent light strip along each pillar's inner face.
  const pillarStrip = new BoxGeometry(0.018, 1.7, 0.018);
  add(new Mesh(pillarStrip, accentStrip), 0.912, 0.6, -1.3, 0.28, -0.12, -0.22);
  add(new Mesh(pillarStrip.clone(), accentStrip), -0.912, 0.6, -1.3, 0.28, 0.12, 0.22);

  const cornerGeo = new BoxGeometry(0.68, 0.36, 0.1);
  add(new Mesh(cornerGeo, trimMat), 0.94, 1.24, -1.28, 0.35, 0, -0.5);
  add(new Mesh(cornerGeo.clone(), trimMat), -0.94, 1.24, -1.28, 0.35, 0, 0.5);

  // ---- wrap-around console --------------------------------------------------

  // Center pedestal with the TARGET/SHIP display mounted ON TOP, leaning back
  // toward the pilot (Everspace's raised center console).
  const screenTint = new Color(0.82, 0.82, 0.82); // keep displays under bloom
  add(new Mesh(new BoxGeometry(0.68, 0.38, 0.5), trimMat), 0, -0.12, -1.5, -0.12);
  add(new Mesh(new BoxGeometry(0.54, 0.3, 0.05), bezelMat), 0, 0.18, -1.46, -0.35);
  const centerScreen = new Mesh(
    new PlaneGeometry(0.48, 0.26),
    new MeshBasicMaterial({ map: displays.center, toneMapped: false, color: screenTint }),
  );
  add(centerScreen, 0, 0.18, -1.43, -0.35);
  // Amber rim strip across the display top.
  add(new Mesh(new BoxGeometry(0.58, 0.012, 0.025), amberStrip), 0, 0.325, -1.52, -0.35);

  // Side panels, angled toward the pilot, displays raised onto their tops.
  const sidePanelGeo = new BoxGeometry(0.56, 0.28, 0.46);
  add(new Mesh(sidePanelGeo, trimMat), 0.64, -0.16, -1.38, -0.12, -0.35, 0);
  add(new Mesh(sidePanelGeo.clone(), trimMat), -0.64, -0.16, -1.38, -0.12, 0.35, 0);
  const sideBezel = new BoxGeometry(0.44, 0.25, 0.05);
  add(new Mesh(sideBezel, bezelMat), 0.66, 0.1, -1.33, -0.38, -0.35, 0);
  add(new Mesh(sideBezel.clone(), bezelMat), -0.66, 0.1, -1.33, -0.38, 0.35, 0);
  const leftScreen = new Mesh(
    new PlaneGeometry(0.4, 0.21),
    new MeshBasicMaterial({ map: displays.left, toneMapped: false, color: screenTint }),
  );
  add(leftScreen, -0.655, 0.1, -1.3, -0.38, 0.35, 0);
  const rightScreen = new Mesh(
    new PlaneGeometry(0.4, 0.21),
    new MeshBasicMaterial({ map: displays.right, toneMapped: false, color: screenTint }),
  );
  add(rightScreen, 0.655, 0.1, -1.3, -0.38, -0.35, 0);
  // Amber rim strips along the side display tops.
  const sideRim = new BoxGeometry(0.48, 0.012, 0.025);
  add(new Mesh(sideRim, amberStrip), 0.665, 0.215, -1.39, -0.38, -0.35, 0);
  add(new Mesh(sideRim.clone(), amberStrip), -0.665, 0.215, -1.39, -0.38, 0.35, 0);

  // Outer wing panels wrapping toward the pilot's elbows (no screens).
  const outerGeo = new BoxGeometry(0.5, 0.24, 0.4);
  add(new Mesh(outerGeo, trimMat), 1.14, -0.26, -1.06, -0.1, -0.7, 0);
  add(new Mesh(outerGeo.clone(), trimMat), -1.14, -0.26, -1.06, -0.1, 0.7, 0);
  const outerRim = new BoxGeometry(0.44, 0.012, 0.025);
  add(new Mesh(outerRim, dimStrip), 1.12, -0.13, -0.96, -0.1, -0.7, 0);
  add(new Mesh(outerRim.clone(), dimStrip), -1.12, -0.13, -0.96, -0.1, 0.7, 0);

  // Small round gauge pods flanking the center display (ref: circular dials).
  const gaugeBody = new CylinderGeometry(0.04, 0.048, 0.05, 12);
  add(new Mesh(gaugeBody, bezelMat), 0.38, 0.26, -1.49, Math.PI / 2 - 0.35);
  add(new Mesh(gaugeBody.clone(), bezelMat), -0.38, 0.26, -1.49, Math.PI / 2 - 0.35);
  const gaugeDim = new MeshBasicMaterial({ color: accentColor.clone().multiplyScalar(0.09), toneMapped: false });
  const gaugeFace = new CylinderGeometry(0.024, 0.024, 0.055, 12);
  add(new Mesh(gaugeFace, gaugeDim), 0.38, 0.26, -1.488, Math.PI / 2 - 0.35);
  add(new Mesh(gaugeFace.clone(), gaugeDim), -0.38, 0.26, -1.488, Math.PI / 2 - 0.35);

  // Button greeble on the pedestal face below the center screen.
  for (let i = 0; i < 6; i++) {
    const key = new Mesh(
      new BoxGeometry(0.05, 0.012, 0.035),
      i % 3 === 0 ? amberStrip : dimStrip,
    );
    key.position.set(-0.15 + i * 0.06, -0.08, -1.22);
    key.rotation.x = -0.3;
    group.add(key);
  }

  // Throttle on the left outer panel.
  add(new Mesh(new BoxGeometry(0.05, 0.16, 0.05), frameMat), -1.05, 0.02, -1.0, 0.5, 0.5, 0.2);
  add(new Mesh(new SphereGeometry(0.045, 10, 8), bezelMat), -1.0, 0.11, -1.05);

  // Footwell kick panel so the bottom of frame is structure, not void.
  add(new Mesh(new BoxGeometry(2.0, 0.5, 0.12), trimMat), 0, -0.42, -1.45, 0.45);

  // ---- interior lighting ----------------------------------------------------

  const fill = new PointLight(accentColor.clone().lerp(new Color(1, 1, 1), 0.5), 0.5, 6, 1.2);
  fill.position.set(0, 0.95, -0.1);
  group.add(fill);
  const dashGlow = new PointLight(new Color(0xffa73d), 0.35, 2.0, 1.4);
  dashGlow.position.set(0, 0.3, -1.35);
  group.add(dashGlow);

  group.visible = false;
  return group;
}
