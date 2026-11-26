import * as THREE from 'three';
import { HEIGHTS, HN, HALF, SIZE, WATER_Y } from '../world/layout';

/**
 * One water surface for the whole map (ocean, river mouths, swamp ponds): Gerstner-style vertex waves,
 * analytic normals + ripple noise, Fresnel sky reflection, sun glint, shoreline foam and depth tint
 * computed from the terrain height texture. The mesh follows the camera (snapped) so detail stays near.
 */
export class Water {
  mesh: THREE.Mesh; mat: THREE.ShaderMaterial;
  constructor(segs: number) {
    const data = new Uint16Array(HN * HN); for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(HEIGHTS[i]);
    const htex = new THREE.DataTexture(data, HN, HN, THREE.RedFormat, THREE.HalfFloatType);
    htex.magFilter = THREE.LinearFilter; htex.minFilter = THREE.LinearFilter; htex.needsUpdate = true;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uT: { value: 0 }, uH: { value: null }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
        uSkyTop: { value: new THREE.Color(0.3, 0.5, 0.8) }, uSkyHor: { value: new THREE.Color(0.7, 0.8, 0.9) }, uNight: { value: 0 }, uWind: { value: 0.3 }, uCam: { value: new THREE.Vector3() }, uRain: { value: 0 },
      }]),
      vertexShader: `
        uniform float uT, uWind; uniform sampler2D uH; varying vec3 vW; varying float vDepth; varying vec3 vN;
        #include <fog_pars_vertex>
        vec3 wave(vec2 p, vec2 d, float A, float L, float S, inout vec3 nrm){ float k = 6.2831/L; float f = k*(dot(d,p) - S*uT); nrm.xz -= d * k*A*cos(f); return vec3(0., A*sin(f), 0.); }
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vec2 uv = ((w.xz + ${HALF.toFixed(1)}) / ${(SIZE / (HN - 1)).toFixed(1)} + 0.5) / ${HN.toFixed(1)};
          float g = texture2D(uH, uv).r; vDepth = ${WATER_Y.toFixed(2)} - g;
          float amp = clamp(vDepth / 4.0, 0.05, 1.0) * (0.35 + uWind);
          vec3 n = vec3(0.,1.,0.);
          vec3 off = wave(w.xz, normalize(vec2(-1.0, 0.2)), 0.35*amp, 38.0, 4.5, n) + wave(w.xz, normalize(vec2(-0.7,-0.7)), 0.18*amp, 17.0, 3.2, n) + wave(w.xz, normalize(vec2(-0.4, 0.9)), 0.12*amp, 9.0, 2.1, n);
          w.xyz += off; vW = w.xyz; vN = normalize(n);
          vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uT, uNight, uRain; uniform vec3 uSun, uSunCol, uSkyTop, uSkyHor, uCam; varying vec3 vW; varying float vDepth; varying vec3 vN;
        #include <fog_pars_fragment>
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          if (vDepth < -0.05) discard;
          vec2 p = vW.xz;
          float e = 0.6;
          float r1 = n2(p*0.35 + vec2(uT*0.6, uT*0.2)), r2 = n2(p*0.9 - vec2(uT*0.4, -uT*0.7)), r3 = n2(p*2.3 + uT*1.3);
          vec3 N = normalize(vN + vec3((r1 - 0.5)*0.35 + (r2-0.5)*0.22 + (r3-0.5)*0.1*(1.0+uRain*3.0), 0., (r2 - 0.5)*0.35 + (r1-0.5)*0.2));
          vec3 V = normalize(uCam - vW);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 R = reflect(-V, N);
          vec3 sky = mix(uSkyHor, uSkyTop, clamp(R.y * 1.6, 0.0, 1.0));
          vec3 deep = mix(vec3(0.0, 0.09, 0.14), vec3(0.0, 0.03, 0.05), uNight);
          vec3 shallow = mix(vec3(0.05, 0.42, 0.42), vec3(0.01, 0.08, 0.09), uNight);
          float dk = clamp(vDepth / 5.0, 0.0, 1.0);
          vec3 body = mix(shallow, deep, dk);
          float spec = pow(max(dot(R, uSun), 0.0), 220.0) * 6.0 + pow(max(dot(R, uSun), 0.0), 18.0) * 0.25;
          vec3 col = mix(body, sky, fres) + uSunCol * spec * (1.0 - uNight * 0.7);
          float foam = smoothstep(0.55, 0.0, vDepth) * (0.55 + 0.45 * n2(p * 0.8 + uT * 0.9));
          foam += smoothstep(0.75, 0.95, n2(p*0.12 + uT*0.05)) * 0.12 * dk;
          col = mix(col, vec3(0.9, 0.93, 0.95) * (1.0 - uNight*0.85), clamp(foam, 0.0, 1.0));
          float a = clamp(0.55 + dk * 0.45 + fres * 0.3 + foam, 0.0, 0.98);
          gl_FragColor = vec4(col, a);
          #include <fog_fragment>
        }`,
    });
    this.mat.uniforms.uH.value = htex;
    const g = new THREE.PlaneGeometry(1600, 1600, segs, segs).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.position.y = WATER_Y; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    // a far, flat ring so the ocean reaches the horizon
    const far = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000, 8, 8).rotateX(-Math.PI / 2), this.mat); far.position.y = -0.6; far.renderOrder = 0;
    this.mesh.add(far);
  }
  update(t: number, cam: THREE.Camera, sun: THREE.Vector3, sunCol: THREE.Color, fogCol: THREE.Color, night: number, wind: number, rain: number) {
    const s = 25; this.mesh.position.x = Math.round(cam.position.x / s) * s; this.mesh.position.z = Math.round(cam.position.z / s) * s;
    const u = this.mat.uniforms; u.uT.value = t; u.uSun.value.copy(sun); u.uSunCol.value.copy(sunCol); u.uNight.value = night; u.uWind.value = wind; u.uCam.value.copy(cam.position); u.uRain.value = rain;
    u.uSkyHor.value.copy(fogCol); u.uSkyTop.value.copy(fogCol).multiplyScalar(0.75).lerp(new THREE.Color(0.18, 0.38, 0.7).multiplyScalar(1 - night * 0.9), 0.5);
  }
}
