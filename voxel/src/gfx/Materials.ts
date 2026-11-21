// Chunk materials: Lambert + per-vertex sky/block light, AO, handheld torch light; custom reflective water.
import * as THREE from 'three';

export const shared = {
  uMinLight: { value: 0.035 },
  uTorch: { value: new THREE.Color(1.0, 0.72, 0.42) },
  uHandPos: { value: new THREE.Vector3() },
  uHandLight: { value: 0 },
  uTime: { value: 0 },
  uSkyTop: { value: new THREE.Color(0.3, 0.55, 0.95) },
  uSkyHorizon: { value: new THREE.Color(0.7, 0.82, 0.98) },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uDay: { value: 1 },
  uFogFlat: { value: 0 },
};

/** Fog that fades geometry into the sky gradient behind it (matches the sky dome's output). */
export const SKY_FOG = /* glsl */`
#ifdef USE_FOG
  {
    vec3 fdir = normalize(vWPos - cameraPosition);
    vec3 fc = mix(uSkyHorizon, uSkyTop, smoothstep(-0.02, 0.55, fdir.y));
    fc = mix(fc, uSkyHorizon * 0.55, smoothstep(0.0, -0.3, fdir.y));
    #ifdef TONE_MAPPING
      fc = toneMapping(fc);
    #endif
    fc = linearToOutputTexel(vec4(fc, 1.0)).rgb;
    fc = mix(fc, fogColor, uFogFlat);
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fc, fogFactor);
  }
#endif
`;

function inject(mat: THREE.Material) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMinLight = shared.uMinLight;
    sh.uniforms.uTorch = shared.uTorch;
    sh.uniforms.uHandPos = shared.uHandPos;
    sh.uniforms.uHandLight = shared.uHandLight;
    sh.uniforms.uSkyTop = shared.uSkyTop;
    sh.uniforms.uSkyHorizon = shared.uSkyHorizon;
    sh.uniforms.uFogFlat = shared.uFogFlat;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aLight;\nvarying vec2 vLight;\nvarying vec3 vWPos;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvLight = aLight;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLight;\nvarying vec3 vWPos;\nuniform float uMinLight;\nuniform vec3 uTorch;\nuniform vec3 uHandPos;\nuniform float uHandLight;\nuniform vec3 uSkyTop;\nuniform vec3 uSkyHorizon;\nuniform float uFogFlat;')
      .replace('#include <fog_fragment>', SKY_FOG)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float skyL = vLight.x * vLight.x;
        float blkL = pow(vLight.y, 1.7);
        float hd = distance(vWPos, uHandPos);
        blkL = max(blkL, uHandLight * pow(clamp(1.0 - hd / 11.0, 0.0, 1.0), 1.5));
        reflectedLight.directDiffuse *= skyL;
        reflectedLight.indirectDiffuse *= skyL;
        reflectedLight.indirectDiffuse += diffuseColor.rgb * (uTorch * blkL * 1.15 + vec3(uMinLight));`);
  };
}

export function makeChunkMaterials(atlas: THREE.Texture) {
  const opaque = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
  inject(opaque);
  const cutout = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.FrontSide });
  inject(cutout);
  const water = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      attribute vec2 aLight;
      uniform float uTime;
      varying vec2 vLight; varying vec3 vWPos; varying vec3 vN;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        if (normal.y > 0.5) wp.y += (sin(wp.x * 1.3 + uTime * 1.7) + cos(wp.z * 1.1 + uTime * 1.3)) * 0.025 - 0.06;
        vWPos = wp.xyz; vLight = aLight; vN = normal;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uSkyTop; uniform vec3 uSkyHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
      uniform float uDay; uniform float uMinLight; uniform vec3 uTorch; uniform vec3 uHandPos; uniform float uHandLight; uniform float uFogFlat;
      varying vec2 vLight; varying vec3 vWPos; varying vec3 vN;
      void main() {
        vec3 N = normalize(vN);
        if (N.y > 0.5) {
          vec2 p = vWPos.xz; float t = uTime;
          float nx = sin(p.x * 2.1 + t * 1.9) * 0.5 + sin(p.x * 0.7 + p.y * 1.3 + t * 1.1) * 0.5 + sin(p.y * 3.7 - t * 2.3) * 0.25;
          float nz = cos(p.y * 2.3 + t * 1.7) * 0.5 + cos(p.x * 1.1 - p.y * 0.6 + t * 1.3) * 0.5 + cos(p.x * 3.3 + t * 2.1) * 0.25;
          N = normalize(vec3(nx * 0.07, 1.0, nz * 0.07));
        }
        vec3 V = normalize(cameraPosition - vWPos);
        if (dot(V, N) < 0.0) N = -N;
        float sky = vLight.x * vLight.x;
        float hd = distance(vWPos, uHandPos);
        float blk = max(pow(vLight.y, 1.7), uHandLight * pow(clamp(1.0 - hd / 11.0, 0.0, 1.0), 1.5));
        float fres = 0.08 + 0.85 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 R = reflect(-V, N);
        vec3 refl = mix(uSkyHorizon, uSkyTop, clamp(R.y * 1.6, 0.0, 1.0));
        float spec = pow(max(dot(R, uSunDir), 0.0), 140.0) * 3.0 * sky;
        vec3 deep = vec3(0.04, 0.2, 0.36);
        vec3 lightCol = vec3(0.25 + 0.75 * uDay) * sky + uTorch * blk + vec3(uMinLight);
        float shimmer = 0.04 * sin(vWPos.x * 4.0 + uTime * 2.0) * sin(vWPos.z * 4.0 - uTime * 1.6);
        vec3 col = mix(deep * lightCol * (1.15 + shimmer), refl * sky * (0.35 + 0.65 * uDay) + deep * lightCol * 0.25, fres) + uSunColor * spec;
        gl_FragColor = vec4(col, mix(0.62, 0.93, fres));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        ${SKY_FOG}
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  water.uniforms.uTime = shared.uTime;
  water.uniforms.uSkyTop = shared.uSkyTop;
  water.uniforms.uSkyHorizon = shared.uSkyHorizon;
  water.uniforms.uSunDir = shared.uSunDir;
  water.uniforms.uSunColor = shared.uSunColor;
  water.uniforms.uDay = shared.uDay;
  water.uniforms.uMinLight = shared.uMinLight;
  water.uniforms.uTorch = shared.uTorch;
  water.uniforms.uHandPos = shared.uHandPos;
  water.uniforms.uHandLight = shared.uHandLight;
  water.uniforms.uFogFlat = shared.uFogFlat;
  return { opaque, cutout, water };
}
