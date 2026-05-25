'use client';

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="xr-videos-page">
      {/* Background Effects */}
      <div className="xr-videos-scanlines" />
      <div className="xr-videos-sun" />
      <div className="xr-videos-grid-floor" />

      {/* Hero Section - Full Screen (outside shell) */}
      <section style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 'clamp(20px, 5vw, 60px)',
        zIndex: 1
      }}>
        <div style={{ maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          <div style={{ marginBottom: 'clamp(2rem, 4vw, 4rem)' }}>
            <p style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: 'clamp(0.9rem, 2vw, 1.1rem)',
              marginBottom: '1rem',
              color: '#FF00FF',
              textTransform: 'uppercase',
              letterSpacing: '0.2em'
            }}>&gt; 一眼成片_SYSTEM</p>
            <h1 style={{
              fontFamily: '"Orbitron", sans-serif',
              fontSize: 'clamp(3rem, 12vw, 8rem)',
              marginBottom: '1.5rem',
              lineHeight: 1,
              fontWeight: 900,
              background: 'linear-gradient(to right, #FF9900, #FF00FF, #00FFFF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 30px rgba(255, 0, 255, 0.8))',
              textTransform: 'uppercase'
            }}>
              一眼成片
            </h1>
            <h2 style={{
              fontFamily: '"Orbitron", sans-serif',
              fontSize: 'clamp(1.2rem, 4vw, 2.5rem)',
              color: '#00FFFF',
              marginBottom: '2rem',
              fontWeight: 700,
              filter: 'drop-shadow(0 0 20px rgba(0, 255, 255, 0.8))',
              letterSpacing: '0.05em'
            }}>
              极其轻量的 WEB XR 360° 视频剪辑器
            </h2>
            <p style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: 'clamp(1rem, 2vw, 1.2rem)',
              lineHeight: 1.8,
              maxWidth: '800px',
              marginBottom: '3rem',
              color: '#E0E0E0'
            }}>
              &gt; 戴上头显，欣赏一遍视频，就能快速成片。<br />
              &gt; 你的头就是摄像机，转头运镜，手柄加特效，一遍过完成剪辑。
            </p>

            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <Link href="/xr/player" style={{
                display: 'inline-block',
                padding: '1rem 2.5rem',
                border: '2px solid #FF00FF',
                background: '#FF00FF',
                color: '#fff',
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: '0.9rem',
                fontWeight: 800,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                transform: 'skewX(-12deg)',
                transition: 'all 200ms linear',
                boxShadow: '0 0 20px rgba(255, 0, 255, 0.5)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'skewX(0deg) translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 0 40px rgba(255, 0, 255, 1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'skewX(-12deg)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 0, 255, 0.5)';
              }}>
                <span style={{ display: 'inline-block', transform: 'skewX(12deg)' }}>开始体验</span>
              </Link>
              <Link href="/xr/videos" style={{
                display: 'inline-block',
                padding: '1rem 2.5rem',
                border: '2px solid #00FFFF',
                background: 'transparent',
                color: '#00FFFF',
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: '0.9rem',
                fontWeight: 800,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                transform: 'skewX(-12deg)',
                transition: 'all 200ms linear'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'skewX(0deg)';
                e.currentTarget.style.background = '#00FFFF';
                e.currentTarget.style.color = '#000';
                e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 255, 255, 0.8)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'skewX(-12deg)';
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#00FFFF';
                e.currentTarget.style.boxShadow = 'none';
              }}>
                <span style={{ display: 'inline-block', transform: 'skewX(12deg)' }}>视频库</span>
              </Link>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1.5rem',
            maxWidth: '700px'
          }}>
            <div style={{
              padding: '1.5rem',
              border: '2px solid #00FFFF',
              borderTop: '3px solid #00FFFF',
              background: 'rgba(0, 255, 255, 0.05)',
              backdropFilter: 'blur(10px)',
              textAlign: 'center',
              boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)',
              transition: 'all 200ms linear'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 0 40px rgba(0, 255, 255, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.3)';
            }}>
              <div style={{
                fontFamily: '"Orbitron", sans-serif',
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                fontWeight: 900,
                color: '#00FFFF',
                marginBottom: '0.5rem',
                filter: 'drop-shadow(0 0 10px rgba(0, 255, 255, 0.8))'
              }}>PC + VR</div>
              <div style={{
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: 'clamp(0.8rem, 1.5vw, 0.9rem)',
                color: '#E0E0E0',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}>双端支持</div>
            </div>
            <div style={{
              padding: '1.5rem',
              border: '2px solid #FF00FF',
              borderTop: '3px solid #FF00FF',
              background: 'rgba(255, 0, 255, 0.05)',
              backdropFilter: 'blur(10px)',
              textAlign: 'center',
              boxShadow: '0 0 20px rgba(255, 0, 255, 0.3)',
              transition: 'all 200ms linear'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 0 40px rgba(255, 0, 255, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 0, 255, 0.3)';
            }}>
              <div style={{
                fontFamily: '"Orbitron", sans-serif',
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                fontWeight: 900,
                color: '#FF00FF',
                marginBottom: '0.5rem',
                filter: 'drop-shadow(0 0 10px rgba(255, 0, 255, 0.8))'
              }}>WEB XR</div>
              <div style={{
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: 'clamp(0.8rem, 1.5vw, 0.9rem)',
                color: '#E0E0E0',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}>全平台</div>
            </div>
            <div style={{
              padding: '1.5rem',
              border: '2px solid #FF9900',
              borderTop: '3px solid #FF9900',
              background: 'rgba(255, 153, 0, 0.05)',
              backdropFilter: 'blur(10px)',
              textAlign: 'center',
              boxShadow: '0 0 20px rgba(255, 153, 0, 0.3)',
              transition: 'all 200ms linear'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 0 40px rgba(255, 153, 0, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 153, 0, 0.3)';
            }}>
              <div style={{
                fontFamily: '"Orbitron", sans-serif',
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                fontWeight: 900,
                color: '#FF9900',
                marginBottom: '0.5rem',
                filter: 'drop-shadow(0 0 10px rgba(255, 153, 0, 0.8))'
              }}>一遍过</div>
              <div style={{
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: 'clamp(0.8rem, 1.5vw, 0.9rem)',
                color: '#E0E0E0',
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}>边看边剪</div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Shell */}
      <div className="xr-videos-shell">

        {/* Features Section */}
        <section className="xr-videos-terminal" style={{ padding: '6rem 0' }}>
          <div className="xr-videos-section-heading">
            <div>
              <p className="xr-videos-command">&gt; CORE_FEATURES</p>
              <h2>核心特性</h2>
            </div>
          </div>

          <div className="xr-videos-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '2rem', marginTop: '3rem' }}>
            <div className="xr-videos-card">
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; PC_EDITOR</p>
                  <h3>PC 端剪辑</h3>
                  <span style={{ marginTop: '1rem', display: 'block', lineHeight: 1.6 }}>
                    16:9 框实时预览，Ctrl 拖动调整运镜，Tab 快捷键切换特效。<br />
                    像技能连招，同时播放、运镜、特效、调参，一遍过完成剪辑。
                  </span>
                </div>
              </div>
            </div>

            <div className="xr-videos-card">
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; VR_EDITOR</p>
                  <h3>VR 端剪辑</h3>
                  <span style={{ marginTop: '1rem', display: 'block', lineHeight: 1.6 }}>
                    你的头就是摄像机，转头看哪里，运镜就走到哪里。<br />
                    松发快捷面板：按住扳机展开，手柄指向选项，松开应用特效。
                  </span>
                </div>
              </div>
            </div>

            <div className="xr-videos-card">
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LIVE_RENDER</p>
                  <h3>边看边渲染</h3>
                  <span style={{ marginTop: '1rem', display: 'block', lineHeight: 1.6 }}>
                    剪后面的时候，系统已经在渲染前面。<br />
                    看完视频，成片已经好了，自动存到收藏页，手机电脑都能下载。
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* XR Core Section */}
        <section className="xr-videos-terminal">
          <div className="xr-videos-section-heading">
            <div>
              <p className="xr-videos-command">&gt; XR_CORE</p>
              <h2>XR 核心功能</h2>
            </div>
          </div>

          <div className="xr-videos-grid">
            <Link href="/xr/hello" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>XR</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#01</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; WEBXR</p>
                  <h3>第一个 WebXR</h3>
                  <span>运行基础 WebXR 场景</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/player" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>360</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#02</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; PLAYER</p>
                  <h3>WebXR 播放器</h3>
                  <span>360° 视频播放</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/videos" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>VID</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#03</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LIBRARY</p>
                  <h3>XR 视频列表</h3>
                  <span>WebXR 视频库</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/login" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>LOG</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#04</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; AUTH</p>
                  <h3>XR 登录</h3>
                  <span>VR 环境登录界面</span>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* XR Labs Section */}
        <section className="xr-videos-terminal">
          <div className="xr-videos-section-heading">
            <div>
              <p className="xr-videos-command">&gt; XR_LABS</p>
              <h2>XR 实验室</h2>
            </div>
            <span>实验性功能</span>
          </div>

          <div className="xr-videos-grid">
            <Link href="/xr/player-ui-lab" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>UI</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L1</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>播放器 UI 实验室</h3>
                  <span>UI 组件测试</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/quest-spatial-editor-probe" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>EDT</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L2</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>空间编辑器探针</h3>
                  <span>Quest 空间编辑</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/arwes-workbench-plane-lab" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>ARW</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L3</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>Arwes 平面实验室</h3>
                  <span>Arwes UI 框架测试</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/three-official-interactive-lab" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>3JS</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L4</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>Three.js 交互实验室</h3>
                  <span>官方交互示例</span>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Mobile Section */}
        <section className="xr-videos-terminal">
          <div className="xr-videos-section-heading">
            <div>
              <p className="xr-videos-command">&gt; MOBILE_APP</p>
              <h2>移动端功能</h2>
            </div>
          </div>

          <div className="xr-videos-grid">
            <Link href="/mobile/login" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>LOG</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#M1</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; AUTH</p>
                  <h3>登录/注册</h3>
                  <span>移动端认证</span>
                </div>
              </div>
            </Link>

            <Link href="/mobile/videos" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>VID</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#M2</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LIBRARY</p>
                  <h3>视频列表</h3>
                  <span>移动端视频管理</span>
                </div>
              </div>
            </Link>

            <Link href="/mobile/favorites" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>FAV</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#M3</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; FAVORITES</p>
                  <h3>收藏夹</h3>
                  <span>收藏的视频</span>
                </div>
              </div>
            </Link>

            <Link href="/mobile/account/settings" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>SET</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#M4</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; SETTINGS</p>
                  <h3>账户设置</h3>
                  <span>个人设置管理</span>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Footer CTA Section */}
        <section className="xr-videos-terminal" style={{ padding: '6rem 0', textAlign: 'center' }}>
          <div className="xr-videos-section-heading" style={{ marginBottom: '3rem' }}>
            <div>
              <p className="xr-videos-command">&gt; GET_STARTED</p>
              <h2>开始体验</h2>
            </div>
          </div>

          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <p style={{ fontSize: '1.1rem', lineHeight: 1.8, marginBottom: '2rem', color: 'var(--xr-videos-muted)' }}>
              看一遍，就能发。让 360° 视频剪辑变得简单。
            </p>
            <div className="xr-videos-actions" style={{ justifyContent: 'center' }}>
              <Link href="/xr/player" className="xr-videos-button xr-videos-button-primary">
                <span>立即体验</span>
              </Link>
              <Link href="/mobile/login" className="xr-videos-button">
                <span>登录账户</span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
