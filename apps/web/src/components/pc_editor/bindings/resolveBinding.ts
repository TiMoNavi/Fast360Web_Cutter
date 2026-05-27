import { defaultPcEditorBindings } from "./defaultBindings";
import type { PcEditorBinding, PcEditorTriggerDescriptor } from "./bindingTypes";

function modifiersMatch(binding: PcEditorBinding, trigger: PcEditorTriggerDescriptor) {
  const expected = binding.trigger.modifiers;

  if (!expected) {
    return true;
  }

  const actual = trigger.modifiers ?? {};
  return (
    Boolean(expected.alt) === Boolean(actual.alt) &&
    Boolean(expected.ctrl) === Boolean(actual.ctrl) &&
    Boolean(expected.meta) === Boolean(actual.meta) &&
    Boolean(expected.shift) === Boolean(actual.shift)
  );
}

export function bindingMatchesTrigger(binding: PcEditorBinding, trigger: PcEditorTriggerDescriptor) {
  return (
    binding.trigger.kind === trigger.kind &&
    binding.trigger.target === trigger.target &&
    binding.trigger.action === trigger.action &&
    modifiersMatch(binding, trigger)
  );
}

export function resolvePcEditorBinding(
  trigger: PcEditorTriggerDescriptor,
  bindings: PcEditorBinding[] = defaultPcEditorBindings
) {
  return bindings.find((binding) => bindingMatchesTrigger(binding, trigger)) ?? null;
}
