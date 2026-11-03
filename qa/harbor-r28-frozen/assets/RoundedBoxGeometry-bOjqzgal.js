import{M as Je,b9 as $e,v as et,w as Oe,x as F,a1 as O,g as S,O as K,U as q,a0 as Q,bn as tt,C as ce,h as Z,a8 as it,a9 as st,aa as at,ab as Ie,a2 as rt,a3 as Ve,a4 as Le,a5 as ot,a6 as nt,a7 as lt,V as T,_ as ht,bo as ut,bp as ct,$ as Qe,N as ft,Y as mt,bj as pt,bq as dt,br as vt,bs as gt,bt as xt,A as Mt,bu as bt,bv as Tt,bw as wt,y as _t,u as Ct,J as St}from"./reference-materials-CuD3KpNJ.js";const W={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};class H{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}}const yt=new $e(-1,1,1,-1,0,1);class Pt extends et{constructor(){super(),this.setAttribute("position",new Oe([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new Oe([0,2,0,0,2,0],2))}}const Dt=new Pt;class Te{constructor(e){this._mesh=new Je(Dt,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,yt)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}}class Ge extends H{constructor(e,t="tDiffuse"){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof F?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=O.clone(e.uniforms),this.material=new F({name:e.name!==void 0?e.name:"unspecified",defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new Te(this.material)}render(e,t,a){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=a.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}}class Ze extends H{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,a){const i=e.getContext(),s=e.state;s.buffers.color.setMask(!1),s.buffers.depth.setMask(!1),s.buffers.color.setLocked(!0),s.buffers.depth.setLocked(!0);let r,o;this.inverse?(r=0,o=1):(r=1,o=0),s.buffers.stencil.setTest(!0),s.buffers.stencil.setOp(i.REPLACE,i.REPLACE,i.REPLACE),s.buffers.stencil.setFunc(i.ALWAYS,r,4294967295),s.buffers.stencil.setClear(o),s.buffers.stencil.setLocked(!0),e.setRenderTarget(a),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),s.buffers.color.setLocked(!1),s.buffers.depth.setLocked(!1),s.buffers.color.setMask(!0),s.buffers.depth.setMask(!0),s.buffers.stencil.setLocked(!1),s.buffers.stencil.setFunc(i.EQUAL,1,4294967295),s.buffers.stencil.setOp(i.KEEP,i.KEEP,i.KEEP),s.buffers.stencil.setLocked(!0)}}class Rt extends H{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}}class Ut{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){const a=e.getSize(new S);this._width=a.width,this._height=a.height,t=new K(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:q}),t.texture.name="EffectComposer.rt1"}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Ge(W),this.copyPass.material.blending=Q,this.timer=new tt}swapBuffers(){const e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){const t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());const t=this.renderer.getRenderTarget();let a=!1;for(let i=0,s=this.passes.length;i<s;i++){const r=this.passes[i];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(i),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,a),r.needsSwap){if(a){const o=this.renderer.getContext(),l=this.renderer.state.buffers.stencil;l.setFunc(o.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),l.setFunc(o.EQUAL,1,4294967295)}this.swapBuffers()}Ze!==void 0&&(r instanceof Ze?a=!0:r instanceof Rt&&(a=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){const t=this.renderer.getSize(new S);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;const a=this._width*this._pixelRatio,i=this._height*this._pixelRatio;this.renderTarget1.setSize(a,i),this.renderTarget2.setSize(a,i);for(let s=0;s<this.passes.length;s++)this.passes[s].setSize(a,i)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}}class Ft extends H{constructor(e,t,a=null,i=null,s=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=a,this.clearColor=i,this.clearAlpha=s,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new ce}render(e,t,a){const i=e.autoClear;e.autoClear=!1;let s,r;this.overrideMaterial!==null&&(r=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(s=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:a),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(s),this.overrideMaterial!==null&&(this.scene.overrideMaterial=r),e.autoClear=i}}class Et{constructor(e=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let t=0;t<256;t++)this.p[t]=Math.floor(e.random()*256);this.perm=[];for(let t=0;t<512;t++)this.perm[t]=this.p[t&255];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}noise(e,t){let a,i,s;const r=.5*(Math.sqrt(3)-1),o=(e+t)*r,l=Math.floor(e+o),n=Math.floor(t+o),h=(3-Math.sqrt(3))/6,m=(l+n)*h,w=l-m,f=n-m,_=e-w,u=t-f;let P,p;_>u?(P=1,p=0):(P=0,p=1);const c=_-P+h,b=u-p+h,M=_-1+2*h,D=u-1+2*h,R=l&255,E=n&255,N=this.perm[R+this.perm[E]]%12,d=this.perm[R+P+this.perm[E+p]]%12,v=this.perm[R+1+this.perm[E+1]]%12;let g=.5-_*_-u*u;g<0?a=0:(g*=g,a=g*g*this._dot(this.grad3[N],_,u));let x=.5-c*c-b*b;x<0?i=0:(x*=x,i=x*x*this._dot(this.grad3[d],c,b));let U=.5-M*M-D*D;return U<0?s=0:(U*=U,s=U*U*this._dot(this.grad3[v],M,D)),70*(a+i+s)}noise3d(e,t,a){let i,s,r,o;const n=(e+t+a)*.3333333333333333,h=Math.floor(e+n),m=Math.floor(t+n),w=Math.floor(a+n),f=1/6,_=(h+m+w)*f,u=h-_,P=m-_,p=w-_,c=e-u,b=t-P,M=a-p;let D,R,E,N,d,v;c>=b?b>=M?(D=1,R=0,E=0,N=1,d=1,v=0):c>=M?(D=1,R=0,E=0,N=1,d=0,v=1):(D=0,R=0,E=1,N=1,d=0,v=1):b<M?(D=0,R=0,E=1,N=0,d=1,v=1):c<M?(D=0,R=1,E=0,N=0,d=1,v=1):(D=0,R=1,E=0,N=1,d=1,v=0);const g=c-D+f,x=b-R+f,U=M-E+f,X=c-N+2*f,Y=b-d+2*f,J=M-v+2*f,$=c-1+3*f,ee=b-1+3*f,C=M-1+3*f,I=h&255,V=m&255,L=w&255,me=this.perm[I+this.perm[V+this.perm[L]]]%12,pe=this.perm[I+D+this.perm[V+R+this.perm[L+E]]]%12,de=this.perm[I+N+this.perm[V+d+this.perm[L+v]]]%12,ve=this.perm[I+1+this.perm[V+1+this.perm[L+1]]]%12;let k=.6-c*c-b*b-M*M;k<0?i=0:(k*=k,i=k*k*this._dot3(this.grad3[me],c,b,M));let z=.6-g*g-x*x-U*U;z<0?s=0:(z*=z,s=z*z*this._dot3(this.grad3[pe],g,x,U));let j=.6-X*X-Y*Y-J*J;j<0?r=0:(j*=j,r=j*j*this._dot3(this.grad3[de],X,Y,J));let B=.6-$*$-ee*ee-C*C;return B<0?o=0:(B*=B,o=B*B*this._dot3(this.grad3[ve],$,ee,C)),32*(i+s+r+o)}noise4d(e,t,a,i){const s=this.grad4,r=this.simplex,o=this.perm,l=(Math.sqrt(5)-1)/4,n=(5-Math.sqrt(5))/20;let h,m,w,f,_;const u=(e+t+a+i)*l,P=Math.floor(e+u),p=Math.floor(t+u),c=Math.floor(a+u),b=Math.floor(i+u),M=(P+p+c+b)*n,D=P-M,R=p-M,E=c-M,N=b-M,d=e-D,v=t-R,g=a-E,x=i-N,U=d>v?32:0,X=d>g?16:0,Y=v>g?8:0,J=d>x?4:0,$=v>x?2:0,ee=g>x?1:0,C=U+X+Y+J+$+ee,I=r[C][0]>=3?1:0,V=r[C][1]>=3?1:0,L=r[C][2]>=3?1:0,me=r[C][3]>=3?1:0,pe=r[C][0]>=2?1:0,de=r[C][1]>=2?1:0,ve=r[C][2]>=2?1:0,k=r[C][3]>=2?1:0,z=r[C][0]>=1?1:0,j=r[C][1]>=1?1:0,B=r[C][2]>=1?1:0,Be=r[C][3]>=1?1:0,we=d-I+n,_e=v-V+n,Ce=g-L+n,Se=x-me+n,ye=d-pe+2*n,Pe=v-de+2*n,De=g-ve+2*n,Re=x-k+2*n,Ee=d-z+3*n,Ne=v-j+3*n,Ae=g-B+3*n,Ue=x-Be+3*n,Fe=d-1+4*n,ke=v-1+4*n,ze=g-1+4*n,je=x-1+4*n,te=P&255,ie=p&255,se=c&255,ae=b&255,He=o[te+o[ie+o[se+o[ae]]]]%32,Ke=o[te+I+o[ie+V+o[se+L+o[ae+me]]]]%32,qe=o[te+pe+o[ie+de+o[se+ve+o[ae+k]]]]%32,Xe=o[te+z+o[ie+j+o[se+B+o[ae+Be]]]]%32,Ye=o[te+1+o[ie+1+o[se+1+o[ae+1]]]]%32;let re=.6-d*d-v*v-g*g-x*x;re<0?h=0:(re*=re,h=re*re*this._dot4(s[He],d,v,g,x));let oe=.6-we*we-_e*_e-Ce*Ce-Se*Se;oe<0?m=0:(oe*=oe,m=oe*oe*this._dot4(s[Ke],we,_e,Ce,Se));let ne=.6-ye*ye-Pe*Pe-De*De-Re*Re;ne<0?w=0:(ne*=ne,w=ne*ne*this._dot4(s[qe],ye,Pe,De,Re));let le=.6-Ee*Ee-Ne*Ne-Ae*Ae-Ue*Ue;le<0?f=0:(le*=le,f=le*le*this._dot4(s[Xe],Ee,Ne,Ae,Ue));let he=.6-Fe*Fe-ke*ke-ze*ze-je*je;return he<0?_=0:(he*=he,_=he*he*this._dot4(s[Ye],Fe,ke,ze,je)),27*(h+m+w+f+_)}_dot(e,t,a){return e[0]*t+e[1]*a}_dot3(e,t,a,i){return e[0]*t+e[1]*a+e[2]*i}_dot4(e,t,a,i,s){return e[0]*t+e[1]*a+e[2]*i+e[3]*s}}const ge={defines:{PERSPECTIVE_CAMERA:1,KERNEL_SIZE:32},uniforms:{tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},kernel:{value:null},cameraNear:{value:null},cameraFar:{value:null},resolution:{value:new S},cameraProjectionMatrix:{value:new Z},cameraInverseProjectionMatrix:{value:new Z},kernelRadius:{value:8},minDistance:{value:.005},maxDistance:{value:.05}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`
		uniform highp sampler2D tNormal;
		uniform highp sampler2D tDepth;
		uniform sampler2D tNoise;

		uniform vec3 kernel[ KERNEL_SIZE ];

		uniform vec2 resolution;

		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraInverseProjectionMatrix;

		uniform float kernelRadius;
		uniform float minDistance; // avoid artifacts caused by neighbour fragments with minimal depth difference
		uniform float maxDistance; // avoid the influence of fragments which are too far away

		varying vec2 vUv;

		#include <packing>

		#ifdef USE_REVERSED_DEPTH_BUFFER

			const float depthThreshold = 0.0;

		#else

			const float depthThreshold = 1.0;

		#endif

		float getDepth( const in vec2 screenPosition ) {

			return texture2D( tDepth, screenPosition ).x;

		}

		float getLinearDepth( const in vec2 screenPosition ) {

			#if PERSPECTIVE_CAMERA == 1

				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );

			#else

				return texture2D( tDepth, screenPosition ).x;

			#endif

		}

		float getViewZ( const in float depth ) {

			#if PERSPECTIVE_CAMERA == 1

				return perspectiveDepthToViewZ( depth, cameraNear, cameraFar );

			#else

				return orthographicDepthToViewZ( depth, cameraNear, cameraFar );

			#endif

		}

		vec3 getViewPosition( const in vec2 screenPosition, const in float depth, const in float viewZ ) {

			float clipW = cameraProjectionMatrix[2][3] * viewZ + cameraProjectionMatrix[3][3];

			vec4 clipPosition = vec4( ( vec3( screenPosition, depth ) - 0.5 ) * 2.0, 1.0 );

			clipPosition *= clipW; // unprojection.

			return ( cameraInverseProjectionMatrix * clipPosition ).xyz;

		}

		vec3 getViewNormal( const in vec2 screenPosition ) {

			return unpackRGBToNormal( texture2D( tNormal, screenPosition ).xyz );

		}

		void main() {

			float depth = getDepth( vUv );

			if ( depth == depthThreshold ) {

				gl_FragColor = vec4( 1.0 ); // don't influence background

			} else {

				float viewZ = getViewZ( depth );

				vec3 viewPosition = getViewPosition( vUv, depth, viewZ );
				vec3 viewNormal = getViewNormal( vUv );

				vec2 noiseScale = vec2( resolution.x / 4.0, resolution.y / 4.0 );
				vec3 random = vec3( texture2D( tNoise, vUv * noiseScale ).r );

				// compute matrix used to reorient a kernel vector

				vec3 tangent = normalize( random - viewNormal * dot( random, viewNormal ) );
				vec3 bitangent = cross( viewNormal, tangent );
				mat3 kernelMatrix = mat3( tangent, bitangent, viewNormal );

				float occlusion = 0.0;

				for ( int i = 0; i < KERNEL_SIZE; i ++ ) {

					vec3 sampleVector = kernelMatrix * kernel[ i ]; // reorient sample vector in view space
					vec3 samplePoint = viewPosition + ( sampleVector * kernelRadius ); // calculate sample point

					vec4 samplePointNDC = cameraProjectionMatrix * vec4( samplePoint, 1.0 ); // project point and calculate NDC
					samplePointNDC /= samplePointNDC.w;

					vec2 samplePointUv = samplePointNDC.xy * 0.5 + 0.5; // compute uv coordinates

					float realDepth = getLinearDepth( samplePointUv ); // get linear depth from depth texture
					float sampleDepth = viewZToOrthographicDepth( samplePoint.z, cameraNear, cameraFar ); // compute linear depth of the sample view Z value
					float delta = sampleDepth - realDepth;

					if ( delta > minDistance && delta < maxDistance ) { // if fragment is before sample point, increase occlusion

						occlusion += 1.0;

					}

				}

				occlusion = clamp( occlusion / float( KERNEL_SIZE ), 0.0, 1.0 );

				gl_FragColor = vec4( vec3( 1.0 - occlusion ), 1.0 );

			}

		}`},xe={defines:{PERSPECTIVE_CAMERA:1},uniforms:{tDepth:{value:null},cameraNear:{value:null},cameraFar:{value:null}},vertexShader:`varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`uniform sampler2D tDepth;

		uniform float cameraNear;
		uniform float cameraFar;

		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 screenPosition ) {

			#if PERSPECTIVE_CAMERA == 1

				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );

			#else

				return texture2D( tDepth, screenPosition ).x;

			#endif

		}

		void main() {

			float depth = getLinearDepth( vUv );
			gl_FragColor = vec4( vec3( 1.0 - depth ), 1.0 );

		}`},Me={uniforms:{tDiffuse:{value:null},resolution:{value:new S}},vertexShader:`varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`uniform sampler2D tDiffuse;

		uniform vec2 resolution;

		varying vec2 vUv;

		void main() {

			vec2 texelSize = ( 1.0 / resolution );
			float result = 0.0;

			for ( int i = - 2; i <= 2; i ++ ) {

				for ( int j = - 2; j <= 2; j ++ ) {

					vec2 offset = ( vec2( float( i ), float( j ) ) ) * texelSize;
					result += texture2D( tDiffuse, vUv + offset ).r;

				}

			}

			gl_FragColor = vec4( vec3( result / ( 5.0 * 5.0 ) ), 1.0 );

		}`};class G extends H{constructor(e,t,a=512,i=512,s=32){super(),this.width=a,this.height=i,this.clear=!0,this.needsSwap=!1,this.camera=t,this.scene=e,this.kernelRadius=8,this.kernel=[],this.noiseTexture=null,this.output=0,this.minDistance=.005,this.maxDistance=.1,this._visibilityCache=[],this._generateSampleKernel(s),this._generateRandomKernelRotations();const r=new it;r.format=st,r.type=at,this.normalRenderTarget=new K(this.width,this.height,{minFilter:Ie,magFilter:Ie,type:q,depthTexture:r}),this.ssaoRenderTarget=new K(this.width,this.height,{type:q,depthBuffer:!1}),this.blurRenderTarget=this.ssaoRenderTarget.clone(),this.ssaoMaterial=new F({defines:Object.assign({},ge.defines),uniforms:O.clone(ge.uniforms),vertexShader:ge.vertexShader,fragmentShader:ge.fragmentShader,blending:Q}),this.ssaoMaterial.defines.KERNEL_SIZE=s,this.ssaoMaterial.uniforms.tNormal.value=this.normalRenderTarget.texture,this.ssaoMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture,this.ssaoMaterial.uniforms.tNoise.value=this.noiseTexture,this.ssaoMaterial.uniforms.kernel.value=this.kernel,this.ssaoMaterial.uniforms.cameraNear.value=this.camera.near,this.ssaoMaterial.uniforms.cameraFar.value=this.camera.far,this.ssaoMaterial.uniforms.resolution.value.set(this.width,this.height),this.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse),this.normalMaterial=new rt,this.normalMaterial.blending=Q,this.blurMaterial=new F({defines:Object.assign({},Me.defines),uniforms:O.clone(Me.uniforms),vertexShader:Me.vertexShader,fragmentShader:Me.fragmentShader}),this.blurMaterial.uniforms.tDiffuse.value=this.ssaoRenderTarget.texture,this.blurMaterial.uniforms.resolution.value.set(this.width,this.height),this.depthRenderMaterial=new F({defines:Object.assign({},xe.defines),uniforms:O.clone(xe.uniforms),vertexShader:xe.vertexShader,fragmentShader:xe.fragmentShader,blending:Q}),this.depthRenderMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture,this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.copyMaterial=new F({uniforms:O.clone(W.uniforms),vertexShader:W.vertexShader,fragmentShader:W.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blendSrc:nt,blendDst:Le,blendEquation:Ve,blendSrcAlpha:ot,blendDstAlpha:Le,blendEquationAlpha:Ve}),this._fsQuad=new Te(null),this._originalClearColor=new ce}dispose(){this.normalRenderTarget.dispose(),this.ssaoRenderTarget.dispose(),this.blurRenderTarget.dispose(),this.normalMaterial.dispose(),this.blurMaterial.dispose(),this.copyMaterial.dispose(),this.depthRenderMaterial.dispose(),this._fsQuad.dispose()}render(e,t,a){switch(this._overrideVisibility(),this._renderOverride(e,this.normalMaterial,this.normalRenderTarget,7829503,1),this._restoreVisibility(),this.ssaoMaterial.uniforms.kernelRadius.value=this.kernelRadius,this.ssaoMaterial.uniforms.minDistance.value=this.minDistance,this.ssaoMaterial.uniforms.maxDistance.value=this.maxDistance,this._renderPass(e,this.ssaoMaterial,this.ssaoRenderTarget),this._renderPass(e,this.blurMaterial,this.blurRenderTarget),this.output){case G.OUTPUT.SSAO:this.copyMaterial.uniforms.tDiffuse.value=this.ssaoRenderTarget.texture,this.copyMaterial.blending=Q,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:a);break;case G.OUTPUT.Blur:this.copyMaterial.uniforms.tDiffuse.value=this.blurRenderTarget.texture,this.copyMaterial.blending=Q,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:a);break;case G.OUTPUT.Depth:this._renderPass(e,this.depthRenderMaterial,this.renderToScreen?null:a);break;case G.OUTPUT.Normal:this.copyMaterial.uniforms.tDiffuse.value=this.normalRenderTarget.texture,this.copyMaterial.blending=Q,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:a);break;case G.OUTPUT.Default:this.copyMaterial.uniforms.tDiffuse.value=this.blurRenderTarget.texture,this.copyMaterial.blending=lt,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:a);break;default:console.warn("THREE.SSAOPass: Unknown output type.")}}setSize(e,t){this.width=e,this.height=t,this.ssaoRenderTarget.setSize(e,t),this.normalRenderTarget.setSize(e,t),this.blurRenderTarget.setSize(e,t),this.ssaoMaterial.uniforms.resolution.value.set(e,t),this.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse),this.blurMaterial.uniforms.resolution.value.set(e,t)}_renderPass(e,t,a,i,s){e.getClearColor(this._originalClearColor);const r=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(a),e.autoClear=!1,i!=null&&(e.setClearColor(i),e.setClearAlpha(s||0),e.clear()),this._fsQuad.material=t,this._fsQuad.render(e),e.autoClear=o,e.setClearColor(this._originalClearColor),e.setClearAlpha(r)}_renderOverride(e,t,a,i,s){e.getClearColor(this._originalClearColor);const r=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(a),e.autoClear=!1,i=t.clearColor||i,s=t.clearAlpha||s,i!=null&&(e.setClearColor(i),e.setClearAlpha(s||0),e.clear()),this.scene.overrideMaterial=t,e.render(this.scene,this.camera),this.scene.overrideMaterial=null,e.autoClear=o,e.setClearColor(this._originalClearColor),e.setClearAlpha(r)}_generateSampleKernel(e){const t=this.kernel;for(let a=0;a<e;a++){const i=new T;i.x=Math.random()*2-1,i.y=Math.random()*2-1,i.z=Math.random(),i.normalize();let s=a/e;s=ft.lerp(.1,1,s*s),i.multiplyScalar(s),t.push(i)}}_generateRandomKernelRotations(){const a=new Et,i=4*4,s=new Float32Array(i);for(let r=0;r<i;r++){const o=Math.random()*2-1,l=Math.random()*2-1,n=0;s[r]=a.noise3d(o,l,n)}this.noiseTexture=new ht(s,4,4,ut,ct),this.noiseTexture.wrapS=Qe,this.noiseTexture.wrapT=Qe,this.noiseTexture.needsUpdate=!0}_overrideVisibility(){const e=this.scene,t=this._visibilityCache;e.traverse(function(a){(a.isPoints||a.isLine||a.isLine2)&&a.visible&&(a.visible=!1,t.push(a))})}_restoreVisibility(){const e=this._visibilityCache;for(let t=0;t<e.length;t++)e[t].visible=!0;e.length=0}}G.OUTPUT={Default:0,SSAO:1,Blur:2,Depth:3,Normal:4};const be={name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`};class kt extends H{constructor(){super(),this.isOutputPass=!0,this.uniforms=O.clone(be.uniforms),this.material=new mt({name:be.name,uniforms:this.uniforms,vertexShader:be.vertexShader,fragmentShader:be.fragmentShader}),this._fsQuad=new Te(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,a){this.uniforms.tDiffuse.value=a.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},pt.getTransfer(this._outputColorSpace)===dt&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===vt?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===gt?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===xt?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===Mt?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===bt?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===Tt?this.material.defines.NEUTRAL_TONE_MAPPING="":this._toneMapping===wt&&(this.material.defines.CUSTOM_TONE_MAPPING=""),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}}const Nt={uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new ce(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`};class fe extends H{constructor(e,t=1,a,i){super(),this.strength=t,this.radius=a,this.threshold=i,this.resolution=e!==void 0?new S(e.x,e.y):new S(256,256),this.clearColor=new ce(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let s=Math.round(this.resolution.x/2),r=Math.round(this.resolution.y/2);this.renderTargetBright=new K(s,r,{type:q,depthBuffer:!1}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let h=0;h<this.nMips;h++){const m=new K(s,r,{type:q,depthBuffer:!1});m.texture.name="UnrealBloomPass.h"+h,m.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(m);const w=new K(s,r,{type:q,depthBuffer:!1});w.texture.name="UnrealBloomPass.v"+h,w.texture.generateMipmaps=!1,this.renderTargetsVertical.push(w),s=Math.round(s/2),r=Math.round(r/2)}const o=Nt;this.highPassUniforms=O.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=i,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new F({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];const l=[6,10,14,18,22];s=Math.round(this.resolution.x/2),r=Math.round(this.resolution.y/2);for(let h=0;h<this.nMips;h++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(l[h])),this.separableBlurMaterials[h].uniforms.invSize.value=new S(1/s,1/r),s=Math.round(s/2),r=Math.round(r/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;const n=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=n,this.bloomTintColors=[new T(1,1,1),new T(1,1,1),new T(1,1,1),new T(1,1,1),new T(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=O.clone(W.uniforms),this.blendMaterial=new F({uniforms:this.copyUniforms,vertexShader:W.vertexShader,fragmentShader:W.fragmentShader,premultipliedAlpha:!0,blending:_t,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new ce,this._oldClearAlpha=1,this._basic=new Ct,this._fsQuad=new Te(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let a=Math.round(e/2),i=Math.round(t/2);this.renderTargetBright.setSize(a,i);for(let s=0;s<this.nMips;s++)this.renderTargetsHorizontal[s].setSize(a,i),this.renderTargetsVertical[s].setSize(a,i),this.separableBlurMaterials[s].uniforms.invSize.value=new S(1/a,1/i),a=Math.round(a/2),i=Math.round(i/2)}render(e,t,a,i,s){e.getClearColor(this._oldClearColor),this._oldClearAlpha=e.getClearAlpha();const r=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0),s&&e.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=a.texture,e.setRenderTarget(null),e.clear(),this._fsQuad.render(e)),this.highPassUniforms.tDiffuse.value=a.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),this._fsQuad.render(e);let o=this.renderTargetBright;for(let l=0;l<this.nMips;l++)this._fsQuad.material=this.separableBlurMaterials[l],this.separableBlurMaterials[l].uniforms.colorTexture.value=o.texture,this.separableBlurMaterials[l].uniforms.direction.value=fe.BlurDirectionX,e.setRenderTarget(this.renderTargetsHorizontal[l]),e.clear(),this._fsQuad.render(e),this.separableBlurMaterials[l].uniforms.colorTexture.value=this.renderTargetsHorizontal[l].texture,this.separableBlurMaterials[l].uniforms.direction.value=fe.BlurDirectionY,e.setRenderTarget(this.renderTargetsVertical[l]),e.clear(),this._fsQuad.render(e),o=this.renderTargetsVertical[l];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),this._fsQuad.render(e),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,s&&e.state.buffers.stencil.setTest(!0),this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(a),this._fsQuad.render(e)),e.setClearColor(this._oldClearColor,this._oldClearAlpha),e.autoClear=r}_getSeparableBlurMaterial(e){const t=[],a=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(a*a))/a);const i=[],s=[];for(let r=1;r<e;r+=2){const o=t[r],l=r+1<e?t[r+1]:0,n=o+l;i.push((r*o+(r+1)*l)/n),s.push(n)}return new F({defines:{KERNEL_PAIRS:i.length},uniforms:{colorTexture:{value:null},invSize:{value:new S(.5,.5)},direction:{value:new S(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:i},gaussianWeights:{value:s}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float centerWeight;
				uniform float gaussianOffsets[KERNEL_PAIRS];
				uniform float gaussianWeights[KERNEL_PAIRS];

				void main() {

					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * centerWeight;

					for ( int i = 0; i < KERNEL_PAIRS; i ++ ) {

						vec2 uvOffset = direction * invSize * gaussianOffsets[ i ];
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * gaussianWeights[ i ];

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(e){return new F({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}}fe.BlurDirectionX=new S(1,0);fe.BlurDirectionY=new S(0,1);function zt(y,e,t,a=[]){const i=new Ge({uniforms:{tDiffuse:{value:null},tDepth:{value:t},inverseProjection:{value:new Z},cameraWorld:{value:new Z},eye:{value:new T},lightPosition:{value:new T},lightDirection:{value:new T},lightCone:{value:new S},lightRange:{value:32},lightColor:{value:e.color.clone()},power:{value:1},harbor:{value:a.length?1:0},keyPosition:{value:[new T,new T]},keyDirection:{value:[new T,new T]},keyPower:{value:[0,0]},keyCone:{value:[new S(.83,.97),new S(.83,.97)]},shadow0:{value:null},shadow1:{value:null},shadowReady:{value:new S},shadowMatrix:{value:[new Z,new Z]}},vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:`
    #include <packing>
    varying vec2 vUv;uniform sampler2D tDiffuse,tDepth;uniform highp sampler2DShadow shadow0,shadow1;uniform mat4 inverseProjection,cameraWorld,shadowMatrix[2];uniform vec3 eye,lightPosition,lightDirection;uniform float power,harbor,lightRange;uniform vec2 lightCone;uniform vec3 lightColor;uniform vec3 keyPosition[2],keyDirection[2];uniform vec2 keyCone[2],shadowReady;uniform float keyPower[2];
    float visibility(vec3 p,int k){
      if((k==0?shadowReady.x:shadowReady.y)<.5)return 1.;
      vec4 projected=shadowMatrix[k]*vec4(p,1.);vec3 uv=projected.xyz/projected.w;
      if(projected.w<=0.||uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.||uv.z>1.)return 0.;
      uv.z-=.001;
      return k==0?texture(shadow0,uv):texture(shadow1,uv);
    }
    void main(){float depth=texture2D(tDepth,vUv).r;vec4 view=inverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);view/=view.w;float dist=min(length(view.xyz),lightRange+2.);vec3 ray=normalize(mat3(cameraWorld)*view.xyz);float integral=0.;float delta=dist/32.;float jitter=harbor>.5?.5:fract(sin(dot(gl_FragCoord.xy,vec2(12.98,78.23)))*43758.5);
    for(int i=0;i<32;i++){float s=(float(i)+jitter)*delta;vec3 p=eye+ray*s;vec3 l=p-lightPosition;float d=length(l);float cone=smoothstep(lightCone.x,lightCone.y,dot(l/max(d,.001),lightDirection));float density=(.75+.25*sin(p.x*2.1+p.y*1.7)*sin(p.z*1.3))*(harbor>.5?smoothstep(1.8,5.5,s):smoothstep(.25,1.2,s));float rangeFade=pow(clamp(1.-pow(d/lightRange,4.),0.,1.),2.);integral+=density*cone*rangeFade*exp(-.13*(s+d))*delta/(1.+d*d*.14);}
    vec3 base=texture2D(tDiffuse,vUv).rgb;vec3 color=base*exp(-dist*vec3(.031,.012,.005));color+=lightColor*vec3(.68,.83,.88)*integral*1.5*power;
    if(harbor>.5){float path=min(length(view.xyz),48.);float stepSize=path/64.;float shafts=0.;for(int j=0;j<64;j++){float s=(float(j)+jitter)*stepSize;vec3 p=eye+ray*s;for(int k=0;k<2;k++){vec3 l=p-keyPosition[k];float d=length(l);float cone=smoothstep(keyCone[k].x,keyCone[k].y,dot(normalize(l),keyDirection[k]));if(cone>.001){float amount=cone*exp(-.045*s-.10*d)*stepSize*keyPower[k]/(1.+d*d*.08);shafts+=visibility(p,k)*amount;}}}color+=vec3(.16,.24,.23)*shafts*.11;}
    gl_FragColor=vec4(color,1.);}`});i.uniforms.tDepth.value=t,i.uniforms.lampShadow={value:null},i.uniforms.lampShadowReady={value:0},i.uniforms.lampShadowMatrix={value:new Z},i.material.fragmentShader=i.material.fragmentShader.replace("#include <packing>",`#include <packing>
      uniform highp sampler2DShadow lampShadow;
      uniform float lampShadowReady;
      uniform mat4 lampShadowMatrix;
      float lampVisibility(vec3 p) {
        if(lampShadowReady < .5) return 1.;
        vec4 q = lampShadowMatrix * vec4(p, 1.);
        vec3 uv = q.xyz / q.w;
        if(q.w <= 0. || uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1. || uv.z > 1.) return 0.;
        return texture(lampShadow, vec3(uv.xy, uv.z - .0005));
      }`).replace("integral+=density*cone*","integral+=density*cone*lampVisibility(p)*");const s=i.render;return i.render=function(...r){const o=e.shadow.map?.depthTexture;i.uniforms.lampShadowReady.value=o?1:0,i.uniforms.lampShadow.value=o??null,i.uniforms.lampShadowMatrix.value.copy(e.shadow.matrix);for(let l=0;l<2;l++){const n=a[l],h=n?.shadow.map?.depthTexture;i.uniforms.shadowReady.value.setComponent(l,h?1:0),i.uniforms[l===0?"shadow0":"shadow1"].value=h??null,n&&i.uniforms.shadowMatrix.value[l].copy(n.shadow.matrix)}return s.apply(this,r)},{pass:i,update(r){i.uniforms.inverseProjection.value.copy(y.projectionMatrixInverse),i.uniforms.cameraWorld.value.copy(y.matrixWorld),i.uniforms.eye.value.copy(y.position),i.uniforms.lightPosition.value.copy(e.position),i.uniforms.lightDirection.value.subVectors(e.target.position,e.position).normalize(),i.uniforms.power.value=e.intensity>0?r:0,i.uniforms.lightCone.value.set(Math.cos(e.angle),Math.cos(e.angle*(1-e.penumbra))),i.uniforms.lightRange.value=e.distance>0?e.distance:48,i.uniforms.lightColor.value.copy(e.color);for(let o=0;o<2;o++){const l=a[o];l&&(i.uniforms.keyPosition.value[o].copy(l.position),i.uniforms.keyDirection.value[o].subVectors(l.target.position,l.position).normalize(),i.uniforms.keyPower.value[o]=Math.min(l.intensity/230,3),i.uniforms.keyCone.value[o].set(Math.cos(l.angle),Math.cos(l.angle*(1-l.penumbra))))}}}}const ue=new T;function A(y,e,t,a,i,s){const r=2*Math.PI*i/4,o=Math.max(s-2*i,0),l=Math.PI/4;ue.copy(e),ue[a]=0,ue.normalize();const n=.5*r/(r+o),h=1-ue.angleTo(y)/l;return Math.sign(ue[t])===1?h*n:o/(r+o)+n+n*(1-h)}class We extends St{constructor(e=1,t=1,a=1,i=2,s=.1){const r=i*2+1;if(s=Math.min(e/2,t/2,a/2,s),super(1,1,1,r,r,r),this.type="RoundedBoxGeometry",this.parameters={width:e,height:t,depth:a,segments:i,radius:s},r===1)return;const o=this.toNonIndexed();this.index=null,this.attributes.position=o.attributes.position,this.attributes.normal=o.attributes.normal,this.attributes.uv=o.attributes.uv;const l=new T,n=new T,h=new T(e,t,a).divideScalar(2).subScalar(s),m=this.attributes.position.array,w=this.attributes.normal.array,f=this.attributes.uv.array,_=m.length/6,u=new T,P=.5/r;for(let p=0,c=0;p<m.length;p+=3,c+=2)switch(l.fromArray(m,p),n.copy(l),n.x-=Math.sign(n.x)*P,n.y-=Math.sign(n.y)*P,n.z-=Math.sign(n.z)*P,n.normalize(),m[p+0]=h.x*Math.sign(l.x)+n.x*s,m[p+1]=h.y*Math.sign(l.y)+n.y*s,m[p+2]=h.z*Math.sign(l.z)+n.z*s,w[p+0]=n.x,w[p+1]=n.y,w[p+2]=n.z,Math.floor(p/_)){case 0:u.set(1,0,0),f[c+0]=A(u,n,"z","y",s,a),f[c+1]=1-A(u,n,"y","z",s,t);break;case 1:u.set(-1,0,0),f[c+0]=1-A(u,n,"z","y",s,a),f[c+1]=1-A(u,n,"y","z",s,t);break;case 2:u.set(0,1,0),f[c+0]=1-A(u,n,"x","z",s,e),f[c+1]=A(u,n,"z","x",s,a);break;case 3:u.set(0,-1,0),f[c+0]=1-A(u,n,"x","z",s,e),f[c+1]=1-A(u,n,"z","x",s,a);break;case 4:u.set(0,0,1),f[c+0]=1-A(u,n,"x","y",s,e),f[c+1]=1-A(u,n,"y","x",s,t);break;case 5:u.set(0,0,-1),f[c+0]=A(u,n,"x","y",s,e),f[c+1]=1-A(u,n,"y","x",s,t);break}}static fromJSON(e){return new We(e.width,e.height,e.depth,e.segments,e.radius)}}export{W as C,Ut as E,Te as F,kt as O,H as P,Ft as R,G as S,fe as U,Ge as a,We as b,zt as c,Et as d};
//# sourceMappingURL=RoundedBoxGeometry-bOjqzgal.js.map
