"use client";

type ThreeOfficialArwesModulePopupProps = {
  fov: number;
  openModule: string | null;
};

function moduleBody(openModule: string | null) {
  if (openModule === "FOV") {
    return "fine tune the viewfinder without leaving the desk";
  }
  if (openModule === "WORKFLOW") {
    return "record, seal, and render this crop path";
  }
  if (openModule === "FX") {
    return "fast effect marks stay close to the edit hand";
  }
  if (openModule === "BGM") {
    return "music state lives here before export binding";
  }
  if (openModule === "SESSION") {
    return "session and backend state stay above the table";
  }
  return "module layer floats above the main desk";
}

export function ThreeOfficialArwesModulePopup({ fov, openModule }: ThreeOfficialArwesModulePopupProps) {
  return (
    <div className="three-official-arwes-popup-inner">
      <div className="three-official-arwes-popup-chrome">
        <span />
        <span />
        <strong>{openModule ?? "MODULE"} LAYER</strong>
        <button data-popup-close="true" type="button">
          CLOSE
        </button>
      </div>
      <p>{moduleBody(openModule)}</p>
      <div className="three-official-arwes-popup-grid">
        {openModule === "FOV" ? (
          <>
            <span>right grip drag</span>
            <span>right stick fov</span>
            <span>left grip mask</span>
            <span>right stick mask</span>
            <span>current {fov}</span>
          </>
        ) : openModule === "WORKFLOW" ? (
          <>
            <button data-action="START_CROP" type="button">
              START
            </button>
            <button data-action="END_CROP" type="button">
              END
            </button>
            <button data-action="RENDER" type="button">
              RENDER
            </button>
            <button data-action="SAVE" type="button">
              SAVE
            </button>
          </>
        ) : openModule === "FX" ? (
          <>
            <button data-action="EFFECT_BLACK" type="button">
              BLACK
            </button>
            <button data-action="EFFECT_WHITE" type="button">
              WHITE
            </button>
            <button data-action="EFFECT_VHS" type="button">
              VHS
            </button>
          </>
        ) : openModule === "BGM" ? (
          <>
            <button data-action="BGM_AMBIENT" type="button">
              AMBIENT
            </button>
            <button data-action="BGM_KICK" type="button">
              KICK
            </button>
            <button data-action="BGM_PREVIEW" type="button">
              PREVIEW
            </button>
            <button data-action="BGM_NONE" type="button">
              SILENT
            </button>
          </>
        ) : (
          <>
            <button data-action="CUT" type="button">
              CUT
            </button>
            <button data-action="LOCK" type="button">
              LOCK
            </button>
            <button data-action="START_CROP" type="button">
              START
            </button>
          </>
        )}
      </div>
    </div>
  );
}
