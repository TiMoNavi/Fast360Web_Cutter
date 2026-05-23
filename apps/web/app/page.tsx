import Link from "next/link";

export default function HomePage() {
  return (
    <div className="xr-videos-page">
      {/* Background Effects */}
      <div className="xr-videos-scanlines" />
      <div className="xr-videos-sun" />
      <div className="xr-videos-grid-floor" />

      <div className="xr-videos-shell">
        {/* Hero Section */}
        <section className="xr-videos-hero">
          <div className="xr-videos-window-chrome">
            <div className="xr-videos-window-dots">
              <span />
              <span />
              <span />
            </div>
            <p>SYSTEM.INIT</p>
          </div>

          <div className="xr-videos-hero-body">
            <div className="xr-videos-hero-copy">
              <p className="xr-videos-command">&gt; THE INVISIBLE DIRECTOR</p>
              <h1>
                WebXR <span>本地开发</span>
              </h1>
              <p>
                这是最简 Web 界面，用来确认 Next.js 开发环境、路由和浏览器访问都能正常打开。
              </p>

              <div className="xr-videos-actions">
                <Link href="/mobile/login" className="xr-videos-button xr-videos-button-primary">
                  <span>登录/注册</span>
                </Link>
                <Link href="/xr/videos" className="xr-videos-button">
                  <span>WebXR 视频列表</span>
                </Link>
              </div>
            </div>

            <div className="xr-videos-stats">
              <div>
                <span>6</span>
                <p>可用路由</p>
              </div>
              <div>
                <span>100%</span>
                <p>系统就绪</p>
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

            <Link href="/xr/dev-check" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>CHK</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#02</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; DIAGNOSTIC</p>
                  <h3>WebXR 检测</h3>
                  <span>设备兼容性检查</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/player" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>360</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#03</div>
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
                <div className="xr-videos-index">#04</div>
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
                <div className="xr-videos-index">#05</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; AUTH</p>
                  <h3>XR 登录</h3>
                  <span>VR 环境登录界面</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/aframe-player" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>AFR</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#06</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; AFRAME</p>
                  <h3>AFrame 播放器</h3>
                  <span>基于 A-Frame 的播放器</span>
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
            <Link href="/xr/workbench" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>WRK</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L1</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>工作台</h3>
                  <span>XR 开发工作台</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/playback-lab" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>PLY</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L2</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>播放实验室</h3>
                  <span>播放功能测试</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/player-ui-lab" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>UI</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L3</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>播放器 UI 实验室</h3>
                  <span>UI 组件测试</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/quest-workbench-lab" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>QST</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L4</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>Quest 工作台</h3>
                  <span>Quest 设备测试</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/quest-spatial-editor-probe" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>EDT</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L5</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>空间编辑器探针</h3>
                  <span>Quest 空间编辑</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/quest-spatial-ui-prototype" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>SUI</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L6</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>空间 UI 原型</h3>
                  <span>Quest 空间界面</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/arwes-workbench-plane-lab" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>ARW</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L7</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>Arwes 平面实验室</h3>
                  <span>Arwes UI 框架测试</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/arwes-workbench-spatial-lab" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>ARS</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L8</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; LAB</p>
                  <h3>Arwes 空间实验室</h3>
                  <span>空间 UI 框架</span>
                </div>
              </div>
            </Link>

            <Link href="/xr/three-official-interactive-lab" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>3JS</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#L9</div>
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

            <Link href="/mobile/account/exports" className="xr-videos-card">
              <div className="xr-videos-card-cover">
                <div className="xr-videos-cover-placeholder">
                  <span>EXP</span>
                </div>
                <div className="xr-videos-cover-overlay" />
                <div className="xr-videos-index">#M5</div>
              </div>
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; EXPORTS</p>
                  <h3>导出管理</h3>
                  <span>视频导出记录</span>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* System Status Section */}
        <section className="xr-videos-terminal">
          <div className="xr-videos-section-heading">
            <div>
              <p className="xr-videos-command">&gt; SYSTEM_STATUS</p>
              <h2>系统状态</h2>
            </div>
          </div>

          <div className="xr-videos-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
            <div className="xr-videos-card">
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; VERIFIED</p>
                  <h3>当前可验证</h3>
                </div>
                <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                  <div style={{ padding: '8px 10px', background: 'rgba(0, 255, 255, 0.08)', border: '1px solid rgba(0, 255, 255, 0.3)', color: 'var(--xr-videos-cyan)' }}>
                    ✓ Next.js 页面渲染
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(0, 255, 255, 0.08)', border: '1px solid rgba(0, 255, 255, 0.3)', color: 'var(--xr-videos-cyan)' }}>
                    ✓ 本地浏览器访问
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(0, 255, 255, 0.08)', border: '1px solid rgba(0, 255, 255, 0.3)', color: 'var(--xr-videos-cyan)' }}>
                    ✓ 局域网 host 启动
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(0, 255, 255, 0.08)', border: '1px solid rgba(0, 255, 255, 0.3)', color: 'var(--xr-videos-cyan)' }}>
                    ✓ TypeScript 构建检查
                  </div>
                </div>
              </div>
            </div>

            <div className="xr-videos-card">
              <div className="xr-videos-card-body">
                <div className="xr-videos-card-title">
                  <p className="xr-videos-command">&gt; NEXT_PHASE</p>
                  <h3>下一步再接</h3>
                </div>
                <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                  <div style={{ padding: '8px 10px', background: 'rgba(255, 0, 255, 0.08)', border: '1px solid rgba(255, 0, 255, 0.3)', color: 'var(--xr-videos-magenta)' }}>
                    → Three.js 360 预览
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(255, 0, 255, 0.08)', border: '1px solid rgba(255, 0, 255, 0.3)', color: 'var(--xr-videos-magenta)' }}>
                    → WebXR immersive-vr
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(255, 0, 255, 0.08)', border: '1px solid rgba(255, 0, 255, 0.3)', color: 'var(--xr-videos-magenta)' }}>
                    → 本地 360 视频加载
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(255, 0, 255, 0.08)', border: '1px solid rgba(255, 0, 255, 0.3)', color: 'var(--xr-videos-magenta)' }}>
                    → Quest 浏览器手柄输入
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
