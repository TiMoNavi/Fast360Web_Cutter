import { cookies } from "next/headers";
import { AuthForm } from "@/components/AuthForm";
import { MobileLoginAutoScroll } from "@/components/mobile/MobileLoginAutoScroll";
import { PlayerV2 } from "@/components/pc_editor/Aframe/player-v2";
import { buildPcEditorPlayerModel } from "@/components/pc_editor/data/buildPcEditorSessionModel";

export default async function PlayerV2Page() {
  const cookieHeader = (await cookies()).toString();
  let model = null;
  let error = null;

  try {
    model = await buildPcEditorPlayerModel(cookieHeader);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Failed to load";
    if (error === "Not authenticated") {
      return <PlayerV2LoginFallback />;
    }
  }

  if (error || !model) {
    return <div>Error: {error}</div>;
  }

  return <PlayerV2 model={model} />;
}

function PlayerV2LoginFallback() {
  return (
    <main className="mobile-auth-page">
      <MobileLoginAutoScroll />
      <div className="auth-ambient" aria-hidden="true">
        <span className="auth-blob auth-blob-primary" />
        <span className="auth-blob auth-blob-secondary" />
        <span className="auth-blob auth-blob-tertiary" />
        <span className="auth-grid" />
      </div>

      <section className="mobile-auth-layout">
        <div className="mobile-auth-story" id="mobile-auth-story">
          <div className="mobile-auth-brand">
            <span>ID</span>
            <div>
              <strong>Invisible Director</strong>
              <p>WebXR player access</p>
            </div>
          </div>

          <div className="mobile-auth-copy">
            <p className="auth-kicker">VR native 360 editing</p>
            <h1>
              Player V2
              <span> ready after login.</span>
            </h1>
            <p>Sign in or register here, then this same URL will open the immersive 360 editor.</p>
          </div>
        </div>

        <div className="mobile-auth-form-column" id="mobile-auth-form">
          <div className="mobile-auth-form-card">
            <div className="auth-card-header">
              <div>
                <p>Secure access</p>
                <h2>Login or register</h2>
              </div>
              <span>Quest Ready</span>
            </div>
            <AuthForm nextPath="/xr/player-v2" />
          </div>
        </div>
      </section>
    </main>
  );
}
