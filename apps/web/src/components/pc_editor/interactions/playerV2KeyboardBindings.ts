import { defaultPcEditorBindings } from "../bindings";
import type { PcEditorBinding } from "../bindings";

const disabledPlayerV2KeyboardBindingIds = new Set([
  "viewport.fov.decrease.keyboard",
  "viewport.fov.increase.keyboard",
  "viewport.pitch.decrease.keyboard",
  "viewport.pitch.increase.keyboard",
  "viewport.yaw.decrease.keyboard",
  "viewport.yaw.increase.keyboard"
]);

const effectShortcutDigitBindings: PcEditorBinding[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((digit) => {
  const key = String(digit);

  return [
    {
      id: `effects.shortcut.${key}.keydown`,
      trigger: { action: "keydown", kind: "keyboard", target: `Digit${key}` },
      event: { type: "editor.effects.shortcut.key.down", payload: { key } },
      ignoreRepeat: true,
      preventDefault: true,
      stopPropagation: true
    },
    {
      id: `effects.shortcut.${key}.keyup`,
      trigger: { action: "keyup", kind: "keyboard", target: `Digit${key}` },
      event: { type: "editor.effects.shortcut.key.up", payload: { key } },
      preventDefault: true,
      stopPropagation: true
    }
  ];
});

const effectShortcutBindings: PcEditorBinding[] = [
  {
    id: "effects.shortcut.open.keyboard",
    trigger: { action: "keydown", kind: "keyboard", target: "Tab" },
    event: { type: "editor.effects.shortcut.open" },
    ignoreRepeat: true,
    preventDefault: true,
    stopPropagation: true
  },
  ...effectShortcutDigitBindings
];

export const playerV2KeyboardBindings: PcEditorBinding[] = [
  ...defaultPcEditorBindings.filter((binding) => {
  if (binding.trigger.kind !== "keyboard") {
    return false;
  }

  return !disabledPlayerV2KeyboardBindingIds.has(binding.id);
  }),
  ...effectShortcutBindings
];
